/**
 * The CanvasKit compositor draws with WebGL2, which Chrome also provides in software (SwiftShader)
 * on machines without a usable graphics card. WebGPU is optional there: a device is used when the
 * machine has one (device-loss reports), and the CanvasKit path runs without it otherwise.
 */
export async function optionalWebGpuDevice(): Promise<GPUDevice | null> {
  try {
    const adapter = await (globalThis.navigator as Navigator | undefined)?.gpu?.requestAdapter();
    return adapter ? await adapter.requestDevice() : null;
  } catch {
    return null;
  }
}

/** Texture format for the WebGPU compositor only; CanvasKit ignores it. */
export function webGpuCanvasFormat(): GPUTextureFormat {
  return (globalThis.navigator as Navigator | undefined)?.gpu?.getPreferredCanvasFormat() ?? "rgba8unorm";
}

/** Whether this computer has a real graphics card for WebGPU (not a software fallback). HDR export needs one. */
export async function hasHardwareWebGpu(): Promise<boolean> {
  try {
    const adapter = await (globalThis.navigator as Navigator | undefined)?.gpu?.requestAdapter();
    return Boolean(adapter && !(adapter as GPUAdapter & { isFallbackAdapter?: boolean }).isFallbackAdapter && !adapter.info?.isFallbackAdapter);
  } catch {
    return false;
  }
}
