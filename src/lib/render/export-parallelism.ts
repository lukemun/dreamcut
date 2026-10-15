import os from "node:os";

/** Upper bound on export pages (segments and audio workers) whatever the machine reports. */
export const MAX_EXPORT_WORKERS = 8;

/** Memory one export page needs, measured at 1080p and scaled by drawn pixels (GPU export session, decoders, encoder). */
const BYTES_PER_PAGE_AT_1080P = 700 * 1024 ** 2;

/**
 * How many export pages this computer can run side by side: about one per three cores
 * (each page keeps a renderer, a GPU process share and decoders busy) and no more than
 * a third of the computer's memory allows. DREAMCUT_EXPORT_WORKERS overrides it.
 */
export function exportWorkerCount(pixels: { width: number; height: number }, machine = {
  cores: typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length,
  // macOS reports little "free" memory because it fills idle memory with cache; total is the stable signal.
  memoryBytes: os.totalmem(),
  override: process.env.DREAMCUT_EXPORT_WORKERS,
}): number {
  const forced = Number(machine.override);
  if (machine.override && Number.isInteger(forced) && forced >= 1) return Math.min(MAX_EXPORT_WORKERS, forced);
  const perPage = BYTES_PER_PAGE_AT_1080P * Math.max(1, (pixels.width * pixels.height) / (1920 * 1080));
  const byCores = Math.floor(machine.cores / 3);
  const byMemory = Math.floor(machine.memoryBytes / 3 / perPage);
  return Math.max(1, Math.min(MAX_EXPORT_WORKERS, byCores, byMemory));
}

/**
 * GPU picture segments share the computer's video decoding hardware, so they stop helping
 * early. Measured 2026-10-13 on an M5 Pro, 102 s 1080p timeline: 1 segment 43.9 s, 2 32.4 s,
 * 3 32.7 s, 4 32.8 s, 6 36.3 s. The audio pass is plain CPU work and keeps every worker.
 */
export const MAX_GPU_PICTURE_SEGMENTS = 3;
