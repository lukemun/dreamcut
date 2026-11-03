import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileBlock, resolveBlockSettings, setBlockSetting, validateBlockRanges, type BlockInstance } from "./proposal-blocks";
import { deriveProposalTimeline, editorAgentOptionSchema, editorAgentProposalSchema } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides, applyProposalReviewOverrides } from "./proposal-overrides";
import { withFrameRate } from "../timeline/frame-rate-scope";
import { cameraPoint, cameraViewAt } from "../timeline/camera";
import { resolveMediaTransformAtTime } from "../timeline/media-transform";
import { resolveTransitionEffects } from "../timeline/transition-effects";
import { keyedStillMotionBlock, snapKeyedStillFocusRoundoff } from "./proposal-blocks-keyed-still";
import { createProject, readMetadata, writeMetadata, type TimelineFile } from "../local-store/store";
import { writePreparation } from "../local-store/media-preparation";
import { projectMediaDir } from "../local-store/paths";

// Contract fixtures deliberately contain no course pixels and are never rendering evidence.
process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "floating-book-contract-"));
createProject("floating-fixture", "web");
for (const name of ["room.mp4", "hands.webm"]) {
  const file = path.join(projectMediaDir("floating-fixture"), name);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, "contract only"); fs.writeFileSync(file + ".preview.mp4", "contract only");
  const stat = fs.statSync(file);
  writePreparation("floating-fixture", { recipe: "editor-media-v1", source: name, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: name + ".preview.mp4", render: name, duration: 10, alpha: name.endsWith("webm") });
}
const empty: TimelineFile = { elements: [], transitions: [] };
function fixture(extra: Record<string, unknown> = {}): BlockInstance {
  return { block_id: "floating-book", kind: "keyed_still_motion", version: 1, frame_rate: 30, seed: "floating-test", settings: { travel: 100, turn: 12, growth: 40 }, inputs: {
    background: { source_url: "/api/projects/floating-fixture/media/room.mp4", source_duration_seconds: 10, source_start_seconds: 1.25 },
    photograph: { source_url: "/api/projects/floating-fixture/media/book.png", key_color: "#40a644", mask_inset: [.1,.15,.1,.15] },
    canvas: { width: 1080, height: 1920 }, duration_seconds: 6.7,
    from: { x: 35, y: 80 }, to: { x: 65, y: -15 }, lane_order_keys: ["visual_2", "visual_1", "visual_0"], ...extra,
  } };
}
const option = (block: BlockInstance) => editorAgentOptionSchema.parse({ id: "float", label: "Floating Book", summary: "Keyed still", recommended: true, operations: [], blocks: [block] });
function derive(block: BlockInstance) {
  writeMetadata("floating-fixture", { ...readMetadata("floating-fixture"), frame_rate: block.frame_rate ?? 30 }, "fixture");
  return withFrameRate(block.frame_rate ?? 30, () => deriveProposalTimeline(empty, option(block).operations, "floating-fixture").timeline.elements);
}

test("native layers retain continuous background, chroma mask and local colour, with the photograph alone following the camera", () => {
  const elements = derive(fixture());
  assert.equal(elements.length, 4);
  const bg = elements.find(e => e.type === "video_clip")!, photo = elements.find(e => e.type === "still")!, camera = elements.find(e => e.props?.title === "Book movement")!;
  assert.equal(bg.trim_start, 38 / 30); assert.equal(bg.duration, 6.7); assert.equal(bg.volume, 1);
  assert.equal(photo.volume, 0); assert.equal(photo.props?.camera_id, camera.id); assert.equal(bg.props?.camera_id, elements.find(e => e.props?.title === "Scene push-in")!.id);
  assert.equal(photo.props?.chroma_key_model, "color-key-v1"); assert.equal(photo.props?.chroma_key_color, "#40a644");
  const firstMask = photo.props?.mask_inset as number[];
  [.1,.15,.1,.15].map(v=>.5+(v-.5)*(photo.props!.media_scale as number)).forEach((v,n)=>assert.ok(Math.abs(firstMask[n]! - v) < 1e-9));
  assert.equal((photo.props?.keyframes as Record<string,unknown[]> | undefined)?.mask_inset, undefined);
  assert.equal(photo.props?.grade_exposure_ev ?? 0, 0); assert.equal(photo.props?.grade_tint ?? 0, 0);
});

