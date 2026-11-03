export type GpuCompositorEngine = 'canvaskit' | 'webgpu';
/** Browser GPU uses the qualified compositor; the older path remains an explicit development override. */
export function gpuCompositorEngine(configured?: string): GpuCompositorEngine {
  return configured === 'webgpu' ? 'webgpu' : 'canvaskit';
}
