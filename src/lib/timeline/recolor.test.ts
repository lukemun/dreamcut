import assert from "node:assert/strict";
import test from "node:test";
import { recolorMatrix, resolveRecolor } from "./recolor";

function pixel(props: Record<string, unknown>, rgb: number[], alpha = 0.4) {
  const matrix = recolorMatrix(resolveRecolor(props));
  const input = [...rgb, alpha, 1];
  return [0, 1, 2, 3].map((row) => input.reduce((sum, value, col) => sum + value * matrix[row * 5 + col]!, 0));
}
test("identity and zero amount preserve arbitrary source pixels", () => {
  assert.deepEqual(pixel({}, [0.2, 0.5, 0.7]), [0.2, 0.5, 0.7, 0.4]);
  assert.deepEqual(pixel({paper_fill_color:'#ff0000',recolor_amount:0}, [0.2,0.5,0.7]), [0.2,0.5,0.7,0.4]);
});
test("legacy fill is exact flat color and generic controls override it", () => {
  assert.deepEqual(pixel({paper_fill_color:'#ff0000'}, [0.2,0.5,0.7]), [1,0,0,0.4]);
  assert.deepEqual(pixel({paper_fill_color:'#ff0000',recolor_color:'#00ff00',recolor_amount:1,recolor_preserve_shading:0}, [0.2,0.5,0.7]), [0,1,0,0.4]);
});
test("shading uses source luminance; partial amount blends without changing alpha", () => {
  const shaded = pixel({recolor_color:'#ff0000',recolor_amount:1,recolor_preserve_shading:1}, [0.5,0.5,0.5]);
  assert.ok(Math.abs(shaded[0]! - 0.5) < 1e-10);
  assert.deepEqual(shaded.slice(1), [0,0,0.4]);
  assert.deepEqual(pixel({recolor_color:'#ff0000',recolor_amount:0.5,recolor_preserve_shading:0}, [0,1,0]), [0.5,0.5,0,0.4]);
});
