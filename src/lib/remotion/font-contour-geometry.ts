import { contours } from "d3-contour";
import { Path, Shape } from "three";

export const RASTER_FONT_SIZE = 160;
const RASTER_PADDING = 14;
const ALPHA_THRESHOLD = 0.32;

function addRing(path: Shape | Path, ring: readonly (readonly number[])[]) {
  if (ring.length < 4) return;
  const firstX = ring[0]![0] ?? 0;
  const firstY = ring[0]![1] ?? 0;
  path.moveTo(firstX, -firstY);
  for (let index = 1; index < ring.length; index += 1) {
    const x = ring[index]![0] ?? 0;
    const y = ring[index]![1] ?? 0;
    path.lineTo(x, -y);
  }
  path.closePath();
}

export function shapesFromAlphaMask(
  alpha: ArrayLike<number>,
  width: number,
  height: number,
) {
  const contour = contours()
    .size([width, height])
    .smooth(true)
    .thresholds([ALPHA_THRESHOLD])(Array.from(alpha))[0];

  if (!contour) return [];

  const shapes: Shape[] = [];
  for (const polygon of contour.coordinates) {
    const [outer, ...holes] = polygon;
    if (!outer || outer.length < 4) continue;

    const shape = new Shape();
    addRing(shape, outer);
    for (const holeRing of holes) {
      if (holeRing.length < 4) continue;
      const hole = new Path();
      addRing(hole, holeRing);
      shape.holes.push(hole);
    }
    shapes.push(shape);
  }
  return shapes;
}

export function rasterizeTextToShapes({
  text,
  fontFamily,
  fontWeight,
}: {
  text: string;
  fontFamily: string;
  fontWeight: number;
}) {
  const measuringCanvas = document.createElement("canvas");
  const measuringContext = measuringCanvas.getContext("2d");
  if (!measuringContext) return [];

  measuringContext.font = `${fontWeight} ${RASTER_FONT_SIZE}px ${fontFamily}`;
  const metrics = measuringContext.measureText(text);
  const inkWidth = Math.max(
    1,
    Math.ceil(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight),
  );
  const inkHeight = Math.max(
    1,
    Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent),
  );

  const canvas = document.createElement("canvas");
  canvas.width = inkWidth + RASTER_PADDING * 2;
  canvas.height = inkHeight + RASTER_PADDING * 2;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.font = `${fontWeight} ${RASTER_FONT_SIZE}px ${fontFamily}`;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(
    text,
    RASTER_PADDING + metrics.actualBoundingBoxLeft,
    RASTER_PADDING + metrics.actualBoundingBoxAscent,
  );

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Float32Array(canvas.width * canvas.height);
  for (let index = 0; index < alpha.length; index += 1) {
    alpha[index] = pixels[index * 4 + 3]! / 255;
  }
  return shapesFromAlphaMask(alpha, canvas.width, canvas.height);
}
