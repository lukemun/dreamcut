import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { ALPHA_COLOR_BLEED } from "./prepare-editor-media";

// Paper-coloured shapes with soft edges over transparent black, like a drawn overlay. Composited over
// paper they should vanish; a proxy that drags the hidden black into the edges shows dark outlines.
const PAPER = [243, 239, 230];
const SHAPES = "lt(mod(X,90),60)*lt(mod(Y,140),100)";
const SOURCE = `color=c=black@0.0:s=1080x1920:r=30:d=0.2,format=rgba,geq=r='${PAPER[0]}*${SHAPES}':g='${PAPER[1]}*${SHAPES}':b='${PAPER[2]}*${SHAPES}':a='255*${SHAPES}',gblur=sigma=1.2:planes=8`;
const SCALE = "scale=w='trunc(iw*min(1,min(1280/max(iw,ih),720/min(iw,ih)))/2)*2':h='trunc(ih*min(1,min(1280/max(iw,ih),720/min(iw,ih)))/2)*2'";
const ENCODE = ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-b:v", "0", "-crf", "32", "-deadline", "realtime", "-cpu-used", "6"];

function proxyDarkening(dir: string, filter: string) {
  const source = path.join(dir, "source.webm"), proxy = path.join(dir, `proxy-${filter ? "bleed" : "plain"}.webm`);
  if (!fs.existsSync(source)) execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", SOURCE, "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0", "-crf", "10", "-b:v", "0", source]);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-c:v", "libvpx-vp9", "-i", source, "-vf", `${filter ? `${filter},` : ""}${SCALE}`, "-an", ...ENCODE, proxy]);
  const rgba = execFileSync("ffmpeg", ["-v", "error", "-c:v", "libvpx-vp9", "-i", proxy, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgba", "pipe:1"], { maxBuffer: 64 * 1024 * 1024 });
  let worst = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3] / 255;
    for (let c = 0; c < 3; c++) worst = Math.max(worst, PAPER[c] - (rgba[i + c] * a + PAPER[c] * (1 - a)));
  }
  return worst;
}

test("an alpha proxy keeps soft edges free of the transparent area's hidden black", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "alpha-bleed-"));
  try {
    const plain = proxyDarkening(dir, ""), bled = proxyDarkening(dir, ALPHA_COLOR_BLEED);
    assert.ok(plain > 48, `the plain proxy should show the fringe this guards against (darkest edge ${plain.toFixed(1)})`);
    assert.ok(bled < 32, `edges composite over paper without a dark rim (darkest edge ${bled.toFixed(1)})`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
