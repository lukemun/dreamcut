import fs from "node:fs";
import path from "node:path";
import { profileDir } from "../local-store/editing-memory";
import { readEnv } from "@/lib/env-name";

/** Outside the repository by default; the override is for isolated verification. */
export function localOtelDirectory() {
  const configured = readEnv("OTEL_DIR")?.trim();
  return configured ? path.resolve(configured) : path.join(profileDir(), "otel");
}

export function localCollectorCommand() {
  const verified = path.resolve("private/tooling/otel-0.162.0/otelcol-contrib");
  return {
    binary: readEnv("OTELCOL_EXECUTABLE") || (fs.existsSync(verified) ? verified : "otelcol-contrib"),
    config: path.resolve("scripts/otel/collector.yaml"),
  };
}
