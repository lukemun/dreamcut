import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import * as ort from "onnxruntime-web";

import type { DetectorBox, DetectorFrame, DetectorFrameResult } from "./detector";

/**
 * Face detection on every platform: the UltraFace RFB-320 model (models/, MIT) run by ONNX Runtime's
 * WebAssembly build, so no native binaries ship per platform. Boxes are normalized to the frame, origin top
 * left, like Apple Vision's. Used where Apple Vision is unavailable or unverified (Windows, Linux, Macs
 * without the compiled detector).
 */
const MODEL = path.join(process.cwd(), "src/lib/media-analysis/models/ultraface-rfb-320.onnx");
const WIDTH = 320, HEIGHT = 240;
const MIN_CONFIDENCE = 0.7, OVERLAP = 0.3;

let session: Promise<ort.InferenceSession> | null = null;
function load() {
  if (!session) {
    // One thread: worker threads add start-up cost and nothing for a model this small.
    ort.env.wasm.numThreads = 1;
    // The model predates current exporters; ONNX Runtime warns about each weight it lists as an input.
    ort.env.logLevel = "error";
    // A file:// URL: ONNX Runtime imports its loader from here, and Windows paths are not valid module URLs.
    ort.env.wasm.wasmPaths = `${pathToFileURL(path.join(process.cwd(), "node_modules/onnxruntime-web/dist")).href}/`;
    session = ort.InferenceSession.create(MODEL, { executionProviders: ["wasm"], logSeverityLevel: 3 }).catch(error => { session = null; throw error; });
  }
  return session;
}

/** Normalized (x - 127) / 128, planar RGB, the model's expected input. */
async function input(imagePath: string) {
  const { data } = await sharp(imagePath).removeAlpha().resize(WIDTH, HEIGHT, { fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  const plane = WIDTH * HEIGHT, tensor = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) tensor[c * plane + i] = (data[i * 3 + c] - 127) / 128;
  return new ort.Tensor("float32", tensor, [1, 3, HEIGHT, WIDTH]);
}

const area = (b: DetectorBox) => b.width * b.height;
function overlap(a: DetectorBox, b: DetectorBox) {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  const shared = Math.max(0, w) * Math.max(0, h);
  return shared / (area(a) + area(b) - shared || 1);
}

export class OnnxFaceDetector {
  readonly name = "onnx-ultraface-rfb-320";

  async detectFaces(frames: DetectorFrame[]): Promise<DetectorFrameResult[]> {
    const model = await load();
    const results: DetectorFrameResult[] = [];
    for (const frame of frames) {
      const out = await model.run({ [model.inputNames[0]]: await input(frame.image_path) });
      const scores = out.scores.data as Float32Array, corners = out.boxes.data as Float32Array;
      const found: DetectorBox[] = [];
      for (let i = 0; i < scores.length / 2; i++) {
        const confidence = scores[i * 2 + 1];
        if (confidence < MIN_CONFIDENCE) continue;
        const [x1, y1, x2, y2] = [0, 1, 2, 3].map(k => Math.min(1, Math.max(0, corners[i * 4 + k])));
        if (x2 > x1 && y2 > y1) found.push({ label: "face", confidence, x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
      }
      // Keep the strongest of overlapping candidates.
      const boxes: DetectorBox[] = [];
      for (const box of found.sort((a, b) => b.confidence - a.confidence)) if (boxes.every(kept => overlap(kept, box) <= OVERLAP)) boxes.push(box);
      results.push({ ...frame, boxes });
    }
    return results;
  }
}

/** Apple Vision where it is compiled and verified on this Mac; the bundled model everywhere else. */
export async function detectFacesAnywhere(frames: DetectorFrame[]): Promise<DetectorFrameResult[]> {
  if (process.platform === "darwin") {
    const { AppleVisionDetector } = await import("./apple-vision");
    try { return await new AppleVisionDetector().detectFaces(frames); } catch { /* fall through to the bundled model */ }
  }
  return new OnnxFaceDetector().detectFaces(frames);
}
