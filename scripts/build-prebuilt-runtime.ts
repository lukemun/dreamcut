/** Release build step (desktop/build.mjs): compiles the code the editor otherwise compiles from source while
 * it runs, the GPU preview worker and the prepared renderer, into prebuilt/, so a packaged runtime needs no
 * source. Run from the app root:  node --import tsx scripts/build-prebuilt-runtime.ts */
import fs from "node:fs";
import path from "node:path";
import { compileGpuWorker, PREBUILT_GPU_WORKER } from "../src/lib/render/gpu-worker-bundle";
import { compilePreparedRuntime, PREBUILT_PREPARED_DIR } from "../src/lib/render/prepared-runtime";

async function main() {
  fs.rmSync("prebuilt", { recursive: true, force: true });
  fs.mkdirSync(PREBUILT_PREPARED_DIR, { recursive: true });
  fs.writeFileSync(PREBUILT_GPU_WORKER, await compileGpuWorker());
  const [browser, worker] = await compilePreparedRuntime();
  for (const output of [...browser.outputFiles, ...worker.outputFiles]) fs.writeFileSync(path.join(PREBUILT_PREPARED_DIR, path.basename(output.path)), output.contents);
  console.log(`Prebuilt the GPU preview worker and renderer (${fs.readdirSync(PREBUILT_PREPARED_DIR).join(", ")}).`);
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
