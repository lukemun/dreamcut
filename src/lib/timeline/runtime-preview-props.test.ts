import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";

import {
  mergeElementListPreservingRuntimePreview,
  mergeElementPreservingRuntimePreview,
} from "./runtime-preview-props";

function video(overrides: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id: "video-1",
    type: "video_clip",
    source_url: "/original.mov",
    timeline_start: 0,
    duration: 5,
    lane_key: "visual_1",
    lane_index: 1,
    volume: 0,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    trim_start: 0,
    trim_end: 0,
    position_locked: false,
    props: {
      media_scale: 1,
      runtime_preview_source_url: "/prepared/preview.mp4",
      runtime_preview_preparation: { state: "ready" },
      preview_proxy_validation: {
        contract: "preview-proxy-v1",
        url: "/prepared/preview.mp4",
        ok: true,
        width: 360,
        height: 640,
      },
    },
    ...overrides,
  } as TimelineElement;
}

test("ordinary video patches preserve the verified runtime proxy binding", () => {
  const current = video();
  const saved = video({ props: { media_scale: 1.15 } });
  const merged = mergeElementPreservingRuntimePreview(current, saved);

  assert.equal(merged.props?.media_scale, 1.15);
  assert.equal(merged.props?.runtime_preview_source_url, "/prepared/preview.mp4");
  assert.deepEqual(merged.props?.runtime_preview_preparation, { state: "ready" });
  assert.equal((merged.props?.preview_proxy_validation as { ok?: boolean })?.ok, true);
});

test("runtime proxy state is not carried across a source replacement", () => {
  const current = video();
  const saved = video({ source_url: "/replacement.mov", props: { media_scale: 1.15 } });
  const merged = mergeElementPreservingRuntimePreview(current, saved);

  assert.equal(merged.source_url, "/replacement.mov");
  assert.equal(merged.props?.runtime_preview_source_url, undefined);
  assert.equal(merged.props?.preview_proxy_validation, undefined);
});

test("full caption-follower responses retain runtime state for unchanged media", () => {
  const current = video();
  const caption = video({ id: "caption-1", type: "caption_text", source_url: null, lane_key: "captions_0", props: { text: "Hello" } });
  const saved = video({ timeline_start: 1, props: { media_scale: 1 } });
  const merged = mergeElementListPreservingRuntimePreview([current, caption], [saved, caption]);

  assert.equal(merged[0]?.timeline_start, 1);
  assert.equal(merged[0]?.props?.runtime_preview_source_url, "/prepared/preview.mp4");
  assert.equal(merged[1]?.props?.text, "Hello");
});

test('caption media evidence never survives an original or preview replacement or a durable save',async()=>{
 const {stripRuntimePreviewProps,mergeRuntimePreviewProps}=await import('./runtime-preview-props');
 const evidence={sourceUrl:'/fill-original.mp4',previewUrl:'/fill-preview.mp4',validation:{ok:true}};
 const current=video({type:'caption_text',source_url:null,props:{mediaFillVideoUrl:evidence.sourceUrl,mediaFillVideoPreviewUrl:evidence.previewUrl,runtime_media_fill_preview:evidence}});
 assert.equal(stripRuntimePreviewProps(current.props).runtime_media_fill_preview,undefined);
 for(const key of ['mediaFillVideoUrl','mediaFillVideoPreviewUrl']){
  const changed={...current,props:{mediaFillVideoUrl:evidence.sourceUrl,mediaFillVideoPreviewUrl:evidence.previewUrl,[key]:'/replacement.mp4'}};
  assert.equal(mergeElementPreservingRuntimePreview(current,changed).props?.runtime_media_fill_preview,undefined);
  assert.equal(mergeRuntimePreviewProps([changed],[current])[0].props?.runtime_media_fill_preview,undefined);
 }
 const saved={...current,props:{mediaFillVideoUrl:evidence.sourceUrl,mediaFillVideoPreviewUrl:evidence.previewUrl,text:'New words'}};
 assert.deepEqual(mergeElementPreservingRuntimePreview(current,saved).props?.runtime_media_fill_preview,evidence);
});
