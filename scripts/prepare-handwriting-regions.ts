/** Cache exclusive stroke regions so a broad nib cannot reveal a later gesture. */
import fs from 'node:fs';
import path from 'node:path';

const pack = process.argv[2];
if (!pack) throw new Error('Usage: tsx scripts/prepare-handwriting-regions.ts <font-pack-directory>');
const guides = JSON.parse(fs.readFileSync(path.join(pack, 'strokes.json'), 'utf8')) as Record<string, number[][][]>;
const resolution = 256;
const outlines = process.argv.includes("--physical") ? JSON.parse(fs.readFileSync(path.join(pack, "outlines.json"), "utf8")) as Record<string, {bounds:number[]}> : null;
function distance(x: number, y: number, points: number[][], sx=1, sy=1): number {
  x *= sx; y *= sy;
  let closest = Infinity;
  for (let i = 1; i < points.length; i++) {
    const ax = points[i - 1]![0]! * sx, ay = points[i - 1]![1]! * sy; const bx = points[i]![0]! * sx, by = points[i]![1]! * sy;
    const dx = bx! - ax!, dy = by! - ay!;
    const t = Math.max(0, Math.min(1, ((x - ax!) * dx + (y - ay!) * dy) / (dx * dx + dy * dy || 1)));
    closest = Math.min(closest, (x - ax! - t * dx) ** 2 + (y - ay! - t * dy) ** 2);
  }
  return closest;
}
const regions: Record<string, string[]> = {};
const unit = 100 / resolution;
for (const [char, strokes] of Object.entries(guides)) {
  if (strokes.length < 2) continue;
  const bounds = outlines?.[char]?.bounds;
  const sx = bounds ? (bounds[2]! - bounds[0]!) / 100 : 1, sy = bounds ? (bounds[3]! - bounds[1]!) / 100 : 1;
  const paths = strokes.map(() => [] as string[]);
  for (let row = 0; row < resolution; row++) {
    let previous = -1, runStart = 0;
    const flush = (end: number) => {
      if (previous < 0) return;
      const x = runStart * unit, y = row * unit, width = (end - runStart) * unit;
      // Tiny overlaps avoid antialias seams. Glyph contours remain authoritative.
      paths[previous]!.push(`M${x.toFixed(3)},${y.toFixed(3)}h${(width + .03).toFixed(3)}v${(unit + .03).toFixed(3)}h-${(width + .03).toFixed(3)}z`);
    };
    for (let column = 0; column <= resolution; column++) {
      let owner = -1;
      if (column < resolution) {
        let best = Infinity;
        strokes.forEach((stroke, index) => {
          const d = distance((column + .5) * unit, (row + .5) * unit, stroke, sx, sy);
          if (d < best) { best = d; owner = index; }
        });
      }
      if (owner !== previous) { flush(column); runStart = column; previous = owner; }
    }
  }
  regions[char] = paths.map(parts => parts.join(''));
}
fs.writeFileSync(path.join(pack, 'regions.json'), JSON.stringify(regions));
console.log(`Saved exclusive regions for ${Object.keys(regions).length} glyphs at ${resolution}×${resolution}.`);