test("position compensation preserves the intended screen path at every output frame on both canvas orientations", () => {
  for (const [width, height] of [[1080,1920], [1920,1080]]) for (const fps of [24,30,60]) for (const ease of ["linear", "smooth"]) {
    const block = { ...fixture({ canvas: { width, height } }), frame_rate: fps };
    block.settings = { ...block.settings, ease, turn: 15 };
    const elements = derive(block), photo = elements.find(e => e.type === "still")!, camera = elements.find(e => e.props?.title === "Book movement")!;
    const last = Math.round(6.7 * fps) - 1;
    for (let frame = 0; frame <= last; frame++) {
      const t = frame / fps, transform = resolveMediaTransformAtTime(photo.props, t);
      const [x,y] = cameraPoint(cameraViewAt(camera, t, width!, height!), width! / 2 * (1 + transform.offsetX), height! / 2 * (1 + transform.offsetY), width!, height!);
      const u = frame / last, p = ease === "smooth" ? u*u*(3-2*u) : u;
      assert.ok(Math.abs(x - width! * (.35 + .3*p)) < 1, `x drift ${x} at ${frame}/${last}`);
      assert.ok(Math.abs(y - height! * (.8 - .95*p)) < 1, `y drift ${y} at ${frame}/${last}`);
    }
    assert.equal(cameraViewAt(camera, last / fps, width!, height!).rotationDeg, -15);
  }
});

test("every advertised dial and combined endpoints parse; off values remove all motion; overrides reset exactly", () => {
  const b = fixture(); validateBlockRanges(b);
  for (const end of ["min", "max"] as const) {
    let tuned = b;
    for (const s of resolveBlockSettings(b)) if (s.setting.kind === "number") tuned = setBlockSetting(tuned, s.field, s.range[end]);
    derive(tuned);
  }
  const off = { ...b, settings: { travel: 0, turn: 0, growth: 0 } };
  const ops = compileBlock(off);
  for (const op of ops.filter(o => o.create_shape)) {
    const shape = op.create_shape as {keyframes: Record<string, {v:number}[]>};
    for (const track of Object.values(shape.keyframes)) assert.equal(new Set(track.map(k => k.v)).size, 1);
  }
  const original = option(b);
  const changed = applyProposalNumericOverrides(original, [{ operation_index: 0, target: "block", block_id: b.block_id, field: "exposure", value: -1 }]);
  assert.equal(deriveProposalTimeline(empty, changed.operations, "floating-fixture").timeline.elements.find(e => e.type === "still")!.props?.grade_exposure_ev, -1);
  const reset = applyProposalNumericOverrides(changed, [{ operation_index: 0, target: "block", block_id: b.block_id, field: "exposure", value: 0 }]);
  assert.deepEqual(reset.operations, original.operations);
});

test("prepared foreground remains on its supplied clock, muted, above the book; invalid inputs fail", () => {
  const b = fixture({ foreground: { source_url: "/api/projects/floating-fixture/media/hands.webm", source_duration_seconds: 10, source_start_seconds: 2, has_alpha: true }, lane_order_keys: ["visual_3", "visual_2", "visual_1", "visual_0"] });
  const fg = derive(b).find(e => e.props?.title === "Foreground occlusion")!;
  assert.equal(fg.trim_start, 2); assert.equal(fg.duration, 6.7); assert.equal(fg.volume, 0); assert.equal(fg.props?.has_alpha, true);
  assert.throws(() => compileBlock(fixture({ duration_seconds: 10 })), /Background needs/);
  assert.throws(() => compileBlock(fixture({ duration_seconds: .01 })), /two output frames/);
  assert.throws(() => compileBlock(fixture({ lane_order_keys: ["visual_0", "visual_1", "visual_2"] })), /distinct ordered lanes/);
  assert.throws(() => compileBlock(fixture({ canvas: {width:4000,height:1000} })), /aspect ratio/);
  assert.throws(() => compileBlock(fixture({ photograph: { source_url: "/photo.png", key_color: "#00ff00", mask_inset: [.6,.1,.6,.1] } })), /nonempty rectangle/);
});

test("fresh contract inputs change duration, aspect, source clock and mask without reference-specific IDs", () => {
  const b = fixture({ canvas: {width:1920,height:1080}, duration_seconds: 2,
    background: {source_url:"/api/projects/floating-fixture/media/room.mp4",source_duration_seconds:10,source_start_seconds:4},
    photograph: {source_url:"/api/projects/floating-fixture/media/new-object.png",key_color:"#26aa63",mask_inset:[.2,.25,.2,.25]},
    from:{x:20,y:50},to:{x:80,y:40} });
  const elements = derive(b);
  assert.equal(elements.find(e => e.type === "video_clip")!.trim_start, 4);
  assert.equal(elements.find(e => e.type === "still")!.duration, 2);
  const mask=elements.find(e=>e.type==="still")!.props?.mask_inset as number[];
  [.2,.25,.2,.25].map(v=>.5+(v-.5)*(elements.find(e=>e.type==="still")!.props!.media_scale as number)).forEach((v,n)=>assert.ok(Math.abs(mask[n]! - v)<1e-9));
  // This is contract reuse, not a real second-photograph visual certification.
});

