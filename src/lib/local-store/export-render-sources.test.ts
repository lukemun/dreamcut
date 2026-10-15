import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";

import { sdrExportSources } from "./export-render-sources";

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
