import type {GpuVideoDraw} from './compositor';

/** Drawing boundary for complete, clock-resolved preview packets.
 * The runtime owns decoding, source selection and borrowed frame lifetimes.
 * Implementations must consume/copy borrowed inputs before draw returns, validate
 * every layer before publishing, and throw rather than omit unsupported effects.
 * Asynchronous initialization belongs in ready, never in draw.
 */
export interface GpuFrameCompositor {
 readonly ready: Promise<void>;
 /** Request packed CPU LUTs instead of WebGPU-only texture handles. */
 readonly cpuLuts?: boolean;
 /** Owned allocations only; decoded-frame cache bytes belong to the runtime. */
 readonly bytes: number;
 draw(layers: readonly GpuVideoDraw[]): void;
 /** Release all owned resources; repeated calls must be harmless. */
 close(): void;
}
