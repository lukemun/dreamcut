import { rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { prepareFixture as bundle } from "@/lib/render/fixture-renderer";
import { renderFixtureStill as renderStill, selectFixture as selectComposition } from "@/lib/render/fixture-renderer";
import sharp from "sharp";

const fixtureId = "EffectPrimitiveFixture";
const nonce = `${process.pid}-${Date.now()}`;
const outputPath = path.join(tmpdir(), `effect-primitives-${nonce}.png`);

function alphaAt(data: Buffer, width: number, x: number, y: number) {
  return data[(y * width + x) * 4 + 3] ?? 0;
}

async function main() {
  const serveUrl = await bundle({
    entryPoint: path.resolve("src/lib/remotion/EffectPrimitiveFixture.tsx"),
    onProgress: () => undefined,
  });

  try {
    const inkFixture = await selectComposition({ serveUrl, id: "HandwritingWeightFixture", inputProps: {} });
    const inkCounts = new Map<string, number>();
    const inkFrames = new Map<string, Buffer>();
    for (const weight of [0, 2]) for (const frame of [0, 15, 30, 15]) {
      await renderStill({ composition: inkFixture, serveUrl, output: outputPath, inputProps: { weight }, imageFormat: "png", frame });
      const { data } = await sharp(outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const key = `${weight}:${frame}`;
      if (inkFrames.has(key) && !inkFrames.get(key)!.equals(data)) throw new Error("Handwriting weight changed on repeated seek");
      inkFrames.set(key, data);
      let count = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! >= 128) count++;
      inkCounts.set(key, count);
    }
    if (inkCounts.get("0:0") !== 0 || inkCounts.get("2:0") !== 0) throw new Error("Weight revealed ink before writing began");
    for (const frame of [15, 30]) if (!(inkCounts.get(`2:${frame}`)! > inkCounts.get(`0:${frame}`)! * 1.2)) throw new Error("Ink weight did not visibly thicken the revealed strokes");
    if (!(inkCounts.get("2:15")! < inkCounts.get("2:30")!)) throw new Error("Bold handwriting lost its progressive reveal");
    console.log("Handwriting weight: increased ink, empty start, progressive reveal and repeated seek passed", Object.fromEntries(inkCounts));
    const letters = await selectComposition({ serveUrl, id: "LetterFallFixture", inputProps: {} });
    const letterFrames = new Map<number, Buffer>();
    const letterCenters: Record<number, number[]> = {};
    let letterBounds: number[] = [];
    for (const frame of [0, 3, 12, 3, 0]) {
      await renderStill({ composition: letters, serveUrl, output: outputPath, imageFormat: "png", frame });
      const {data, info} = await sharp(outputPath).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      if (letterFrames.has(frame) && !letterFrames.get(frame)!.equals(data)) throw new Error("Letter fall changed on random seek");
      letterFrames.set(frame, data);
      if (frame === 0 && !letterBounds.length) {
        const columns = Array.from({length:info.width}, (_,x) => {
          for(let y=0;y<info.height;y++) {const i=(y*info.width+x)*4;if(data[i+3]!>=128 && data[i]!>=200)return true;}
          return false;
        });
        const starts=columns.flatMap((on,x)=>on&&!columns[x-1]?[x]:[]);
        const ends=columns.flatMap((on,x)=>on&&!columns[x+1]?[x]:[]);
        if(starts.length!==3) {await copyFile(outputPath,"/tmp/letter-fall-fixture-debug.png"); throw new Error(`Expected three isolated fixture letters, got ${starts.length}: ${starts}/${ends}`);}
        letterBounds=[(ends[0]!+starts[1]!)/2,(ends[1]!+starts[2]!)/2];
      }
      const sums = [0,0,0], counts = [0,0,0];
      for(let i=0;i<data.length;i+=4) {
        if(data[i+3]!<128 || data[i]!<200) continue;
        const x=(i/4)%info.width, y=Math.floor(i/4/info.width);
        const group=x<letterBounds[0]!?0:x<letterBounds[1]!?1:2;
        sums[group]!+=y; counts[group]!++;
      }
      letterCenters[frame]=counts.map((n,i)=>sums[i]!/n);
    }
    for(const frame of [3,12]) for(const group of [0,1,2]) {
      const age=Math.max(0,frame/30-(group===1?.2:0));
      const expected=400*(age/.8)**2;
      if(Math.abs(letterCenters[frame]![group]!-letterCenters[0]![group]!-expected)>2)
        throw new Error("Glyph release order or independent gravity incorrect");
    }
    console.log("Letter fall render: outside-in release, independent quadratic clocks and seek identity passed");
    const gravity = await selectComposition({ serveUrl, id: "GravityFixture", inputProps: {} });
    const gravityFrames = new Map<number, Buffer>();
    const centers: Record<number, number[]> = {};
    for (const frame of [0, 9, 15, 24, 9, 0]) {
      await renderStill({ composition: gravity, serveUrl, output: outputPath, imageFormat: "png", frame });
      const { data, info } = await sharp(outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      if (gravityFrames.has(frame) && !gravityFrames.get(frame)!.equals(data)) throw new Error("Gravity motion changed on random seek");
      gravityFrames.set(frame, data);
      const sums = [0, 0], counts = [0, 0];
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3]! < 128) continue;
        const group = data[i]! > 200 && data[i + 1]! < 30 ? 0 : data[i]! > 200 && data[i + 1]! > 200 ? 1 : -1;
        if (group < 0) continue;
        sums[group]! += Math.floor(i / 4 / info.width); counts[group]!++;
      }
      centers[frame] = counts.map((n, i) => n ? sums[i]! / n : NaN);
    }
    for (const frame of [9, 15]) for (const group of [0, 1]) {
      const expected = 400 * (frame / 30 / .8) ** 2;
      if (Math.abs(centers[frame]![group]! - centers[0]![group]! - expected) > 2) throw new Error("Text and object did not follow the shared gravity equation");
    }
    if (centers[24]!.some(Number.isFinite)) throw new Error("Gravity actors did not leave the screen");
    console.log("Gravity text/object render: quadratic acceleration, offscreen exit and random-seek identity passed");
    const composition = await selectComposition({ serveUrl, id: fixtureId, inputProps: {} });
    await renderStill({ composition, serveUrl, output: outputPath, imageFormat: "png" });
    const { data, info } = await sharp(outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const transparent = alphaAt(data, info.width, 50, 10);
    const feathered = alphaAt(data, info.width, 50, 25);
    const opaque = alphaAt(data, info.width, 50, 50);

    if (transparent > 5 || feathered < 30 || feathered > 225 || opaque < 250) {
      throw new Error(`Unexpected rendered alpha samples: transparent=${transparent}, feathered=${feathered}, opaque=${opaque}`);
    }
    console.log(`Effect primitive render verified: alpha ${transparent}/${feathered}/${opaque}`);
    const rotated = await selectComposition({ serveUrl, id: "RotatedLineFixture", inputProps: {} });
    await renderStill({ composition: rotated, serveUrl, output: outputPath, imageFormat: "png" });
    const pixels = await sharp(outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const right = alphaAt(pixels.data, pixels.info.width, 80, 50);
    const edge = alphaAt(pixels.data, pixels.info.width, 40, 50);
    const left = alphaAt(pixels.data, pixels.info.width, 10, 50);
    if (right > 5 || edge < 30 || edge > 225 || left < 250) throw new Error(`Rotated line alpha incorrect: ${right}/${edge}/${left}`);
    console.log(`Rotated line render verified: alpha ${right}/${edge}/${left}`);
    const spiral = await selectComposition({serveUrl, id: "SpiralFixture", inputProps: {}});
    const seen = new Map<number, Buffer>();
    for (const frame of [0, 15, 40, 60, 15, 0]) {
      await renderStill({composition: spiral, serveUrl, output: outputPath, imageFormat: "png", frame});
      const raw = await sharp(outputPath).ensureAlpha().raw().toBuffer();
      if (seen.has(frame) && !seen.get(frame)!.equals(raw)) throw new Error("Spiral changed after random seek");
      seen.set(frame, raw);
    }
    const area = (raw: Buffer) => { let n=0; for(let i=3;i<raw.length;i+=4) if(raw[i]>64)n++; return n; };
    if (!(area(seen.get(0)!) > area(seen.get(15)!) && area(seen.get(15)!) > area(seen.get(40)!) && area(seen.get(60)!)===0)) throw new Error("Spiral did not shrink to zero");
    if (seen.get(0)!.equals(seen.get(15)!)) throw new Error("Spiral motion is invisible");
    console.log("Spiral group render: start/middle/end and random-seek identity passed");
    const handwriting = await selectComposition({ serveUrl, id: "HandwritingFixture", inputProps: {} });
    const ink: number[] = [];
    for (const frame of [0, 15, 59]) {
      await renderStill({ composition: handwriting, serveUrl, output: outputPath, imageFormat: "png", frame });
      const raw = await sharp(outputPath).ensureAlpha().raw().toBuffer();
      let count = 0;
      for (let i = 3; i < raw.length; i += 4) if (raw[i] > 64) count++;
      ink.push(count);
    }
    if (ink[0] !== 0 || ink[1] <= 0 || ink[2] <= ink[1] * 1.5) throw new Error(`Handwriting did not draw progressively: ${ink}`);
    console.log(`Handwriting real-render ink coverage: ${ink.join(" → ")}`);
    const marker = await selectComposition({ serveUrl, id: "MarkerFixture", inputProps: {} });
    const markerInk: number[] = [];
    const markerBuffers: Buffer[] = [];
    for (const frame of [0, 15, 58, 59]) {
      await renderStill({ composition: marker, serveUrl, output: outputPath, imageFormat: "png", frame });
      const raw = await sharp(outputPath).ensureAlpha().raw().toBuffer();
      markerBuffers.push(raw);
      let count = 0;
      for (let i = 3; i < raw.length; i += 4) if (raw[i] > 64) count++;
      markerInk.push(count);
    }
    if (markerInk[0] !== 0 || markerInk[1] <= 0 || markerInk[3] <= markerInk[1]) throw new Error(`Marker did not draw progressively: ${markerInk}`);
    // The final pen-lift interval must not conceal missing ink that pops in when the mask is removed.
    let changedAlpha = 0;
    for (let i = 3; i < markerBuffers[2].length; i += 4) changedAlpha += Math.abs(markerBuffers[2][i] - markerBuffers[3][i]);
    if (changedAlpha > markerInk[3] * 255 * 0.005) throw new Error(`Marker completion pops: alpha difference ${changedAlpha}`);
    console.log(`Permanent Marker real-render ink coverage: ${markerInk.join(" → ")}; final mask delta ${changedAlpha}`);

  } finally {
    await rm(outputPath, { force: true });
    await rm(serveUrl, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
