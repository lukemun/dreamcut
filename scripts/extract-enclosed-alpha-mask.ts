/** Extract enclosed transparent holes as a white alpha overlay; preserves source dimensions. */
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
async function main() {
const [source, output] = process.argv.slice(2);
if (!source || !output) throw new Error('Usage: tsx scripts/extract-enclosed-alpha-mask.ts source.png output.png');
const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const exterior = new Uint8Array(width * height), queue = new Int32Array(width * height);
let head = 0, tail = 0;
const visit = (i: number) => { if (!exterior[i] && data[i * 4 + 3] < 250) { exterior[i] = 1; queue[tail++] = i; } };
for (let x = 0; x < width; x++) { visit(x); visit((height - 1) * width + x); }
for (let y = 0; y < height; y++) { visit(y * width); visit(y * width + width - 1); }
while (head < tail) {
  const i = queue[head++], x = i % width;
  if (x) visit(i - 1); if (x < width - 1) visit(i + 1);
  if (i >= width) visit(i - width); if (i < width * (height - 1)) visit(i + width);
}
const mask = Buffer.alloc(data.length, 255);
let pixels = 0;
for (let i = 0; i < width * height; i++) { mask[i * 4 + 3] = exterior[i] ? 0 : 255 - data[i * 4 + 3]; if (mask[i * 4 + 3]) pixels++; }
await sharp(mask, { raw: { width, height, channels: 4 } }).png().toFile(output);
await writeFile(`${output}.json`, JSON.stringify({ source, output, width, height, enclosedPixels: pixels, recipe: 'enclosed-alpha-white-v1', threshold: 250 }, null, 2));
console.log({ output, enclosedPixels: pixels });

}
main().catch(error => { console.error(error); process.exitCode = 1; });
