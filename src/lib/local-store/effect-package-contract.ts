/** Mirrored in DreamCut Cloud; review packages are inert files, never installed or published. */
import { z } from "zod";
import { createHash } from "node:crypto";
export const PACKAGE_BUCKET = "effect-contributions";
export const PACKAGE_FILE_LIMIT = 50 * 1024 * 1024;
export const PACKAGE_TOTAL_LIMIT = 500 * 1024 * 1024;
export const packageRole = z.enum(["recipe", "skill", "runtime", "tests", "input", "result", "instructions", "evidence", "license", "asset"]);
export const safePackagePath = z.string().min(1).max(240).regex(/^[A-Za-z0-9_][A-Za-z0-9_./-]*$/).refine(p => !p.split("/").some(s => !s || s === "." || s === ".." || s.startsWith(".") || s.endsWith(".") || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)), "Use a portable relative file path without dot segments.");
export const effectPackageManifestSchema = z.object({
  schema_version: z.literal(1), title: z.string().trim().min(1).max(100), credit: z.string().trim().min(1).max(60),
  base_revision: z.string().regex(/^[a-f0-9]{40}$/),
  files: z.array(z.object({ name: safePackagePath, role: packageRole, bytes: z.number().int().positive().max(PACKAGE_FILE_LIMIT), sha256: z.string().regex(/^[a-f0-9]{64}$/), license: z.string().trim().min(1).max(500) }).strict()).min(7).max(100),
}).strict().superRefine((p, ctx) => {
  for (const role of ["recipe", "skill", "input", "result", "instructions", "evidence", "license"]) if (!p.files.some(f => f.role === role)) ctx.addIssue({ code: "custom", message: `Include a ${role} file.` });
  if (p.files.some(f => f.role === "runtime") && !p.files.some(f => f.role === "tests")) ctx.addIssue({ code: "custom", message: "Runtime changes require tests." });
  if (new Set(p.files.map(f => f.name.toLowerCase())).size !== p.files.length) ctx.addIssue({ code: "custom", message: "Package filenames must be unique, including case." });
  if (p.files.reduce((n, f) => n + f.bytes, 0) > PACKAGE_TOTAL_LIMIT) ctx.addIssue({ code: "custom", message: "Package exceeds 500 MiB." });
});
export type EffectPackageManifest = z.infer<typeof effectPackageManifestSchema>;

export function verifyPackageBytes(file: EffectPackageManifest["files"][number], bytes: Uint8Array) {
  return bytes.byteLength === file.bytes && createHash("sha256").update(bytes).digest("hex") === file.sha256;
}
