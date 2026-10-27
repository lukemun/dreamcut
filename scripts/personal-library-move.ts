/**
 * Move creator-specific entries out of a shared (repository) media catalog into the
 * creator's personal library under the profile (`<profile>/library/<kind>/`).
 *
 *   pnpm personal-library-move --kind images --ids creator_portrait_front,other_id
 *   pnpm personal-library-move --kind sfx --ids-file ids.txt --apply
 *
 * Dry run by default. With --apply it copies each referenced file into the personal
 * library's managed `files/` folder (an APFS clone on macOS where the volume supports it), verifies
 * every copied byte by SHA-256, appends the unchanged entry JSON to the personal catalog,
 * validates both catalogs with the shared schema and only then removes the entries from
 * the shared catalog. Original files are never deleted or modified. An existing personal
 * file with different bytes, a missing source (unless --allow-missing) or source bytes that
 * differ from the entry's recorded hash stop the move before any catalog changes. A receipt is written under `receipts/`.
 *
 * --recover-from <dir> fills a missing source from a file of the same name in that folder
 * when its bytes match the hash the entry records (e.g. a folder renamed with the product).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { imageCatalogSchema } from "@/lib/image-catalog/schema";
import { musicCatalogSchema } from "@/lib/music-catalog/schema";
import { sfxCatalogSchema } from "@/lib/sfx-catalog/schema";
import { visualCatalogSchema } from "@/lib/visual-catalog/schema";
import { imageCatalogRoot } from "@/lib/local-store/image-catalog";
import { musicCatalogRoot } from "@/lib/local-store/music-catalog";
import {
  PERSONAL_LIBRARY_KINDS, personalLibraryCatalogPath, personalLibraryFilesRoot, personalLibraryRoot,
  type PersonalLibraryKind,
} from "@/lib/local-store/personal-library";
import { sfxCatalogRoot } from "@/lib/local-store/sfx-catalog";
import { visualCatalogRoot } from "@/lib/local-store/visual-catalog";

type Entry = Record<string, unknown> & { id: string };
type Spec = {
  key: "images" | "assets" | "tracks" | "sound_effects";
  sharedRoot: () => string;
  mediaDir: string;
  schema: { parse: (value: unknown) => unknown };
  /** Files an entry names, relative to the media directory, with the hash it records. */
  files: (entry: Entry) => Array<{ file: string; recorded?: string }>;
};

const SPECS: Record<PersonalLibraryKind, Spec> = {
  images: {
    key: "images", sharedRoot: imageCatalogRoot, mediaDir: "images", schema: imageCatalogSchema,
    files: (entry) => [{ file: String(entry.file), recorded: entry.sha256 as string | undefined }],
  },
  visuals: {
    key: "assets", sharedRoot: visualCatalogRoot, mediaDir: "media", schema: visualCatalogSchema,
    files: (entry) => {
      const derivation = entry.derivation as { source_file?: string; source_sha256?: string } | undefined;
      return [
        { file: String(entry.file), recorded: entry.sha256 as string | undefined },
        ...(derivation?.source_file ? [{ file: derivation.source_file, recorded: derivation.source_sha256 }] : []),
      ];
    },
  },
  music: {
    key: "tracks", sharedRoot: musicCatalogRoot, mediaDir: "audio", schema: musicCatalogSchema,
    files: (entry) => ((entry.versions ?? []) as Array<{ file?: string; provenance?: { sha256?: string } }>)
      .filter((version) => version.file)
      .map((version) => ({ file: version.file!, recorded: version.provenance?.sha256 })),
  },
  sfx: {
    key: "sound_effects", sharedRoot: sfxCatalogRoot, mediaDir: "audio", schema: sfxCatalogSchema,
    files: (entry) => [{ file: String(entry.file), recorded: entry.sha256 as string | undefined }],
  },
};

