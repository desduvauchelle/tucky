import AppKit

// Draw at 2x while retaining 720 x 460 point dimensions for Finder.
let width = 720
let height = 460
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: width * 2,
    pixelsHigh: height * 2, bitsPerSample: 8, samplesPerPixel: 4,
    hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0)!
bitmap.size = NSSize(width: width, height: height)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
let context = NSGraphicsContext.current!.cgContext
context.translateBy(x: 0, y: CGFloat(height))
context.scaleBy(x: 1, y: -1)

func color(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat) -> NSColor {
    NSColor(srgbRed: r / 255, green: g / 255, blue: b / 255, alpha: 1)
}
color(247, 248, 244).setFill()
NSBezierPath(rect: NSRect(x: 0, y: 0, width: width, height: height)).fill()

func text(_ value: String, y: CGFloat, size: CGFloat, weight: NSFont.Weight,
          ink: NSColor) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: size, weight: weight),
        .foregroundColor: ink, .paragraphStyle: paragraph
    ]
    NSGraphicsContext.saveGraphicsState()
    // NSString drawing handles the flipped view coordinate convention.
    NSGraphicsContext.current = NSGraphicsContext(cgContext: context, flipped: true)
    (value as NSString).draw(in: NSRect(x: 30, y: y, width: 660, height: 50),
                            withAttributes: attrs)
    NSGraphicsContext.restoreGraphicsState()
}
text("TUCKY", y: 34, size: 12, weight: .bold, ink: color(80, 112, 84))
text("Make yourself at home.", y: 62, size: 30, weight: .semibold,
     ink: color(28, 42, 34))
text("Drag Tucky to Applications to install.", y: 111, size: 16,
     weight: .regular, ink: color(82, 94, 85))

color(223, 230, 219).setStroke()
let arrow = NSBezierPath()
arrow.lineWidth = 3
arrow.lineCapStyle = .round
arrow.move(to: NSPoint(x: 320, y: 234))
arrow.line(to: NSPoint(x: 400, y: 234))
arrow.move(to: NSPoint(x: 389, y: 223))
arrow.line(to: NSPoint(x: 400, y: 234))
arrow.line(to: NSPoint(x: 389, y: 245))
arrow.stroke()
text("Then open Tucky from Applications.", y: 355, size: 14,
     weight: .medium, ink: color(82, 94, 85))
text("Your thoughts, a little more organized.", y: 400, size: 12,
     weight: .regular, ink: color(112, 123, 114))
NSGraphicsContext.restoreGraphicsState()
try bitmap.representation(using: .png, properties: [:])!.write(
    to: URL(fileURLWithPath: CommandLine.arguments[1]))
