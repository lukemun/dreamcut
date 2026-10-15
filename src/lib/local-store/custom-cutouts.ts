import path from "node:path";

import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { projectMediaIndexDir } from "./paths";

export type CustomCutoutPoint = { x: number; y: number };

export type CustomCutoutReceipt = {
  cutout_id: string;
  preparation?: {
    cache_key: string;
    output_sha256: string;
    masks: Array<{ name: string; sha256: string }>;
    tracking_width: number;
    tracking_height: number;
    subject: string;
    correction?: { parent_cutout_id: string; other_cutout_id?: string; mode: "reprompt" | "union" | "intersection"; frame_start?: number; frame_end?: number; roi?: [number, number, number, number] };
  };
  recipe_id: "sam2-custom-cutout/v1" | "sam2-custom-cutout/v2" | "sam2-custom-cutout/v3" | "sam2-custom-cutout/v4" | "sam2-custom-cutout/v5";
  rgb_source_strategy?: "direct-source-decode";
  scratchpad_treatment?: {
    recipe_id: "scratchpad-alpha-outline/v1";
    parent_cutout_id: string;
    parent_sha256: string;
    output_sha256: string;
    outline_width: number;
    alpha_range?: [number, number];
    full_perimeter?: true;
    interior_holes_filled?: true;
    largest_component_only?: true;
    content_inset_pixels?: number;
    bottom_boundary_ratio?: number;
  };
  preview?: { relative_path: string; sha256: string; frame_count: number; duration_seconds: number; width: number; height: number; recipe: string };
  mask_postprocessing?: {
    fill_small_enclosed_holes: true;
    max_hole_area_ratio: number;
  };
  source_relative_path: string;
  source_sha256: string;
  source_interval_seconds: [number, number];
  prompt_seconds: number;
  prompt_frame: number;
  positive_points_normalized: CustomCutoutPoint[];
  negative_points_normalized: CustomCutoutPoint[];
  output_relative_path: string;
  output_duration_seconds: number;
  width: number;
  height: number;
  frame_rate: number;
  frame_count: number;
  alpha_mode: "1";
  evidence_directory: string;
  created_at: string;
};

type CustomCutoutIndex = {
  schema_version: 1;
  cutouts: CustomCutoutReceipt[];
};

const EMPTY_INDEX: CustomCutoutIndex = { schema_version: 1, cutouts: [] };

function indexPath(projectId: string): string {
  return path.join(projectMediaIndexDir(projectId), "custom-cutouts.json");
}

function validateIndex(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid custom cutout index");
  const candidate = value as Partial<CustomCutoutIndex>;
  if (candidate.schema_version !== 1 || !Array.isArray(candidate.cutouts)) throw new Error("Invalid custom cutout index");
}

export function readCustomCutouts(projectId: string): CustomCutoutIndex {
  return readJsonFile(indexPath(projectId), EMPTY_INDEX);
}

export function appendCustomCutout(projectId: string, receipt: CustomCutoutReceipt): void {
  const current = readCustomCutouts(projectId);
  const next: CustomCutoutIndex = {
    schema_version: 1,
    cutouts: [...current.cutouts.filter((item) => item.cutout_id !== receipt.cutout_id), receipt],
  };
  writeJsonFileAtomic(indexPath(projectId), next, validateIndex);
}

export function customCutoutByRelativePath(projectId: string): Map<string, CustomCutoutReceipt> {
  return new Map(readCustomCutouts(projectId).cutouts.map((receipt) => [receipt.output_relative_path, receipt]));
}
