import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "./store";
import { listMediaFiles } from "./media";
import { reconcileAssetBindings, writeAssetBindings } from "./media-analysis";

test("binding reconciliation reuses a complete media snapshot and still invalidates changed bytes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-binding-snapshot-"));
  const names = ["TIMELINE_PROJECTS_DIR", "DREAMCUT_PROFILE_DIR", "DREAMCUT_APP_DATA_DIR"];
  const previous = names.map(name => process.env[name]);
  const readdir = fs.readdirSync; let scans = 0;
  try {
    names.forEach((name, i) => process.env[name] = path.join(root, String(i)));
    createProject("fixture", "web");
    const dir = path.join(process.env.TIMELINE_PROJECTS_DIR!, "fixture", "media");
    const file = path.join(dir, "sample.svg"); fs.writeFileSync(file, "initial");
    const first = reconcileAssetBindings("fixture");
    first.assets[0]!.fingerprint_sha256 = "a".repeat(64);
    first.assets[0]!.current_job_id = "job"; writeAssetBindings("fixture", first);
    const snapshot = listMediaFiles("fixture");
    fs.readdirSync = ((...args: Parameters<typeof fs.readdirSync>) => {
      if (String(args[0]) === dir) scans++;
      return Reflect.apply(readdir, fs, args);
    }) as typeof fs.readdirSync;
    const unchanged = reconcileAssetBindings("fixture", snapshot);
    assert.equal(scans, 0);
    assert.equal(unchanged.assets[0]!.asset_id, first.assets[0]!.asset_id);
    assert.equal(unchanged.assets[0]!.fingerprint_sha256, "a".repeat(64));
    fs.writeFileSync(file, "changed-size");
    const changed = reconcileAssetBindings("fixture", snapshot);
    assert.equal(changed.assets[0]!.fingerprint_sha256, null);
    assert.equal(changed.assets[0]!.current_job_id, null);
    fs.writeFileSync(path.join(dir, "new.svg"), "new");
    assert.equal(reconcileAssetBindings("fixture", snapshot).assets.length, 1);
    assert.equal(reconcileAssetBindings("fixture").assets.length, 2, "next fresh call discovers added files");
    assert.ok(scans > 0);
    assert.equal(reconcileAssetBindings("fixture", []).assets.length, 0);
  } finally {
    fs.readdirSync = readdir;
    names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