test("an explicitly declared background still retains native hold instead of inventing video motion",()=>{
 const b=fixture({background:{type:"still",source_url:"/api/projects/floating-fixture/media/room.png",source_duration_seconds:1}});
 const elements=derive(b);assert.equal(elements.filter(e=>e.type==="still").length,2);
 const plate=elements.find(e=>e.props?.title==="Still background plate")!;assert.equal(plate.duration,6.7);assert.equal(plate.volume,0);
});

test("CanvasKit admits a keyed photograph while the unverified WebGPU route remains gated", async()=>{
 const {gpuSceneCapabilityIssues}=await import("../gpu-preview/scene");
 const {buildCompositionElements}=await import("../render/composition-adapters");
 const elements=buildCompositionElements(derive(fixture()),new Set());
 assert.equal(gpuSceneCapabilityIssues(elements,"keyed-still-test","canvaskit",true).filter(i=>i.capability==="chroma-key").length,0);
 assert.ok(gpuSceneCapabilityIssues(elements,"keyed-still-test","webgpu",true).some(i=>i.capability==="chroma-key"));
});


test("full turns, growth and scene zoom keep the source-attached mask and path continuous at all frame edges", () => {
 for (const [width,height] of [[1080,1920],[1920,1080]]) for(const angle of [-180,180]) {
  const b=fixture({canvas:{width,height},from:{x:-20,y:120},to:{x:120,y:-20}});
  b.settings={...b.settings,turn:angle,start_angle:angle,size:20,growth:200,scene_zoom:50};
  const elements=derive(b),photo=elements.find(e=>e.type==="still")!,camera=elements.find(e=>e.props?.title==="Book movement")!;
  const base=photo.props!.media_scale as number,mask=photo.props!.mask_inset as number[];
  // No viewport-clamped moving mask or visibility cut: the same source rectangle is
  // carried through the camera, including corners beyond the final canvas.
  assert.equal(photo.props!.keyframes,undefined);
  for(let f=0;f<201;f++) {
   const u=f/200,view=cameraViewAt(camera,f/30,width!,height!);
   const [x,y]=cameraPoint(view,width!/2,height!/2,width!,height!);
   const g=1+.5*u;
   assert.ok(Math.abs(x-(width!/2+g*width!*(-.7+1.4*u)))<width!*.002, `horizontal camera drift at ${f}`);
   assert.ok(Math.abs(y-(height!/2+g*height!*(.7-1.4*u)))<height!*.002, `vertical camera drift at ${f}`);
   assert.ok(view.zoom>=.1&&view.zoom<=10);
   assert.ok(Math.abs(view.focusX/(width!/2)-1)<=2&&Math.abs(view.focusY/(height!/2)-1)<=2);
   assert.ok(Math.abs(view.zoom*base-(.2*(1+2*u)*g))<.001, `scale drift at ${f}`);
   const inside=[width!*(.5+(.15-.5)*base),height!*(.5+(.1-.5)*base)];
   assert.ok(Math.abs(inside[0]!-width!*mask[3]!)<1e-8);
   assert.ok(Math.abs(inside[1]!-height!*mask[0]!)<1e-8);
  }
 }
});

