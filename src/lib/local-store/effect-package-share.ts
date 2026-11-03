import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { projectDir } from "./paths";
import { profileDir } from "./editing-memory";
import { writeJsonFileAtomic } from "./atomic-json";
import { cloudFetch, type Fetcher } from "./cloud-account";
import { effectPackageManifestSchema, packageRole, safePackagePath, PACKAGE_FILE_LIMIT } from "./effect-package-contract";
const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const sourceSchema = z.object({ root: z.enum(["repository", "project"]), path: z.string().min(1).max(500), name: safePackagePath, role: packageRole, license: z.string().trim().min(1).max(500) }).strict();
export const effectPackageRequestSchema = z.object({
  action: z.enum(["prepare_package", "submit_package"]),
  package: z.object({ title: z.string(), credit: z.string(), base_revision: z.string(), files: z.array(sourceSchema).max(100) }).strict(),
  package_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  authorization: z.string().trim().min(1).max(2000).optional(),
}).strict();
type Request = z.infer<typeof effectPackageRequestSchema>;
function sourceFile(projectId: string, source: Request["package"]["files"][number]) {
  const root = fs.realpathSync(source.root === "repository" ? process.cwd() : projectDir(projectId));
  const relative = source.path.replaceAll("\\", "/");
  if (path.isAbsolute(relative) || relative.split("/").some(p => !p || p === ".." || p === ".")) throw new Error("Package sources must be explicit relative files.");
  const allowed = source.root === "repository" ? /^(\.agents\/skills|src|scripts|docs|tests|public)\// : /^(media|renders|instruments|contributions)\//;
  const permitted = (candidate: string) => allowed.test(candidate) && !/(^|\/)(\.env[^/]*|\.git|node_modules|credentials?[^/]*|[^/]*\.(pem|key))($|\/)/i.test(candidate);
  if (!permitted(relative)) throw new Error("Source is outside contribution file locations or contains private credentials.");
  const file = fs.realpathSync(path.join(root, relative));
  if (!file.startsWith(root + path.sep) || !fs.statSync(file).isFile()) throw new Error("Package source escapes its root or is not a regular file.");
  // Check where a symlink actually lands too, so public/x -> ../.env.local cannot pass as a public file.
  if (!permitted(path.relative(root, file).split(path.sep).join("/"))) throw new Error("Source is outside contribution file locations or contains private credentials.");
  const size = fs.statSync(file).size;
  if (!size || size > PACKAGE_FILE_LIMIT) throw new Error("Each contribution file must be nonempty and at most 50 MiB. Split larger footage into declared parts.");
  return file;
}
function prepare(projectId: string, request: Request) {
  const sources = request.package.files.map(file => sourceFile(projectId, file));
  const manifest = effectPackageManifestSchema.parse({ ...request.package, schema_version: 1, files: request.package.files.map((file, i) => {
    const bytes = fs.readFileSync(sources[i]);
    return { name: file.name, role: file.role, license: file.license, bytes: bytes.length, sha256: hash(bytes) };
  }) });
  return { sources, manifest, package_sha256: hash(JSON.stringify(manifest)) };
}
const draftSchema = z.object({ id: z.string().uuid(), uploads: z.array(z.object({ name: z.string(), uploadUrl: z.string().url(), uploaded: z.boolean().optional() })) });
async function checked(response: Response) { if (!response.ok) throw new Error(`Contribution request failed (HTTP ${response.status}). Keep the draft receipt and retry the same package.`); return response.json(); }
export async function shareEffectPackage(projectId: string, raw: unknown, fetcher: Fetcher = fetch) {
  const request = effectPackageRequestSchema.parse(raw);
  const prepared = prepare(projectId, request);
  const receiptFile = path.join(profileDir(), "cloud-sync", "effect-packages", `${prepared.package_sha256}.json`);
  if (request.action === "prepare_package") return { manifest: prepared.manifest, package_sha256: prepared.package_sha256, destination: "Private DreamCut effect review inbox", publication: "Review only. Nothing is installed or published." };
  if (!request.authorization) throw new Error("Explicit creator authorization to upload all listed files for DreamCut review is required.");
  if (request.package_sha256 !== prepared.package_sha256) throw new Error("Package changed. Prepare and review the full manifest again.");
  const draft = draftSchema.parse(await checked(await cloudFetch("/api/v1/effect-packages", { method: "POST", body: JSON.stringify({ action: "create", manifest: prepared.manifest }) }, fetcher)));
  writeJsonFileAtomic(receiptFile, { id: draft.id, status: "uploading", package_sha256: prepared.package_sha256, authorization: request.authorization });
  if (draft.uploads.length !== prepared.manifest.files.length || new Set(draft.uploads.map(u => u.name)).size !== draft.uploads.length) throw new Error("Cloud returned an incomplete upload manifest.");
  for (let i = 0; i < prepared.manifest.files.length; i++) {
    const file = prepared.manifest.files[i];
    const upload = draft.uploads.find(u => u.name === file.name);
    if (!upload || new URL(upload.uploadUrl).protocol !== "https:") throw new Error("Cloud returned an invalid upload destination.");
    if (upload.uploaded) continue;
    const bytes = fs.readFileSync(prepared.sources[i]);
    if (hash(bytes) !== file.sha256) throw new Error("Package file changed during upload. Prepare again.");
    // Storage may answer a signed upload with an empty or non-JSON body; only the status matters here.
    const put = await fetcher(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: new Uint8Array(bytes), signal: AbortSignal.timeout(300000) });
    if (!put.ok) throw new Error(`Contribution upload failed (HTTP ${put.status}). Keep the draft receipt and retry the same package.`);
  }
  const result = await checked(await cloudFetch("/api/v1/effect-packages", { method: "POST", body: JSON.stringify({ action: "submit", id: draft.id }), signal: AbortSignal.timeout(300000) }, fetcher));
  writeJsonFileAtomic(receiptFile, { id: draft.id, status: "submitted", package_sha256: prepared.package_sha256, authorization: request.authorization, manifest: prepared.manifest, submitted_at: new Date().toISOString() });
  return result;
}
