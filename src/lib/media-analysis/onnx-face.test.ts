import assert from "node:assert/strict";
import test from "node:test";
import { OnnxFaceDetector } from "./onnx-face";

const frame = (image_path: string) => ({ frame_id: image_path, image_path, pts: "0", time_base_num: 1, time_base_den: 1 });

test("the bundled face model finds the speaker and nothing on an empty set", async () => {
  const [speaker, empty] = await new OnnxFaceDetector().detectFaces([
    frame("public/recipe-previews/talking-head-cutout/inputs/subject.jpg"),
    frame("public/recipe-previews/speed-entrance-exit/inputs/empty-background.jpg"),
  ]);
  assert.equal(speaker.boxes.length, 1);
  const face = speaker.boxes[0];
  assert.equal(face.label, "face");
  assert.ok(face.confidence > 0.9);
  // Normalized, top-left origin, inside the frame and on the upper-middle of a talking-head shot.
  assert.ok(face.x > 0.2 && face.x + face.width < 0.8 && face.y >= 0 && face.y + face.height <= 1);
  assert.equal(empty.boxes.length, 0);
});
