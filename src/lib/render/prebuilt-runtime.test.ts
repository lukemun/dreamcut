import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// A packaged runtime has prebuilt/ and no src/, pnpm-lock.yaml or tsconfig.json.
function packagedRoot(t: import("node:test").TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "prebuilt-runtime-"));
  const previous = process.cwd();
  process.chdir(root);
  t.after(() => { process.chdir(previous); fs.rmSync(root, { recursive: true, force: true }); });
  fs.mkdirSync("prebuilt/prepared", { recursive: true });
  fs.mkdirSync("public/fonts", { recursive: true });
  fs.writeFileSync("public/fonts/a.woff2", "font");
  fs.writeFileSync("prebuilt/gpu-worker.js", "self.prebuilt=1;");
  fs.writeFileSync("prebuilt/prepared/renderer.js", "window.renderer=1;");
  fs.writeFileSync("prebuilt/prepared/worker.cjs", "module.exports=1;");
  return root;
}

test("without source, the GPU worker and prepared renderer come from prebuilt/", async t => {
  packagedRoot(t);
  const { gpuWorkerBundle } = await import("./gpu-worker-bundle");
  assert.equal(await gpuWorkerBundle(), "self.prebuilt=1;");
  const { ensurePreparedRuntime, preparedRuntimeRoot } = await import("./prepared-runtime");
  const version = await ensurePreparedRuntime();
  const generation = path.join(preparedRuntimeRoot(), version);
  assert.equal(fs.readFileSync(path.join(generation, "worker.cjs"), "utf8"), "module.exports=1;");
  assert.equal(fs.readFileSync(path.join(generation, "renderer.js"), "utf8"), "window.renderer=1;");
  assert.ok(fs.existsSync(path.join(generation, "fonts", "a.woff2")));
  assert.equal(await ensurePreparedRuntime(), version, "an unchanged prebuilt renderer reuses its generation");
  fs.writeFileSync("prebuilt/prepared/worker.cjs", "module.exports=2;");
  assert.notEqual(await ensurePreparedRuntime(), version, "a new build is a new generation");
});
