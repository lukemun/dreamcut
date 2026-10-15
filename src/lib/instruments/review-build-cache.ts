import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const REVIEW_BUILD_RECEIPT = ".timeline-review-build.json";

const SOURCE_ROOTS = ["src", "public"];
const SOURCE_FILES = [
  "package.json",
  "pnpm-lock.yaml",
  "next.config.ts",
  "tsconfig.json",
  "postcss.config.mjs",
];

export type ReviewBuildReceipt = {
  schema_version: 1;
  fingerprint: string;
  built_at: string;
};

function collectFiles(root: string, relative: string, files: string[]) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return;
  const stat = fs.statSync(absolute);
  if (stat.isFile()) {
    files.push(relative);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) collectFiles(root, child, files);
    else if (entry.isFile()) files.push(child);
  }
}

export function reviewBuildInputFiles(root: string): string[] {
  const files: string[] = [];
  for (const relative of SOURCE_FILES) collectFiles(root, relative, files);
  for (const relative of SOURCE_ROOTS) collectFiles(root, relative, files);
  return files.sort();
}

export function fingerprintReviewBuild(root: string): string {
  const hash = crypto.createHash("sha256");
  for (const relative of reviewBuildInputFiles(root)) {
    hash.update(relative);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(root, relative)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function reviewBuildReceiptPath(root: string): string {
  return path.join(root, ".next-review", REVIEW_BUILD_RECEIPT);
}

export function readReviewBuildReceipt(root: string): ReviewBuildReceipt | null {
  try {
    const value = JSON.parse(fs.readFileSync(reviewBuildReceiptPath(root), "utf8")) as Partial<ReviewBuildReceipt>;
    return value.schema_version === 1
      && typeof value.fingerprint === "string"
      && typeof value.built_at === "string"
      ? value as ReviewBuildReceipt
      : null;
  } catch {
    return null;
  }
}

export function isReviewBuildFresh(root: string, fingerprint = fingerprintReviewBuild(root)): boolean {
  const receipt = readReviewBuildReceipt(root);
  return fs.existsSync(path.join(root, ".next-review", "BUILD_ID"))
    && receipt?.fingerprint === fingerprint;
}

export function writeReviewBuildReceipt(
  root: string,
  fingerprint: string,
  builtAt = new Date().toISOString(),
): ReviewBuildReceipt {
  const receipt: ReviewBuildReceipt = {
    schema_version: 1,
    fingerprint,
    built_at: builtAt,
  };
  const target = reviewBuildReceiptPath(root);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
