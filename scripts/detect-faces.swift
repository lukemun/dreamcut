import Foundation
import ImageIO
import Vision

struct FaceResult: Codable {
  let file: String
  let boxes: [[String: Double]]
  let error: String?
}

let files = Array(CommandLine.arguments.dropFirst())
var results: [FaceResult] = []
results.reserveCapacity(files.count)

for file in files {
  autoreleasepool {
    let url = URL(fileURLWithPath: file)
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
      results.append(FaceResult(file: file, boxes: [], error: "image_decode_failed"))
      return
    }
    let request = VNDetectFaceRectanglesRequest()
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
      try handler.perform([request])
      let boxes = (request.results ?? []).map { observation in
        let box = observation.boundingBox
        return [
          "x": box.origin.x,
          "y": 1 - box.origin.y - box.height,
          "width": box.width,
          "height": box.height,
          "confidence": Double(observation.confidence),
        ]
      }
      results.append(FaceResult(file: file, boxes: boxes, error: nil))
    } catch {
      results.append(FaceResult(file: file, boxes: [], error: String(describing: error)))
    }
  }
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys]
FileHandle.standardOutput.write(try encoder.encode(results))
