// Live dictation for the answer box. Apple's on-device SpeechTranscriber turns speech into text,
// so no audio leaves the Mac and none is saved. The microphone is on only between start() and stop().
// process/dictation-engine.md says why this engine and not DictationTranscriber or a custom language model.
import AVFoundation
import Speech

/// An error with a message for the person at the microphone.
struct DictationProblem: LocalizedError {
  let errorDescription: String?
  /// True when the fix is in System Settings, so the page offers to open it.
  let settings: Bool
  init(_ message: String, settings: Bool = false) {
    errorDescription = message
    self.settings = settings
  }
}

/// Sends events to the page: ["state": starting | downloading | listening], ["text": final, "volatile": draft],
/// ["level": 0...1], and exactly one end event per start(): ["state": "idle" | "error", "text": ...].
@MainActor
class Dictation {
  private enum Phase { case idle, starting, listening, stopping }
  private let send: ([String: Any]) -> Void
  private var phase = Phase.idle
  /// Goes up at each start() and cancel(), so work from an older session stops sending.
  private var session = 0
  private var analyzer: SpeechAnalyzer?
  private var input: AsyncStream<AnalyzerInput>.Continuation?
  private var results: Task<Void, Never>?
  private var finalText = ""
  private var volatileText = ""
  private let engine = AVAudioEngine()
  private var configChange: NSObjectProtocol?

  init(send: @escaping ([String: Any]) -> Void) { self.send = send }

  func start() {
    guard phase == .idle else { return }
    session += 1
    let mine = session
    phase = .starting
    finalText = ""
    volatileText = ""
    send(["state": "starting"])
    Task {
      do {
        try await begin(mine)
      } catch {
        end(mine, error: error)
      }
    }
  }

  /// Stops listening and sends the last words with the idle event.
  func stop() {
    switch phase {
    case .idle, .stopping: return
    case .starting: phase = .stopping // begin() sees this and ends without turning the microphone on
    case .listening:
      phase = .stopping
      finalize(session)
    }
  }

  /// Stops at once and sends nothing more, for a page reload or quit.
  func cancel() {
    guard phase != .idle else { return }
    session += 1
    teardown(abandon: true)
  }

