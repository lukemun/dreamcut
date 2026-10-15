import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { visualCatalogSchema, type VisualCatalogEntry } from "@/lib/visual-catalog/schema";
import { personalLibraryRoot } from "@/lib/local-store/personal-library";

type SourceManifest = {
  assets: Array<{
    original_filename: string;
    media_path: string;
    source_sha256: string;
    imported_at: string;
  }>;
};

type ProjectAnnotations = {
  assets: Record<string, {
    display_name: string;
    meaning: string;
    use_cases: string[];
    tone: string[];
    template_structure: string;
    cultural_context: string;
    avoid_when: string[];
    tags: string[];
    confidence: "high" | "medium" | "low";
    sources: Array<{ label: string; url: string; kind: "template_page" | "cultural_reference" | "original_source" }>;
  }>;
};

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string) {
  const value = arg(name)?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
}

function mediaProbe(file: string) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,width,height,pix_fmt",
    "-of", "json",
    file,
  ], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `ffprobe failed for ${file}`);
  const probe = JSON.parse(result.stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number; pix_fmt?: string }>;
  };
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  if (!video?.width || !video.height) throw new Error(`No visual stream in ${file}`);
  return {
    width: video.width,
    height: video.height,
    durationSeconds: probe.format?.duration ? Number(probe.format.duration) : null,
    hasAlphaChannel: /(?:^|a)(?:rgba|yuva|gbrap|argb|bgra)/.test(video.pix_fmt ?? ""),
  };
}

function sha256(file: string) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const projectId = required("--project");
const provider = required("--provider");
const licenseName = required("--license-name");
const licenseUrl = required("--license-url");
const sourceStatus = required("--source-status") as "owned" | "licensed" | "public_domain" | "reference_only";
if (!["owned", "licensed", "public_domain", "reference_only"].includes(sourceStatus)) throw new Error("Invalid --source-status");

const root = process.cwd();
const projectRoot = path.join(root, "projects", projectId);
// Project media is the creator's own: it goes to the profile's personal library unless
// --shared names the shared catalog (only for generic, redistributable stock).
const shared = process.argv.includes("--shared");
const catalogRoot = shared
  ? process.env.TIMELINE_VISUAL_CATALOG_DIR ? path.resolve(process.env.TIMELINE_VISUAL_CATALOG_DIR) : path.join(root, "visual-catalog")
  : personalLibraryRoot("visuals");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "source-manifest.json"), "utf8")) as SourceManifest;
const annotations = JSON.parse(fs.readFileSync(path.join(projectRoot, "library-annotations.json"), "utf8")) as ProjectAnnotations;
const catalogPath = path.join(catalogRoot, "catalog.json");
const catalog = fs.existsSync(catalogPath) || shared
  ? visualCatalogSchema.parse(JSON.parse(fs.readFileSync(catalogPath, "utf8")))
  : { schema_version: 1 as const, assets: [] };
const byId = new Map(catalog.assets.map((asset) => [asset.id, asset]));
const statusDirectory = sourceStatus === "public_domain" ? "public-domain" : sourceStatus;
const providerDirectory = slug(provider);
let promoted = 0;

for (const source of manifest.assets) {
  const annotation = annotations.assets[source.media_path];
  if (!annotation) continue;
  const sourceFile = path.join(projectRoot, "media", source.media_path);
  if (!fs.existsSync(sourceFile)) throw new Error(`Missing project media: ${sourceFile}`);
  const id = `${slug(provider)}-${slug(path.basename(source.media_path, path.extname(source.media_path)))}`;
  if (byId.has(id)) continue;
  const ext = path.extname(source.media_path).toLowerCase();
  const type = [".mp4", ".mov", ".webm", ".m4v", ".gif"].includes(ext) ? "video_clip" : "still";
  const probe = mediaProbe(sourceFile);
  const relativeFile = `${statusDirectory}/${providerDirectory}/${path.basename(source.media_path)}`;
  const destination = path.join(catalogRoot, shared ? "media" : "files", relativeFile);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(sourceFile, destination);
  const actualHash = sha256(destination);
  if (actualHash !== source.source_sha256) throw new Error(`Hash mismatch for ${source.media_path}`);
  const primarySource = annotation.sources[0];
  if (!primarySource) throw new Error(`No source annotation for ${source.media_path}`);
  const entry: VisualCatalogEntry = {
    id,
    type,
    title: annotation.display_name,
    description: annotation.meaning,
    file: relativeFile,
    sha256: actualHash,
    width: probe.width,
    height: probe.height,
    duration_seconds: type === "video_clip" ? probe.durationSeconds : null,
    has_alpha_channel: probe.hasAlphaChannel,
    source: {
      provider,
      asset_url: primarySource.url,
      license_name: licenseName,
      license_url: licenseUrl,
      source_status: sourceStatus,
      acquired_at: source.imported_at,
      acquisition_notes: `Promoted from project ${projectId}; original filename ${source.original_filename}.`,
    },
    annotation: {
      meaning: annotation.meaning,
      use_cases: annotation.use_cases,
      tone: annotation.tone,
      template_structure: annotation.template_structure,
      cultural_context: annotation.cultural_context,
      avoid_when: annotation.avoid_when,
      tags: annotation.tags,
      confidence: annotation.confidence,
      sources: annotation.sources.map((item) => ({
        ...item,
        kind: item.kind === "template_page" ? "asset_page" : item.kind,
      })),
    },
  };
  byId.set(id, entry);
  promoted += 1;
}

const next = visualCatalogSchema.parse({ schema_version: 1, assets: [...byId.values()] });
const temporary = `${catalogPath}.${process.pid}.tmp`;
fs.mkdirSync(catalogRoot, { recursive: true });
fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`);
fs.renameSync(temporary, catalogPath);
process.stdout.write(`${JSON.stringify({ project_id: projectId, promoted, catalog_assets: next.assets.length })}\n`);
