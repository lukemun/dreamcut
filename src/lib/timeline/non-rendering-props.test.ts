import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { NON_RENDERING_ELEMENT_PROPS } from "./non-rendering-props";

// Drawing code for both renderers. Upstream resolvers (speech sync, caption links,
// compounds, semantic layout) are allowed to read these props; drawing code is not.
const RENDERER_DIRS = ["src/lib/remotion", "src/lib/gpu-preview", "src/lib/native-preview"];
// Documented reads that do not affect pixels.
const ALLOWED_READS: Record<string, string> = {
  speech_sync_binding: "TimelineComposition derives the audio-only isSpeechLinked flag",
  preview_premount_seconds: "TimelineComposition's getPremountFrames sets Sequence mount lookahead, not pixels",
};

function rendererSources() {
  const files: [string, string][] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name)) files.push([full, fs.readFileSync(full, "utf8")]);
    }
  };
  for (const dir of RENDERER_DIRS) walk(path.resolve(dir));
  return files;
}

test("non-rendering props are never read by drawing code in either renderer", () => {
  const sources = rendererSources();
  const violations: string[] = [];
  for (const prop of NON_RENDERING_ELEMENT_PROPS) {
    if (ALLOWED_READS[prop]) continue;
    const read = new RegExp(`props\\??\\.${prop}\\b|props\\??\\[\\s*["']${prop}["']\\s*\\]`);
    for (const [file, source] of sources) if (read.test(source)) violations.push(`${prop} in ${path.relative(process.cwd(), file)}`);
  }
  assert.deepEqual(violations, [], "A renderer draws these props: implement them on Browser GPU instead of listing them as non-rendering.");
});
