import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";

import { frameCheckRenderSources, sdrExportSources } from "./export-render-sources";
import { HDR_CODE_VIDEO_RECIPE } from "../media-analysis/color-profile";
import type { PreparedMedia } from "./media-preparation";

const clip = (id: string, source: string, props: Record<string, unknown> = {}) => ({ id, type: "video_clip", source_url: source, props }) as unknown as TimelineElement;
const media = (relative: string) => `/api/projects/p/media/${relative}`;

test("GPU export swaps an HDR clip for its prepared SDR copy and leaves everything else alone", () => {
  const cutout = clip("cut", media("cutouts/a.webm"), { has_alpha: true });
  const sdr = clip("sdr", media("sources/b.mp4"));
  const unprepared = clip("raw", media("cutouts/c.webm"));
  const title = { id: "t", type: "caption_text", source_url: null, props: {} } as unknown as TimelineElement;
  const out = sdrExportSources("p", [cutout, sdr, unprepared, title], {
    isHdr: (url) => url.includes("cutouts/"),
    preparedRender: (source) => source === "cutouts/a.webm" ? ".prepared/x/render.webm" : null,
  });
  assert.equal(out[0]!.source_url, media(".prepared/x/render.webm"));
  assert.equal(out[0]!.props?.has_alpha, true);
  // SDR sources, clips with no prepared copy and non-video elements keep their identity.
  assert.equal(out[1], sdr);
  assert.equal(out[2], unprepared);
  assert.equal(out[3], title);
  assert.equal(cutout.source_url, media("cutouts/a.webm"));
});

test("a frame check draws HDR footage as the editor shows it, never the browser-tone-mapped original", () => {
  const hlg = { source_color_space: { transfer: "hlg", primaries: "rec2020", max_cll_nits: null } };
  const awaiting = clip("walk", media("sources/take.mov"), hlg);
  const made = clip("other", media("sources/made.mov"), hlg);
  const sdr = clip("sdr", media("sources/plain.mp4"));
  const records: Record<string, Partial<PreparedMedia>> = {
    // Authority deferred to export: placed and previewed from its code-value proxy.
    "sources/take.mov": { state: "ready", source: "sources/take.mov", render: "sources/take.mov", preview: ".prepared/t/preview.mp4", render_authority: ".prepared/t/render.mp4" as never,
      preview_color_management: { source_encoding: { transfer: "hlg", primaries: "rec2020", max_cll_nits: null } } as never },
    "sources/made.mov": { state: "ready", source: "sources/made.mov", render: ".prepared/m/render.mp4", preview: ".prepared/m/preview.mp4", color_management: { recipe_id: HDR_CODE_VIDEO_RECIPE } as never },
    "sources/plain.mp4": { state: "ready", source: "sources/plain.mp4", render: "sources/plain.mp4", preview: ".prepared/p/preview.mp4" },
  };
  const { clips, fromProxy } = frameCheckRenderSources("p", [awaiting, made, sdr], (source) => (records[source] ?? null) as PreparedMedia | null);
  assert.equal(clips[0]!.source_url, media(".prepared/t/preview.mp4"), "deferred authority: the editor's code-value proxy");
  assert.equal(clips[1]!.source_url, media(".prepared/m/render.mp4"), "made authority: the authority");
  assert.equal(clips[2], sdr, "SDR footage draws its own file");
  assert.deepEqual(fromProxy, ["sources/take.mov"]);
  assert.equal(awaiting.source_url, media("sources/take.mov"), "the saved timeline is not changed");
});
