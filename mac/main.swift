// System Design Coach as a Mac app. It starts its own copy of the coach server, shows the coach in a window,
// and stops the server when the app quits. build.sh compiles it and puts the coach files in the bundle.
import Cocoa
import WebKit

/// Finder starts apps with only the system folders on PATH, so `node` and `claude` are missing there.
/// The login shell gives the PATH that Terminal uses. The usual install folders follow as a fallback.
func loginShellPath() -> String {
  let fallback = "/opt/homebrew/bin:/usr/local/bin:\(NSHomeDirectory())/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  let shell = Process()
  let out = Pipe()
  // Run only a shell that /etc/shells lists, so a changed $SHELL cannot start any other program.
  let listed = (try? String(contentsOfFile: "/etc/shells", encoding: .utf8))?.split(separator: "\n").map(String.init) ?? []
  let env = ProcessInfo.processInfo.environment["SHELL"] ?? ""
  shell.executableURL = URL(fileURLWithPath: listed.contains(env) ? env : "/bin/zsh")
  // Markers keep the PATH apart from anything that a shell startup file prints.
  shell.arguments = ["-lc", "printf '<<%s>>' \"$PATH\""]
  shell.standardInput = FileHandle.nullDevice
  shell.standardOutput = out
  shell.standardError = FileHandle.nullDevice
  guard (try? shell.run()) != nil else { return fallback }
  let deadline = Date().addingTimeInterval(5)
  while shell.isRunning && Date() < deadline { usleep(20_000) }
  if shell.isRunning {
    shell.terminate()
    return fallback
  }
  let text = String(decoding: out.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
  guard let open = text.range(of: "<<", options: .backwards), let close = text.range(of: ">>", options: .backwards), open.upperBound <= close.lowerBound else { return fallback }
  // Keep absolute folders only: an empty or relative entry would make node and claude run from the current folder.
  let dirs = text[open.upperBound..<close.lowerBound].split(separator: ":").filter { $0.hasPrefix("/") }.joined(separator: ":")
  return dirs.isEmpty ? fallback : "\(dirs):\(fallback)"
}

/// The one place that the app may show: the coach server that this app started. The page works only from
/// the full URL with its token, so the origin (scheme, host, port) is what the rest of the app checks.
struct ServerOrigin: Equatable {
  let port: Int

  /// Finds the coach URL in the server's output. The token stays in the URL, so only the app can load it.
  static func find(in output: String) -> (url: URL, origin: ServerOrigin)? {
    guard let r = output.range(of: #"http://127\.0\.0\.1:\d+/\?token=[0-9a-f]{64}"#, options: .regularExpression),
          let url = URL(string: String(output[r])), let port = url.port else { return nil }
    return (url, ServerOrigin(port: port))
  }

  func matches(scheme: String, host: String, port: Int?) -> Bool {
    scheme.lowercased() == "http" && host == "127.0.0.1" && port == self.port
  }

  func allows(_ url: URL?) -> Bool {
    guard let url else { return false }
    if url.absoluteString == "about:blank" { return true }
    return matches(scheme: url.scheme ?? "", host: url.host ?? "", port: url.port)
  }
}

/// Replaces the token in the server's lines before they go to the log file or the error box.
func redactToken(_ text: String) -> String {
  text.replacingOccurrences(of: #"token=[0-9a-f]{64}"#, with: "token=(hidden)", options: .regularExpression)
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
  let coach = Bundle.main.resourceURL!.appendingPathComponent("coach")
  let logURL = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/System Design Coach.log")
  var window: NSWindow!
  var web: WKWebView!
  var server: Process?
  var log: FileHandle?
  var path = ""
  var output = ""
  var loaded = false
  var origin: ServerOrigin?
  var launch: URL?
  var logPending = ""
  var opener: (URL) -> Void = { NSWorkspace.shared.open($0) }
  var quitting = false
  lazy var dictation = Dictation { [weak self] event in
    self?.web.callAsyncJavaScript("window.sdcDictation?.(e)", arguments: ["e": event], in: nil, in: .page, completionHandler: nil)
  }

  func applicationDidFinishLaunching(_ note: Notification) {
    NSApp.mainMenu = mainMenu()
    let config = WKWebViewConfiguration()
    config.userContentController.add(self, name: "sdc")
    web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = self
    web.uiDelegate = self
    web.isHidden = true // the dark window shows until the page paints, so it never flashes white
    let screen = NSScreen.main?.visibleFrame.size ?? NSSize(width: 1440, height: 900)
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: min(1440, screen.width), height: min(900, screen.height)),
      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = "System Design Coach"
    window.appearance = NSAppearance(named: .darkAqua)
    window.backgroundColor = NSColor(srgbRed: 14 / 255, green: 18 / 255, blue: 24 / 255, alpha: 1)
    window.minSize = NSSize(width: 960, height: 640)
    window.contentView = web
    window.center()
    window.setFrameAutosaveName("main")
    window.makeKeyAndOrderFront(nil)
    // Only the owner reads the log. O_NOFOLLOW stops a link at that path from sending the log elsewhere.
    let fd = open(logURL.path, O_WRONLY | O_CREAT | O_TRUNC | O_NOFOLLOW, 0o600)
    if fd >= 0 {
      fchmod(fd, 0o600) // O_CREAT sets the mode only for a new file; an older log can be 0644
      log = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
    }
    DispatchQueue.global().async {
      let path = loginShellPath()
      DispatchQueue.main.async {
        self.path = path
        self.startServer(port: 4319)
      }
    }
  }

  /// Port 4319 keeps the page's origin the same at each launch, so the page keeps its saved target role.
  /// If a server started in a terminal holds that port, the app takes any free port.
  func startServer(port: Int) {
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/usr/bin/env")
    p.arguments = ["node", coach.appendingPathComponent("server.mjs").path]
    var env = ProcessInfo.processInfo.environment
    env["NODE_OPTIONS"] = nil // a value that Finder or a login item set must not change what node runs
    env["NODE_PATH"] = nil
    output = ""
    logPending = ""
    env["PATH"] = path
    env["SDC_PORT"] = String(port)
    env["SDC_STOP_WITH_STDIN"] = "1"
    p.environment = env
    p.standardInput = Pipe()
    let out = Pipe()
    p.standardOutput = out
    p.standardError = out
    out.fileHandleForReading.readabilityHandler = { handle in
      let data = handle.availableData
      if data.isEmpty {
        handle.readabilityHandler = nil
        return
      }
      DispatchQueue.main.async { self.serverPrinted(data) }
    }
    p.terminationHandler = { proc in
      DispatchQueue.main.async { self.serverStopped(status: proc.terminationStatus, port: port) }
    }
    do {
      try p.run()
      server = p
    } catch {
      output = error.localizedDescription
      serverStopped(status: 1, port: 0)
    }
  }

  func serverPrinted(_ data: Data) {
    let text = String(decoding: data, as: UTF8.self)
    // The log gets whole lines, with the token hidden. A token that a read split in two is still hidden.
    logPending += text
    if let nl = logPending.lastIndex(of: "\n") {
      log?.write(Data(redactToken(String(logPending[...nl])).utf8))
      logPending = String(logPending[logPending.index(after: nl)...])
    }
    output = String((output + text).suffix(4000))
    guard !loaded, let found = ServerOrigin.find(in: output) else { return }
    loaded = true
    origin = found.origin
    launch = found.url
    web.load(URLRequest(url: found.url))
  }

  /// The window shows only the coach. Other http and https links open in the default browser.
  func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    let url = action.request.url
    if origin?.allows(url) == true {
      decisionHandler(.allow)
    } else {
      openExternally(url)
      decisionHandler(.cancel)
    }
  }

  func openExternally(_ url: URL?) {
    // Links to other programs on this Mac (another port on 127.0.0.1, localhost) are dropped, not opened.
    guard let url, ["http", "https"].contains(url.scheme?.lowercased()), let host = url.host?.lowercased() else { return }
    if host == "localhost" || host.hasSuffix(".localhost") || host.hasPrefix("127.") || host == "::1" || host == "0.0.0.0" { return }
    opener(url)
  }

  /// target=_blank and window.open: no new window, the link opens in the browser.
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    openExternally(action.request.url)
    return nil
  }

  /// The page has no use for the web microphone and camera, because dictation runs in the app.
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
    decisionHandler(.deny)
  }

  func serverStopped(status: Int32, port: Int) {
    if quitting { return }
    if !logPending.isEmpty { log?.write(Data(redactToken(logPending).utf8)); logPending = "" }
    if !loaded && port != 0 && status != 127 { return startServer(port: 0) } // port 4319 is taken
    loaded = false
    origin = nil
    let noNode = status == 127 // /usr/bin/env did not find node
    let alert = NSAlert()
    alert.messageText = noNode ? "Node is not installed" : "The coach server stopped"
    alert.informativeText = noNode
      ? "The coach needs Node 26 or later. Install it, for example with \"brew install node\". Then open the app again."
      : "\(redactToken(String(output.suffix(600))))\n\nThe full log is in ~/Library/Logs/System Design Coach.log."
    alert.addButton(withTitle: noNode ? "Quit" : "Restart")
    if !noNode { alert.addButton(withTitle: "Quit") }
    if alert.runModal() == .alertFirstButtonReturn && !noNode {
      startServer(port: 4319)
    } else {
      NSApp.terminate(nil)
    }
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    webView.isHidden = false
  }

  /// A new page has no dictation running, so the old one stops.
  func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
    dictation.cancel()
  }

  /// The page dropped the token from its address, so a plain reload could come back without it.
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    if let launch { webView.load(URLRequest(url: launch)) }
  }

  func trusted(_ message: WKScriptMessage) -> Bool {
    let o = message.frameInfo.securityOrigin
    return message.frameInfo.isMainFrame && origin?.matches(scheme: o.protocol, host: o.host, port: o.port) == true
  }

  /// Messages from the page. Only the coach page itself may send them, because one of them turns on the microphone.
  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard trusted(message) else { return }
    switch message.body as? String {
    case "login": signIn("--claudeai")
    case "login-console": signIn("--console")
    case "dictate-start": dictation.start()
    case "dictate-stop": dictation.stop()
    case "mic-settings":
      NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")!)
    default: break
    }
  }

  /// Anthropic's own sign-in runs in Terminal: `claude auth login` opens the sign-in page in the browser,
  /// and it can ask for a code there.
  /// `kind` is one of two fixed flags. The script sits in a new private folder, and it deletes itself.
  func signIn(_ kind: String) {
    guard kind == "--claudeai" || kind == "--console",
          let terminal = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.Terminal") else { return }
    let folder = FileManager.default.temporaryDirectory.appendingPathComponent("sdc-\(UUID().uuidString)")
    let script = folder.appendingPathComponent("Sign in to Claude.command")
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false, attributes: [.posixPermissions: 0o700])
      try "#!/bin/zsh -l\nrm -rf -- \"${0:h}\"\nclaude auth login \(kind)\n".write(to: script, atomically: true, encoding: .utf8)
      try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: script.path)
    } catch {
      return
    }
    NSWorkspace.shared.open([script], withApplicationAt: terminal, configuration: NSWorkspace.OpenConfiguration())
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

  func applicationWillTerminate(_ note: Notification) {
    quitting = true
    dictation.cancel()
    server?.terminate()
  }

  /// The app, Edit and Window menus. Without the Edit menu, Cmd+C and Cmd+V do nothing in the page.
  func mainMenu() -> NSMenu {
    let name = "System Design Coach"
    let appMenu = NSMenu()
    appMenu.addItem(withTitle: "About \(name)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
    appMenu.addItem(.separator())
    appMenu.addItem(withTitle: "Hide \(name)", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
    appMenu.addItem(withTitle: "Quit \(name)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
    let edit = NSMenu(title: "Edit")
    edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
    edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
    edit.addItem(.separator())
    edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
    edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
    edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
    edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
    let windowMenu = NSMenu(title: "Window")
    windowMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
    windowMenu.addItem(withTitle: "Close", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
    let menu = NSMenu()
    for sub in [appMenu, edit, windowMenu] {
      let item = NSMenuItem()
      item.submenu = sub
      menu.addItem(item)
    }
    NSApp.windowsMenu = windowMenu
    return menu
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