test("photographic softness stays steady through growth and scene zoom without changing the path or key", async () => {
 const {gpuSceneCapabilityIssues}=await import("../gpu-preview/scene");
 const {buildCompositionElements}=await import("../render/composition-adapters");
 for(const [width,height] of [[1080,1920],[1920,1080]]) for(const ease of ["linear","smooth"]) {
  const b=fixture({canvas:{width,height}});
  b.settings={...b.settings,growth:200,scene_zoom:50,ease};
  const original=derive(b), tuned=derive({...b,settings:{...b.settings,image_softness:10,contrast:95,saturation:85}});
  const photo=tuned.find(e=>e.type==="still")!, camera=tuned.find(e=>e.props?.title==="Book movement")!;
  const originalPhoto=original.find(e=>e.type==="still")!;
  const withoutTimes=(elements:typeof original)=>elements.map(({created_at:_created,updated_at:_updated,...element})=>element);
  assert.deepEqual(withoutTimes(tuned.filter(e=>e.type!=="still")),withoutTimes(original.filter(e=>e.type!=="still")));
  for(const key of ["camera_id","media_scale","mask_inset","mask_feather","chroma_key_color","chroma_key_tolerance","chroma_key_softness","chroma_key_spill"])
   assert.deepEqual(photo.props?.[key],originalPhoto.props?.[key]);
  assert.equal(photo.props?.grade_contrast,.95);assert.equal(photo.props?.grade_saturation,.85);
  for(let f=0;f<201;f++) {
   const t=f/30, blur=resolveTransitionEffects(photo.props,t,{width:width!,height:height!});
   const zoom=cameraViewAt(camera,t,width!,height!).zoom, expected=.5*width!/1080;
   assert.ok(Math.abs(blur.blurX*zoom-expected)<.001,`softness drifts at ${f}`);
   assert.equal(blur.blurX,blur.blurY);
  }
  assert.equal(gpuSceneCapabilityIssues(buildCompositionElements(tuned,new Set()),"softness-test","canvaskit",true).length,0);
 }
});

test("softness off and neutral material settings preserve old native properties", () => {
 const b=fixture(), photo=derive(b).find(e=>e.type==="still")!;
 assert.equal(photo.props?.directional_blur_x,undefined);assert.equal(photo.props?.directional_blur_y,undefined);
 assert.equal(photo.props?.keyframes,undefined);assert.equal(photo.props?.grade_contrast,undefined);assert.equal(photo.props?.grade_saturation,undefined);
});

for(const [field,authoredValue,neutral] of [["image_softness",10,0],["contrast",95,100],["saturation",85,100]] as const) test(`${field} can reach its neutral/default state and Reset to the authored correction`,()=>{
 const b=fixture(),authored={...b,settings:{...b.settings,image_softness:10,contrast:95,saturation:85}};
 const original=option(authored);
 const off=applyProposalNumericOverrides(original,[{operation_index:0,target:"block",block_id:b.block_id,field,value:neutral}]);
 const props=deriveProposalTimeline(empty,off.operations,"floating-fixture").timeline.elements.find(e=>e.type==="still")!.props;
 assert.equal(props?.[field==="image_softness"?"directional_blur_x":`grade_${field}`],undefined);
 const reset=applyProposalNumericOverrides(off,[{operation_index:0,target:"block",block_id:b.block_id,field,value:authoredValue}]);
 assert.deepEqual(reset.operations,original.operations);
 const proposal=editorAgentProposalSchema.parse({schema_version:2,project_id:"floating-fixture",expected_revision:"0".repeat(64),mode:"workshop",decision:"propose",summary:"Material check",assumptions:[],unresolved_gaps:[],caps:{max_mutations:512,requested_mutations:original.requested_mutations,max_renders:0},options:[original]});
 const reviewOff=applyProposalReviewOverrides(proposal,"float",[{operation_index:0,target:"block",block_id:b.block_id,field,value:neutral}]);
 const reviewReset=applyProposalReviewOverrides(reviewOff,"float",[{operation_index:0,target:"block",block_id:b.block_id,field,value:authoredValue}]);
 assert.deepEqual(reviewReset.options[0]!.operations,original.operations);
 assert.equal(reviewReset.caps.max_mutations,512);
 assert.deepEqual(reviewReset.options[0]!.operations.map(op=>op.element_id),original.operations.map(op=>op.element_id));
 assert.equal(reviewReset.options[0]!.requested_mutations,original.requested_mutations);
});

test("material field growth still respects the global mutation limit",()=>{
 const b=fixture(),base=option(b),extra=512-base.requested_mutations;
 const full=editorAgentOptionSchema.parse({...base,requested_mutations:undefined,operations:[...base.operations,...Array.from({length:extra},(_,i)=>({element_id:`00000000-0000-4000-8000-${String(i).padStart(12,"0")}`,patch:{volume:1}}))]});
 assert.equal(full.requested_mutations,512);
 assert.throws(()=>applyProposalNumericOverrides(full,[{operation_index:0,target:"block",field:"image_softness",value:10}]),/512/);
});

