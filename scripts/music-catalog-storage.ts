/** Reconcile every catalog-owned file reference into this DreamCut checkout. */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { musicCatalogSchema } from "../src/lib/music-catalog/schema";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : undefined;
};
const apply = args.includes("--apply");
const sourceArg = flag("source");
const receiptId = flag("receipt");
const targetRoot = path.resolve(process.env.TIMELINE_MUSIC_CATALOG_DIR ?? "music-catalog");
const catalogPath = path.join(targetRoot, "catalog.json");
const catalog = musicCatalogSchema.parse(JSON.parse(fs.readFileSync(catalogPath, "utf8")));
const sourceRoot = sourceArg ? path.resolve(sourceArg) : null;

const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const refs = catalog.tracks.flatMap((track) => track.versions.flatMap((version) => version.file ? [{
  track_id: track.id,
  version_id: version.id,
  file: version.file,
  expected_hash: version.provenance?.sha256 ?? null,
}] : []));

const recovered: Array<{ track_id: string; version_id: string; file: string; sha256: string }> = [];
const alreadyPresent: typeof recovered = [];
const unresolved: Array<{ track_id: string; version_id: string; file: string }> = [];

for (const ref of refs) {
  const destination = path.resolve(targetRoot, "audio", ref.file);
  const audioRoot = path.resolve(targetRoot, "audio");
  if (!destination.startsWith(`${audioRoot}${path.sep}`)) throw new Error(`Unsafe catalog path: ${ref.file}`);
  if (fs.existsSync(destination)) {
    const hash = sha256(destination);
    if (ref.expected_hash && ref.expected_hash !== hash) throw new Error(`${ref.file}: stored bytes do not match catalog provenance`);
    alreadyPresent.push({ ...ref, sha256: hash });
    continue;
  }
  const source = sourceRoot ? path.resolve(sourceRoot, "audio", ref.file) : null;
  const sourceAudioRoot = sourceRoot ? path.resolve(sourceRoot, "audio") : null;
  if (!source || !sourceAudioRoot || !source.startsWith(`${sourceAudioRoot}${path.sep}`) || !fs.existsSync(source)) {
    unresolved.push(ref);
    continue;
  }
  const hash = sha256(source);
  if (ref.expected_hash && ref.expected_hash !== hash) throw new Error(`${ref.file}: recovery source does not match catalog provenance`);
  if (apply) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    if (sha256(destination) !== hash) throw new Error(`${ref.file}: copied bytes failed verification`);
  }
  recovered.push({ ...ref, sha256: hash });
}

const result = {
  schema_version: 1,
  target_catalog: targetRoot,
  source_catalog: sourceRoot,
  applied: apply,
  file_references: refs.length,
  already_present: alreadyPresent.length,
  recovered: recovered.length,
  unresolved,
  recovered_files: recovered,
};

if (apply && receiptId) {
  const receiptDir = path.join(targetRoot, "imports", receiptId);
  fs.mkdirSync(receiptDir, { recursive: true });
  fs.writeFileSync(path.join(receiptDir, "storage-reconciliation.json"), `${JSON.stringify(result, null, 2)}\n`);
}

console.log(JSON.stringify(result, null, 2));
if (unresolved.length > 0) process.exitCode = 1;
