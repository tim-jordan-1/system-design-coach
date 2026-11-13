// Draws the app icon: the "SD" mark from the coach's rail on a dark tile, on the macOS icon grid.
// Usage: icon <out.png>. build.sh turns the PNG into AppIcon.icns.
import AppKit

let size: CGFloat = 1024
let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8, samplesPerPixel: 4,
  hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

let tile = NSBezierPath(roundedRect: NSRect(x: 100, y: 100, width: 824, height: 824), xRadius: 185, yRadius: 185)
let shadow = NSShadow()
shadow.shadowColor = NSColor.black.withAlphaComponent(0.4)
shadow.shadowOffset = NSSize(width: 0, height: -12)
shadow.shadowBlurRadius = 28
NSGraphicsContext.saveGraphicsState()
shadow.set()
NSColor(srgbRed: 21 / 255, green: 26 / 255, blue: 34 / 255, alpha: 1).setFill() // --panel
tile.fill()
NSGraphicsContext.restoreGraphicsState()
NSColor(srgbRed: 52 / 255, green: 62 / 255, blue: 77 / 255, alpha: 1).setStroke() // the rail mark's border
tile.lineWidth = 8
tile.stroke()

let font = NSFont.monospacedSystemFont(ofSize: 300, weight: .semibold)
let mark = NSAttributedString(string: "SD", attributes: [
  .font: font,
  .foregroundColor: NSColor(srgbRed: 108 / 255, green: 182 / 255, blue: 255 / 255, alpha: 1), // --accent
])
// Centre the capitals, not the line box: the baseline sits half a cap height below the middle.
mark.draw(at: NSPoint(x: (size - mark.size().width) / 2, y: (size - font.capHeight) / 2 + font.descender))

NSGraphicsContext.restoreGraphicsState()
try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[1]))
