// Plays an audio file through the app's own Dictation class in place of the microphone, then prints what came out.
// check-dictation.sh compiles it with Dictation.swift. Usage: dictation-check <audio file> <expected phrase>...
import AVFoundation

final class FileDictation: Dictation {
  let file: AVAudioFile
  init(file: AVAudioFile, send: @escaping ([String: Any]) -> Void) {
    self.file = file
    super.init(send: send)
  }
  override func openAudio() async throws -> AVAudioFormat { file.processingFormat }
  /// Feeds the file in 100 ms buffers at four times real speed, then stops, as a person selecting Stop would.
  override func runAudio(_ feed: @escaping (AVAudioPCMBuffer) -> Void) throws {
    let file = self.file
    let stop = { DispatchQueue.main.async { MainActor.assumeIsolated { self.stop() } } }
    Thread.detachNewThread {
      let chunk = AVAudioFrameCount(file.processingFormat.sampleRate / 10)
      while let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: chunk),
            (try? file.read(into: buffer)) != nil, buffer.frameLength > 0 {
        feed(buffer)
        usleep(25_000)
      }
      stop()
    }
  }
  override func closeAudio() {}
}

@main
struct Check {
  static func main() async throws {
    let args = CommandLine.arguments
    var states: [String] = []
    var updates = 0
    var end: [String: Any]?
    let started = Date()
    var firstText: TimeInterval?
    let dictation = FileDictation(file: try AVAudioFile(forReading: URL(fileURLWithPath: args[1]))) { event in
      if let state = event["state"] as? String { states.append(state) }
      if event["text"] != nil && event["state"] == nil {
        updates += 1
        if firstText == nil { firstText = Date().timeIntervalSince(started) }
      }
      if event["state"] as? String == "idle" || event["state"] as? String == "error" { end = event }
    }
    dictation.start()
    while end == nil && Date().timeIntervalSince(started) < 120 { try await Task.sleep(for: .milliseconds(50)) }
    let text = end?["text"] as? String ?? ""
    let missing = args.dropFirst(2).filter { !text.localizedCaseInsensitiveContains($0) }
    print("states: \(states.joined(separator: " > "))")
    print(String(format: "text updates: %d, first after %.1f s, end after %.1f s", updates, firstText ?? -1, Date().timeIntervalSince(started)))
    print("text: \(text)")
    if let error = end?["error"] { print("error: \(error)") }
    let ok = states.first == "starting" && states.contains("listening") && states.last == "idle" && updates > 1 && missing.isEmpty
    print(ok ? "PASS" : "FAIL\(missing.isEmpty ? "" : ": missing \(missing.joined(separator: ", "))")")
    exit(ok ? 0 : 1)
  }
}
