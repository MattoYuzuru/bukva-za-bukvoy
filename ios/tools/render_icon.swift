import AppKit
import ImageIO
let source=URL(fileURLWithPath:CommandLine.arguments[1])
guard let image=NSImage(contentsOf:source) else { fatalError("SVG не удалось открыть") }
guard let context=CGContext(data:nil,width:1024,height:1024,bitsPerComponent:8,bytesPerRow:4096,space:CGColorSpaceCreateDeviceRGB(),bitmapInfo:CGImageAlphaInfo.noneSkipLast.rawValue) else { fatalError("Не удалось создать холст") }
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current=NSGraphicsContext(cgContext:context,flipped:false)
NSColor(calibratedRed:245.0/255,green:248.0/255,blue:242.0/255,alpha:1).setFill()
NSRect(x:0,y:0,width:1024,height:1024).fill()
image.draw(in:NSRect(x:96,y:96,width:832,height:832))
NSGraphicsContext.restoreGraphicsState()
guard let raster=context.makeImage(),let destination=CGImageDestinationCreateWithURL(URL(fileURLWithPath:CommandLine.arguments[2]) as CFURL,"public.png" as CFString,1,nil) else { fatalError("Не удалось сохранить PNG") }
CGImageDestinationAddImage(destination,raster,nil)
if !CGImageDestinationFinalize(destination) { fatalError("PNG не сохранён") }
print("PNG готов")