for(const kind of ["extra actor","different operation target"] as const) test(`review tuning refuses ${kind} even when a block compiles valid native operations`,t=>{
 const b=fixture(),original=option(b);
 const proposal=editorAgentProposalSchema.parse({schema_version:2,project_id:"floating-fixture",expected_revision:"0".repeat(64),mode:"workshop",decision:"propose",summary:"Scope check",assumptions:[],unresolved_gaps:[],caps:{max_mutations:512,requested_mutations:original.requested_mutations,max_renders:0},options:[original]});
 const compile=keyedStillMotionBlock.compile;
 t.mock.method(keyedStillMotionBlock,"compile",(...args:Parameters<typeof compile>)=>{
  const ops=compile(...args);if(!args[1].image_softness)return ops;
  const photo=ops.find(op=>op.block_ref.role==="photograph")!;
  if(kind==="extra actor")return [...ops,{...photo,element_id:"00000000-0000-4000-8000-000000000999",block_ref:{...photo.block_ref,role:"extra"}}];
  return ops.map(op=>op===photo?{element_id:op.element_id,block_ref:op.block_ref,create_shape:{title:"Unexpected actor",shape_kind:"camera",shape_width:1,shape_height:1,timeline_start:0,duration_seconds:6.7,lane_key:"visual_1",lane_index:1}}:op);
 });
 assert.throws(()=>applyProposalReviewOverrides(proposal,"float",[{operation_index:0,target:"block",field:"image_softness",value:10}]),/declared operation scope/);
});

test("material field allowance does not permit unrelated authored fields",()=>{
 const b=fixture(),original=editorAgentOptionSchema.parse({...option(b),requested_mutations:undefined,operations:[...option(b).operations,{element_id:"00000000-0000-4000-8000-000000000998",patch:{volume:1}}]});
 const proposal=editorAgentProposalSchema.parse({schema_version:2,project_id:"floating-fixture",expected_revision:"0".repeat(64),mode:"workshop",decision:"propose",summary:"Scope check",assumptions:[],unresolved_gaps:[],caps:{max_mutations:512,requested_mutations:original.requested_mutations,max_renders:0},options:[original]});
 assert.throws(()=>applyProposalReviewOverrides(proposal,"float",[{operation_index:0,target:"block",field:"image_softness",value:10},{operation_index:0,target:"patch",field:"playback_rate",value:2}]),/already-proposed/);
});

test("fitted camera-focus endpoints do not fail native validation on floating-point residue",()=>{
 for(const [turn,field,value] of [[-47.5,"end_x",120],[12,"start_angle",-180],[12,"start_angle",180]] as const){
  const b=fixture({duration_seconds:6.8,from:{x:60,y:60},to:{x:60,y:10}});
  b.settings={...b.settings,turn,growth:33,size:30,scene_zoom:10,[field]:value};
  const camera=derive(b).find(e=>e.props?.title==="Book movement")!;
  const keys=camera.props!.keyframes as Record<string,{v:number}[]>;
  for(const point of [...keys.media_offset_x!,...keys.media_offset_y!])assert.ok(Math.abs(point.v)<=2);
 }
});

test("focus-roundoff correction does not admit genuinely out-of-range native offsets",()=>{
 for(const sign of [-1,1]) {
  assert.equal(snapKeyedStillFocusRoundoff(sign*(2+Number.EPSILON*2)),sign*2);
  const invalid=sign*2.000001;
  assert.equal(snapKeyedStillFocusRoundoff(invalid),invalid);
  const {block_ref:_ref,...op}=structuredClone(compileBlock(fixture()).find(op=>op.block_ref.role==="camera")!);
  const shape=op.create_shape as {keyframes:Record<string,{t:number;v:number}[]>};shape.keyframes.media_offset_x![0]!.v=snapKeyedStillFocusRoundoff(invalid);
  assert.throws(()=>editorAgentOptionSchema.parse({id:"invalid-focus",label:"Bad focus",summary:"Must refuse",recommended:true,operations:[op]}));
 }
});


test("foreground occlusion follows the same scene framing as its background", () => {
 const block=fixture({lane_order_keys:["visual_3","visual_2","visual_1","visual_0"],foreground:{source_url:"/api/projects/floating-fixture/media/hands.webm",source_duration_seconds:10,source_start_seconds:1.25,has_alpha:true}});
 const tuned=setBlockSetting(setBlockSetting(block,"scene_zoom",20),"background_x",5);
 const elements=derive(tuned);
 const bg=elements.find(e=>e.props?.title==="Continuous background")!;
 const fg=elements.find(e=>e.props?.title==="Foreground occlusion")!;
 assert.ok(bg.props?.camera_id);
 assert.equal(fg.props?.camera_id,bg.props?.camera_id);
 assert.equal(fg.props?.media_offset_x,bg.props?.media_offset_x);
 assert.equal(fg.props?.media_scale,bg.props?.media_scale);
});
