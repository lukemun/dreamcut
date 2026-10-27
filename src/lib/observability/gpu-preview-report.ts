import * as Sentry from "@sentry/nextjs";

/** The scene uses something the GPU path cannot draw yet: a capability gap, not a crash. */
export function gpuAdmissionError(reason: string) {
  const error = Error(reason);
  error.name = "GpuAdmissionError";
  return error;
}

export type GpuFailureKind = "admission" | "device-lost" | "timeout" | "unavailable" | "runtime";

export function gpuFailureKind(error: unknown): GpuFailureKind {
  if (error instanceof Error && error.name === "GpuAdmissionError") return "admission";
  const message = error instanceof Error ? error.message : String(error);
  if (/context lost|device lost|GPU preview stopped/i.test(message)) return "device-lost";
  if (/timed out/i.test(message)) return "timeout";
  if (/GPU unavailable|WebGPU|requestAdapter|requestDevice/i.test(message)) return "unavailable";
  return "runtime";
}

type GpuContext = { name?: string; vendor_name?: string; api_type?: string; webgpu?: boolean; architecture?: string };
let device: Promise<GpuContext> | null = null;

/** Which graphics stack the preview ran on: the model and driver strings, never the scene. */
function gpuDevice(): Promise<GpuContext> {
  device ??= (async () => {
    const context: GpuContext = { webgpu: typeof navigator !== "undefined" && "gpu" in navigator };
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const info = gl?.getExtension("WEBGL_debug_renderer_info");
      if (gl && info) {
        context.name = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
        context.vendor_name = String(gl.getParameter(info.UNMASKED_VENDOR_WEBGL));
      }
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { /* Diagnostics are best effort. */ }
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string; description?: string } } | null> } }).gpu;
      const adapter = await Promise.race([gpu?.requestAdapter(), new Promise<null>(resolve => setTimeout(() => resolve(null), 1000))]);
      if (adapter?.info) {
        context.api_type = "WebGPU";
        context.architecture = adapter.info.architecture || undefined;
        context.vendor_name ||= adapter.info.vendor || undefined;
        context.name ||= adapter.info.description || undefined;
      }
    } catch { /* Diagnostics are best effort. */ }
    return context;
  })();
  return device;
}

const reported = new Set<string>();

/** Report why the graphics card preview fell back to Browser. The same failure is
 * sent once per page load: retries and replacement sessions repeat it. */
export function reportGpuPreviewFailure(error: unknown) {
  const kind = gpuFailureKind(error);
  const message = error instanceof Error ? error.message : String(error);
  const key = `${kind}:${message}`;
  if (reported.has(key) || reported.size > 20) return;
  reported.add(key);
  void gpuDevice().then(gpu => Sentry.withScope(scope => {
    scope.setLevel(kind === "admission" ? "warning" : "error");
    scope.setTag("component", "gpu-preview");
    scope.setTag("gpu_failure", kind);
    scope.setTag("webgpu", String(!!gpu.webgpu));
    scope.setContext("gpu", gpu);
    Sentry.captureException(error instanceof Error ? error : Error(message));
  }));
}
