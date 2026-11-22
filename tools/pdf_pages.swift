// Render each page of a PDF to a PNG, and print each page's size in points.
//   swift tools/pdf_pages.swift <file.pdf> <out folder> [scale]
// Used to look at a recipe PDF, or at a marked-up one that came back from the tablet, page by page.
import AppKit
import Foundation
import PDFKit

let args = CommandLine.arguments
guard args.count >= 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
    FileHandle.standardError.write("usage: pdf_pages.swift <file.pdf> <out folder> [scale]\n".data(using: .utf8)!)
    exit(2)
}
let outDir = URL(fileURLWithPath: args[2], isDirectory: true)
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let scale = args.count > 3 ? (Double(args[3]) ?? 2.0) : 2.0
let stem = URL(fileURLWithPath: args[1]).deletingPathExtension().lastPathComponent

for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let box = page.bounds(for: .mediaBox)
    let w = Int((box.width * scale).rounded()), h = Int((box.height * scale).rounded())
    guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8, samplesPerPixel: 4,
                                     hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
          let ctx = NSGraphicsContext(bitmapImageRep: rep) else { continue }
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = ctx
    let cg = ctx.cgContext
    cg.setFillColor(NSColor.white.cgColor)
    cg.fill(CGRect(x: 0, y: 0, width: w, height: h))
    cg.scaleBy(x: scale, y: scale)
    page.draw(with: .mediaBox, to: cg)
    NSGraphicsContext.restoreGraphicsState()
    let out = outDir.appendingPathComponent("\(stem) p\(i + 1).png")
    if let data = rep.representation(using: .png, properties: [:]) {
        try? data.write(to: out)
    }
    let text = (page.string ?? "").split(separator: "\n").last.map(String.init) ?? ""
    print("page \(i + 1) of \(doc.pageCount): \(String(format: "%.1f x %.1f pt", box.width, box.height))  last line: \(text)  -> \(out.path)")
}