const RESERVE_BYTES = 5 * 1024 ** 3;

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256(file: string) {
  const hash = createHash("sha256");
  const descriptor = fs.openSync(file, "r");
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    for (let read = 0; (read = fs.readSync(descriptor, buffer, 0, buffer.length, null)) > 0;) hash.update(buffer.subarray(0, read));
  } finally { fs.closeSync(descriptor); }
  return hash.digest("hex");
}

/** An APFS clone on macOS (no extra blocks until either copy changes), else a byte copy. */
function copyPreferClone(source: string, destination: string) {
  if (process.platform === "darwin" && spawnSync("cp", ["-c", source, destination]).status === 0) return;
  fs.rmSync(destination, { force: true });
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}

function inside(root: string, relative: string) {
  const resolved = path.resolve(root, relative);
  if (resolved === path.resolve(root) || !resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`Unsafe catalog file path: ${relative}`);
  return resolved;
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function readJson(file: string, fallback: unknown) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : fallback;
}

function main() {
  const kind = arg("--kind") as PersonalLibraryKind;
  if (!PERSONAL_LIBRARY_KINDS.includes(kind)) throw new Error(`--kind must be one of ${PERSONAL_LIBRARY_KINDS.join(", ")}`);
  const idsFile = arg("--ids-file");
  const ids = [...new Set((idsFile ? fs.readFileSync(idsFile, "utf8") : arg("--ids") ?? "")
    .split(/[\s,]+/).map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new Error("Give --ids a,b,c or --ids-file <file>");
  const apply = process.argv.includes("--apply");
  const spec = SPECS[kind];

  const sharedRoot = spec.sharedRoot();
  const sharedPath = path.join(sharedRoot, "catalog.json");
  const shared = readJson(sharedPath, null) as Record<string, unknown> | null;
  if (!shared) throw new Error(`No shared catalog at ${sharedPath}`);
  const sharedEntries = shared[spec.key] as Entry[];
  const byId = new Map(sharedEntries.map((entry) => [entry.id, entry]));
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length) throw new Error(`Not in the shared ${kind} catalog: ${unknown.join(", ")}`);
  const moving = ids.map((id) => byId.get(id)!);

  const personalPath = personalLibraryCatalogPath(kind);
  const personal = readJson(personalPath, { schema_version: 1, [spec.key]: [] }) as Record<string, unknown>;
  const personalEntries = (personal[spec.key] ?? []) as Entry[];
  const personalIds = new Set(personalEntries.map((entry) => entry.id));

  const sourceRoot = path.join(sharedRoot, spec.mediaDir);
  const filesRoot = personalLibraryFilesRoot(kind);
  const recoverFrom = arg("--recover-from") ? path.resolve(arg("--recover-from")!) : null;
  const isFile = (file: string) => fs.existsSync(file) && fs.statSync(file).isFile();
  const files = [...new Map(moving.flatMap((entry) => spec.files(entry)).map((item) => [item.file, item])).values()];
  const plan = files.map(({ file, recorded }) => {
    let source = inside(sourceRoot, file);
    let recovered = false;
    if (!isFile(source) && recoverFrom && recorded) {
      const candidate = path.join(recoverFrom, path.basename(file));
      if (isFile(candidate) && sha256(candidate) === recorded) { source = candidate; recovered = true; }
    }
    const destination = inside(filesRoot, file);
    const present = isFile(source);
    return { file, recorded, source, destination, present, recovered, bytes: present ? fs.statSync(source).size : 0 };
  });
  const bytes = plan.reduce((sum, item) => sum + item.bytes, 0);
  let existing = filesRoot;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const stat = fs.statfsSync(existing);
  const available = stat.bavail * stat.bsize;
  const summary = {
    kind, apply, entries: moving.length, already_personal: moving.filter((entry) => personalIds.has(entry.id)).length,
    files: plan.length, missing_files: plan.filter((item) => !item.present).map((item) => item.file),
    recovered_files: plan.filter((item) => item.recovered).map((item) => item.file),
    bytes, available_bytes: available, personal_catalog: personalPath, shared_catalog: sharedPath,
  };
  if (!apply) {
    console.log(JSON.stringify({ ...summary, note: "Dry run. Re-run with --apply to copy, verify and move the entries." }, null, 2));
    return;
  }
  // Never leave a personal entry whose media is missing or differs from its recorded hash.
  if (summary.missing_files.length && !process.argv.includes("--allow-missing")) {
    throw new Error(`Missing source files (recover them, pass --recover-from <dir>, or --allow-missing): ${summary.missing_files.join(", ")}`);
  }
  const mismatched = plan.filter((item) => item.present && item.recorded && sha256(item.source) !== item.recorded).map((item) => item.file);
  if (mismatched.length) throw new Error(`Source bytes differ from the recorded hash; refresh the catalog entry first: ${mismatched.join(", ")}`);
  // Clones usually take no space; reserve as if every byte were copied.
  if (available - bytes < RESERVE_BYTES) throw new Error(`Not enough free space: need ${bytes} bytes plus a 5 GiB reserve, ${available} available`);

  const copied: Array<{ file: string; sha256: string; reused?: true }> = [];
  for (const item of plan) {
    if (!item.present) continue;
    const sourceHash = sha256(item.source);
    if (fs.existsSync(item.destination)) {
      if (sha256(item.destination) !== sourceHash) throw new Error(`A different file already exists in the personal library: ${item.file}`);
      copied.push({ file: item.file, sha256: sourceHash, reused: true });
      continue;
    }
    fs.mkdirSync(path.dirname(item.destination), { recursive: true });
    const temporary = `${item.destination}.${process.pid}.pending`;
    copyPreferClone(item.source, temporary);
    if (sha256(temporary) !== sourceHash) {
      fs.rmSync(temporary, { force: true });
      throw new Error(`Copy verification failed for ${item.file}`);
    }
    fs.renameSync(temporary, item.destination);
    copied.push({ file: item.file, sha256: sourceHash });
  }

  const nextPersonal = { ...personal, schema_version: 1, [spec.key]: [...personalEntries, ...moving.filter((entry) => !personalIds.has(entry.id))] };
  const moved = new Set(ids);
  const nextShared = { ...shared, [spec.key]: sharedEntries.filter((entry) => !moved.has(entry.id)) };
  spec.schema.parse(nextPersonal);
  spec.schema.parse(nextShared);
  writeJson(personalPath, nextPersonal);

  // The image catalog is generated from sources.json; move the authored source records too.
  let sourcesMoved = 0;
  if (kind === "images") {
    const sharedSourcesPath = path.join(sharedRoot, "sources.json");
    const sharedSources = readJson(sharedSourcesPath, null) as { images: Entry[] } | null;
    if (sharedSources) {
      const personalSourcesPath = path.join(personalLibraryRoot(kind), "sources.json");
      const personalSources = readJson(personalSourcesPath, { schema_version: 1, images: [] }) as { images: Entry[] };
      const known = new Set(personalSources.images.map((entry) => entry.id));
      const movingSources = sharedSources.images.filter((entry) => moved.has(entry.id));
      sourcesMoved = movingSources.length;
      writeJson(personalSourcesPath, { ...personalSources, images: [...personalSources.images, ...movingSources.filter((entry) => !known.has(entry.id))] });
      writeJson(sharedSourcesPath, { ...sharedSources, images: sharedSources.images.filter((entry) => !moved.has(entry.id)) });
    }
  }
  writeJson(sharedPath, nextShared);

  const receipt = {
    ...summary, moved_ids: ids, sources_moved: sourcesMoved, copied, completed_at: new Date().toISOString(),
    originals: "Left in place; nothing was deleted.",
  };
  const receiptPath = path.join(personalLibraryRoot(kind), "receipts", `move-${receipt.completed_at.replace(/[:.]/g, "-")}.json`);
  writeJson(receiptPath, receipt);
  console.log(JSON.stringify({ ...summary, copied: copied.length, receipt: receiptPath }, null, 2));
}

main();
