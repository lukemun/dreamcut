import assert from "node:assert/strict";
import test from "node:test";
import { compoundAppearance, compoundMemberSignature, projectCompoundPreviews, type CompoundPreviewReceipt } from "./compound-preview";
import type { CompositionElement } from "@/lib/render/composition-adapters";
import { resolveVideoPlaybackSource } from "../remotion/video-preview-source";
const make = (id:string,start:number):CompositionElement => ({id,type:"video_clip",source_url:`/${id}.webm`,timeline_start:start,duration:2,lane_key:"visual_1",lane_index:1,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,props:{has_alpha:true,media_scale:.38,preview_source_url:`/${id}-preview.webm`}});
function fixture() {
  const raw=[make("a",0),make("b",2)];
  const receipt:CompoundPreviewReceipt={id:"group",source_url:"/compound.webm",sha256:"hash",duration:4,frame_count:120,members:raw.map(e=>({id:e.id,signature:compoundMemberSignature(e)}))};
  return raw.map(e=>({...e,props:{...e.props,compound_clip_id:"group",compound_preview:receipt}}));
}
function runtimeFixture() {
  return fixture().map(e => ({ ...e, props: {
    ...e.props,
    compound_clip_id: undefined,
    compound_preview: undefined,
    runtime_compound_clip_id: e.props?.compound_clip_id,
    runtime_compound_preview: e.props?.compound_preview,
  } }));
}
test("preview uses one continuous decoder across the member boundary, export retains original sections",()=>{
  const e=fixture(); const preview=projectCompoundPreviews(e,false);
  assert.equal(preview.length,1);assert.equal(preview[0]!.duration,4);assert.equal(preview[0]!.source_url,"/compound.webm");
  assert.strictEqual(projectCompoundPreviews(e,true),e);
  assert.equal(e[0]!.source_url,"/a.webm");
});
test("timing, appearance, source, missing-member and break-apart edits invalidate the compiled preview",()=>{
  for(const change of [
    (e:CompositionElement[])=>{e[1]!.timeline_start+=.1;},
    (e:CompositionElement[])=>{e[1]!.props!.media_scale=.5;},
    (e:CompositionElement[])=>{e[1]!.source_url="/new.webm";},
    (e:CompositionElement[])=>{e[1]!.props!.compound_clip_id=null;},
  ]){const e=fixture();change(e);assert.deepEqual(projectCompoundPreviews(e,false),e);}
  const e=fixture().slice(0,1);assert.deepEqual(projectCompoundPreviews(e,false),e);
});
test("shared outer framing keeps the continuous proxy, but divergent framing invalidates it", () => {
  const shared = fixture().map(element => ({
    ...element,
    props: {
      ...element.props,
      media_scale: 0.31,
      media_offset_x: 0.04,
      media_offset_y: -0.22,
      semantic_layout: { schema_version: 1, slot: "lower_center", size: "supporting", frame_model: "canvas" },
    },
  }));
  const projected = projectCompoundPreviews(shared, false);
  assert.equal(projected.length, 1);
  assert.equal(projected[0]!.props?.media_scale, 0.31);
  assert.equal(projected[0]!.props?.media_offset_x, 0.04);
  assert.equal(projected[0]!.props?.media_offset_y, -0.22);
  assert.deepEqual(projected[0]!.props?.semantic_layout, {
    schema_version: 1,
    slot: "lower_center",
    size: "supporting",
    frame_model: "canvas",
  });

  const divergent = fixture();
  divergent[1]!.props = { ...divergent[1]!.props, media_offset_y: -0.22 };
  assert.deepEqual(projectCompoundPreviews(divergent, false), divergent);
});
test("audio and caption elements are neither flattened nor retimed",()=>{
  const extra={...make("voice",0),type:"vo_segment",lane_key:"audio_narrator",volume:1};
  const out=projectCompoundPreviews([...fixture(),extra],false);assert.strictEqual(out[1],extra);
});
test("automatic member proxies never invalidate or override the continuous compound", () => {
  const elements = fixture().map(e => ({ ...e, props: { ...e.props,
    runtime_preview_source_url: "/new-member.webm", runtime_preview_preparation: { state: "ready" },
    compound_proxy_validation: { contract: "preview-proxy-v1", url: "/compound.webm", ok: true, width: 360, height: 640 },
  } }));
  const preview = projectCompoundPreviews(elements, false);
  assert.equal(preview.length, 1);
  assert.equal(resolveVideoPlaybackSource(preview[0]!, preview[0]!.source_url, false), "/compound.webm");
});
test("a disposable runtime compound uses one decoder and never changes export authority", () => {
  const elements = runtimeFixture();
  const preview = projectCompoundPreviews(elements, false);
  assert.equal(preview.length, 1);
  assert.equal(preview[0]!.source_url, "/compound.webm");
  assert.strictEqual(projectCompoundPreviews(elements, true), elements);
});
test("source-preparation provenance does not split an otherwise identical compound appearance", () => {
  const [first, second] = fixture();
  first!.props = { ...first!.props, archival_source_url: "/source-a.webm", media_preparation_recipe: "editor-media-v1" };
  second!.props = { ...second!.props, archival_source_url: "/source-b.webm", media_preparation_recipe: "editor-media-v1" };
  assert.equal(compoundAppearance(first!), compoundAppearance(second!));
});
