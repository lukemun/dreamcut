import fs from "node:fs";
import path from "node:path";

import { fingerprintReviewBuild } from "@/lib/instruments/review-build-cache";

const RECEIPT_NAME = ".timeline-render-bundle.json";

export type RenderBundleReceipt = {
  schema_version: 1;
  fingerprint: string;
  built_at: string;
};

export function renderBundleFingerprint(root: string): string {
  return fingerprintReviewBuild(root);
}

export function renderBundleCacheRoot(root: string): string {
  return path.join(root, ".cache", "remotion-bundles");
}

export function renderBundleCacheDir(root: string, fingerprint: string): string {
  return path.join(renderBundleCacheRoot(root), fingerprint);
}

export function renderBundleReceiptPath(bundleDir: string): string {
  return path.join(bundleDir, RECEIPT_NAME);
}

export function readRenderBundleReceipt(bundleDir: string): RenderBundleReceipt | null {
  try {
    const value = JSON.parse(fs.readFileSync(renderBundleReceiptPath(bundleDir), "utf8")) as Partial<RenderBundleReceipt>;
    return value.schema_version === 1
      && typeof value.fingerprint === "string"
      && typeof value.built_at === "string"
      ? value as RenderBundleReceipt
      : null;
  } catch {
    return null;
  }
}

export function isRenderBundleFresh(bundleDir: string, fingerprint: string): boolean {
  return fs.existsSync(path.join(bundleDir, "index.html"))
    && readRenderBundleReceipt(bundleDir)?.fingerprint === fingerprint;
}

export function writeRenderBundleReceipt(
  bundleDir: string,
  fingerprint: string,
  builtAt = new Date().toISOString(),
): RenderBundleReceipt {
  const receipt: RenderBundleReceipt = {
    schema_version: 1,
    fingerprint,
    built_at: builtAt,
  };
  fs.writeFileSync(renderBundleReceiptPath(bundleDir), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}