  private func begin(_ mine: Int) async throws {
    guard SpeechTranscriber.isAvailable else { throw DictationProblem("This Mac cannot run on-device dictation.") }
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: .current) else {
      throw DictationProblem("On-device dictation does not support \(Locale.current.localizedString(forIdentifier: Locale.current.identifier) ?? Locale.current.identifier).")
    }
    let format = try await openAudio()
    let transcriber = SpeechTranscriber(locale: locale, preset: .progressiveTranscription)
    // The first request in each launch only reserves the locale, in under a second. A real download takes longer.
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      let notice = Task {
        try await Task.sleep(for: .seconds(1.5))
        if mine == session { send(["state": "downloading"]) }
      }
      defer { notice.cancel() }
      try await request.downloadAndInstall()
    }
    guard let modelFormat = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]),
          let converter = AVAudioConverter(from: format, to: modelFormat) else {
      throw DictationProblem("The speech model cannot read audio from this microphone.")
    }
    let analyzer = SpeechAnalyzer(modules: [transcriber], options: .init(priority: .userInitiated, modelRetention: .lingering))
    try await analyzer.prepareToAnalyze(in: modelFormat)
    guard mine == session else { return }
    if phase == .stopping { return end(mine, error: nil) }

    let (stream, input) = AsyncStream.makeStream(of: AnalyzerInput.self)
    self.analyzer = analyzer
    self.input = input
    results = Task {
      do {
        for try await result in transcriber.results {
          guard mine == session, phase != .idle else { return }
          let text = String(result.text.characters)
          if result.isFinal {
            finalText += text
            volatileText = ""
          } else {
            volatileText = text
          }
          send(["text": finalText, "volatile": volatileText])
        }
      } catch {
        end(mine, error: error)
      }
    }
    try await analyzer.start(inputSequence: stream)
    guard mine == session else { return }
    let send = self.send
    try runAudio(Self.feeder(converter: converter, to: modelFormat, into: input) { level in
      DispatchQueue.main.async { send(["level": level]) }
    })
    if phase == .stopping { return finalize(mine) }
    phase = .listening
    send(["state": "listening"])
  }

  private func finalize(_ mine: Int) {
    closeAudio()
    input?.finish()
    let analyzer = self.analyzer
    let results = self.results
    Task {
      try? await analyzer?.finalizeAndFinishThroughEndOfInput()
      await results?.value
      end(mine, error: nil)
    }
  }

  private func end(_ mine: Int, error: Error?) {
    guard mine == session, phase != .idle else { return }
    teardown(abandon: error != nil)
    let text = finalText + volatileText
    if let error {
      let problem = error as? DictationProblem
      send(["state": "error", "text": text, "settings": problem?.settings ?? false,
            "error": problem?.errorDescription ?? "Dictation stopped: \(error.localizedDescription)"])
    } else {
      send(["state": "idle", "text": text])
    }
  }

  private func teardown(abandon: Bool) {
    closeAudio()
    input?.finish()
    if abandon, let analyzer { Task { await analyzer.cancelAndFinishNow() } }
    analyzer = nil
    input = nil
    results = nil
    phase = .idle
  }

  // MARK: Audio source. dictation-check.swift overrides these three to play a file instead of the microphone.

  /// Asks for the microphone once, then returns its format.
  func openAudio() async throws -> AVAudioFormat {
    let allowed: Bool
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized: allowed = true
    case .notDetermined: allowed = await AVCaptureDevice.requestAccess(for: .audio)
    default: allowed = false
    }
    guard allowed else {
      throw DictationProblem("Microphone access is off for System Design Coach. Turn it on in System Settings, then select Dictate again.", settings: true)
    }
    let format = engine.inputNode.outputFormat(forBus: 0)
    guard format.sampleRate > 0, format.channelCount > 0 else { throw DictationProblem("No microphone is connected.") }
    return format
  }

  func runAudio(_ feed: @escaping (AVAudioPCMBuffer) -> Void) throws {
    engine.inputNode.installTap(onBus: 0, bufferSize: 4096, format: engine.inputNode.outputFormat(forBus: 0), block: Self.tap(feed))
    engine.prepare()
    try engine.start()
    // A headset that connects or disconnects stops the engine. Keep what was said and stop.
    configChange = NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.stop() }
    }
  }

  func closeAudio() {
    if let configChange { NotificationCenter.default.removeObserver(configChange) }
    configChange = nil
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
  }

  nonisolated static func tap(_ feed: @escaping (AVAudioPCMBuffer) -> Void) -> AVAudioNodeTapBlock { { buffer, _ in feed(buffer) } }

  /// Converts each audio buffer to the model's format and passes it on. Runs on the audio thread, so it is nonisolated.
  nonisolated static func feeder(converter: AVAudioConverter, to format: AVAudioFormat, into input: AsyncStream<AnalyzerInput>.Continuation,
                                 level: @escaping (Double) -> Void) -> (AVAudioPCMBuffer) -> Void {
    return { buffer in
      level(loudness(buffer))
      let frames = AVAudioFrameCount((Double(buffer.frameLength) * format.sampleRate / buffer.format.sampleRate).rounded(.up)) + 32
      guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return }
      var given = false
      var error: NSError?
      converter.convert(to: out, error: &error) { _, status in
        if given {
          status.pointee = .noDataNow
          return nil
        }
        given = true
        status.pointee = .haveData
        return buffer
      }
      if error == nil && out.frameLength > 0 { input.yield(AnalyzerInput(buffer: out)) }
    }
  }

  /// The buffer's loudness from 0 (-55 dBFS or quieter) to 1 (-10 dBFS or louder), for the level meter.
  nonisolated static func loudness(_ buffer: AVAudioPCMBuffer) -> Double {
    guard let samples = buffer.floatChannelData?[0], buffer.frameLength > 0 else { return 0 }
    var sum: Float = 0
    for i in 0..<Int(buffer.frameLength) { sum += samples[i] * samples[i] }
    let db = 20 * log10(max(sqrt(sum / Float(buffer.frameLength)), 1e-7))
    return Double(min(1, max(0, (db + 55) / 45)))
  }
}
