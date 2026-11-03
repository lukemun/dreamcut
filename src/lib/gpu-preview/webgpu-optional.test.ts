import assert from "node:assert/strict";
import test from "node:test";

import { GpuPreviewRuntime } from "./runtime-core";
import { hasHardwareWebGpu, optionalWebGpuDevice, webGpuCanvasFormat } from "./webgpu-optional";

test("a computer without WebGPU gets no device instead of an error", async () => {
  assert.equal(await optionalWebGpuDevice(), null);
  assert.equal(await hasHardwareWebGpu(), false);
  assert.equal(webGpuCanvasFormat(), "rgba8unorm");
});

test("the CanvasKit path runs without a WebGPU device; only the WebGPU compositor needs one", () => {
  const canvasKit = { cpuLuts: true, close() {} } as unknown as ConstructorParameters<typeof GpuPreviewRuntime>[9];
  assert.doesNotThrow(() => new GpuPreviewRuntime(null, null, "rgba8unorm", [], [], "scope", 2, 2, 30, canvasKit));
  assert.throws(() => new GpuPreviewRuntime(null, null, "rgba8unorm", [], [], "scope", 2, 2, 30), /WebGPU device/);
  const gpuOnly = { cpuLuts: false, close() {} } as unknown as ConstructorParameters<typeof GpuPreviewRuntime>[9];
  assert.throws(() => new GpuPreviewRuntime(null, null, "rgba8unorm", [], [], "scope", 2, 2, 30, gpuOnly), /needs a WebGPU device/);
});
