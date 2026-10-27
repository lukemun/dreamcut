import AppKit
import Foundation
import Vision

struct Frame: Codable {
  let frame_id: String
  let image_path: String
  let pts: String
  let time_base_num: Int
  let time_base_den: Int
}

struct Box: Codable {
  let label: String
  let confidence: Float
  let x: Double
  let y: Double
  let width: Double
  let height: Double
}

struct Result: Codable {
  let frame_id: String
  let image_path: String
  let pts: String
  let time_base_num: Int
  let time_base_den: Int
  let boxes: [Box]
}

let decoder = JSONDecoder()
let encoder = JSONEncoder()

while let line = readLine() {
  guard let data = line.data(using: .utf8), let frame = try? decoder.decode(Frame.self, from: data) else { continue }
  guard let image = NSImage(contentsOfFile: frame.image_path),
        let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }

  let faces = VNDetectFaceRectanglesRequest()
  faces.revision = VNDetectFaceRectanglesRequestRevision3
  let people = VNDetectHumanRectanglesRequest()
  people.upperBodyOnly = false
  people.revision = VNDetectHumanRectanglesRequestRevision2
  let handler = VNImageRequestHandler(cgImage: cgImage, orientation: .up)
  try? handler.perform([faces, people])

  var boxes: [Box] = []
  for observation in faces.results ?? [] {
    let b = observation.boundingBox
    boxes.append(Box(label: "face", confidence: observation.confidence, x: b.origin.x, y: 1.0 - b.origin.y - b.height, width: b.width, height: b.height))
  }
  for observation in people.results ?? [] {
    let b = observation.boundingBox
    boxes.append(Box(label: "person", confidence: observation.confidence, x: b.origin.x, y: 1.0 - b.origin.y - b.height, width: b.width, height: b.height))
  }
  let result = Result(frame_id: frame.frame_id, image_path: frame.image_path, pts: frame.pts, time_base_num: frame.time_base_num, time_base_den: frame.time_base_den, boxes: boxes)
  if let output = try? encoder.encode(result) { print(String(decoding: output, as: UTF8.self)) }
}
