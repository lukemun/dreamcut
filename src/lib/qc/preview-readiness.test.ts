import assert from "node:assert/strict";
import test from "node:test";

import { assessPreviewReadiness, type PreviewElement, type PreviewMediaFact } from "@/lib/qc/preview-readiness";
import { COLOR_MANAGED_VIDEO_RECIPE, COLOR_MANAGED_ALPHA_VIDEO_RECIPE, LEGACY_COLOR_MANAGED_ALPHA_VIDEO_RECIPES } from "@/lib/media-analysis/color-profile";

const video = (id: string, start = 0, props: Record<string, unknown> = {}): PreviewElement => ({
  id, type: "video_clip", source_url: `/render-${id}.mp4`, timeline_start: start, duration: 2, trim_start: 0, playback_rate: 1, props,
});
const fact = (url: string, overrides: Partial<PreviewMediaFact> = {}): PreviewMediaFact => ({
  url, readable: true, codec: "h264", width: 360, height: 640, pixelFormat: "yuv420p", fps: 30, durationSeconds: 10, ...overrides,
});
const still = (id: string, sourceUrl: string, previewUrl: string): PreviewElement => ({
  id,
  type: "still",
  source_url: sourceUrl,
  timeline_start: 0,
  duration: 2,
  props: { preview_source_url: previewUrl, render_authority_required: true },
});

test("a compliant mapped workshop preview passes", () => {
  const element = video("a", 0, { preview_source_url: "/preview-a.mp4" });
  const report = assessPreviewReadiness([element], new Map([["/preview-a.mp4", fact("/preview-a.mp4")]]));
  assert.equal(report.ok, true);
});

test("a stale declared authority blocks after source_url changes", () => {
  const element = video("animation", 0, {
    preview_source_url: "/preview-old.webm",
    render_authority_source_url: "/render-old.webm",
    render_authority_sha256: "a".repeat(64),
    preview_proxy_sha256: "b".repeat(64),
  });
  element.source_url = "/render-new.webm?revision=2";
  const report = assessPreviewReadiness([element], new Map([
    ["/preview-old.webm", fact("/preview-old.webm", { sha256: "b".repeat(64) })],
    ["/render-old.webm", fact("/render-old.webm", { sha256: "a".repeat(64) })],
  ]));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.code === "render_authority_source_mismatch"));
});

test("an authority pair accepts cache-busting query differences but blocks stale fingerprints", () => {
  const element = video("animation", 0, {
    preview_source_url: "/preview-current.webm",
    render_authority_source_url: "/render-current.webm",
    render_authority_sha256: "a".repeat(64),
    preview_proxy_sha256: "b".repeat(64),
  });
  element.source_url = "/render-current.webm?revision=2";
  const report = assessPreviewReadiness([element], new Map([
    ["/preview-current.webm", fact("/preview-current.webm", { sha256: "c".repeat(64) })],
    ["/render-current.webm", fact("/render-current.webm", { sha256: "d".repeat(64) })],
  ]));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.code === "render_authority_fingerprint_mismatch"));
  assert.ok(report.findings.some((item) => item.code === "preview_proxy_fingerprint_mismatch"));
  assert.ok(!report.findings.some((item) => item.code === "render_authority_source_mismatch"));
});

test("receipt-bound framing cannot preview one crop and render from an undeclared source", () => {
  const element = video("presenter", 0, {
    preview_source_url: "/presenter-framed-preview.mp4",
    framing_receipt_path: "preprocess/framing/receipt.json",
    original_source_url: "/recording-authority.mp4",
  });
  element.source_url = "/recording-authority.mp4";
  const report = assessPreviewReadiness([element], new Map([
    ["/presenter-framed-preview.mp4", fact("/presenter-framed-preview.mp4")],
  ]));
  assert.ok(report.findings.some((item) => item.code === "framed_preview_render_parity_missing"));
});

test("receipt-bound framing passes with a hash-bound, sampled render-preview pair", () => {
  const renderHash = "a".repeat(64);
  const previewHash = "b".repeat(64);
  const authority = "/presenter-framed-av.mp4";
  const preview = "/presenter-framed-preview.mp4";
  const element = video("presenter", 0, {
    preview_source_url: preview,
    render_authority_source_url: authority,
    render_authority_sha256: renderHash,
    preview_proxy_sha256: previewHash,
    framing_receipt_path: "preprocess/framing/receipt.json",
    preview_render_parity_minimum_ssim: 0.98,
    preview_render_parity_samples: [0.5, 1, 1.5].map((source_second) => ({ source_second, ssim_all: 0.985 })),
  });
  element.source_url = authority;
  const report = assessPreviewReadiness([element], new Map([
    [authority, fact(authority, { width: 1080, height: 1920, sha256: renderHash })],
    [preview, fact(preview, { sha256: previewHash })],
  ]));
  assert.equal(report.ok, true);
});

test("a paired HDR-derived SDR authority and proxy pass the color-parity gate", () => {
  const samples = [0.981, 0.982, 0.98].map((ssim_all, index) => ({ source_second: index + 1, ssim_all }));
  const element = video("hdr", 0, {
    preview_source_url: "/preview-hdr.mp4",
    proxy_recipe: COLOR_MANAGED_VIDEO_RECIPE,
    color_parity_minimum_ssim: 0.97,
    color_parity_samples: samples,
  });
  const colorFact = (url: string, width: number, height: number): PreviewMediaFact => fact(url, {
    width, height, frameCount: 300, durationSeconds: 10,
    colorSpace: "bt709", colorTransfer: "bt709", colorPrimaries: "bt709",
  });
  const report = assessPreviewReadiness([element], new Map([
    ["/render-hdr.mp4", colorFact("/render-hdr.mp4", 1080, 1920)],
    ["/preview-hdr.mp4", colorFact("/preview-hdr.mp4", 540, 960)],
  ]));
  assert.equal(report.ok, true);
});

test("an independently tagged or unmeasured HDR preview blocks review", () => {
  const element = video("hdr", 0, {
    preview_source_url: "/preview-hdr.mp4",
    proxy_recipe: COLOR_MANAGED_VIDEO_RECIPE,
  });
  const report = assessPreviewReadiness([element], new Map([
    ["/render-hdr.mp4", fact("/render-hdr.mp4", { width: 1080, height: 1920, frameCount: 300, colorSpace: "bt709", colorTransfer: "bt709", colorPrimaries: "bt709" })],
    ["/preview-hdr.mp4", fact("/preview-hdr.mp4", { frameCount: 299, colorSpace: "bt2020nc", colorTransfer: "arib-std-b67", colorPrimaries: "bt2020" })],
  ]));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.code === "video_color_authority_not_bt709"));
  assert.ok(report.findings.some((item) => item.code === "video_color_authority_frame_mismatch"));
  assert.ok(report.findings.some((item) => item.code === "video_color_authority_parity_missing"));
});

test("a source-mapped alpha derivative passes when both RGB paths match their current parent authorities", () => {
  const renderHash = "a".repeat(64);
  const previewHash = "b".repeat(64);
  const parentRenderHash = "c".repeat(64);
  const parentPreviewHash = "d".repeat(64);
  const samples = [0, 1, 2].map((derivative_frame) => ({ derivative_frame, parent_frame: derivative_frame + 40, ssim_all: 0.99 }));
  const element = video("cutout", 0, {
    has_alpha: true,
    preview_source_url: "/preview-cutout.webm",
    rgb_parent_authority_required: true,
    rgb_parent_authority_source_url: "/render-parent.mp4",
    rgb_parent_preview_source_url: "/preview-parent.mp4",
    rgb_parent_authority_sha256: parentRenderHash,
    rgb_parent_preview_sha256: parentPreviewHash,
    rgb_derivative_sha256: renderHash,
    rgb_preview_derivative_sha256: previewHash,
    rgb_parent_start_frame: 40,
    rgb_parent_frame_count: 3,
    rgb_parent_parity_minimum_ssim: 0.97,
    rgb_parent_parity_samples: samples,
    rgb_parent_preview_parity_samples: samples,
  });
  const colorFact = (url: string, sha256: string, width = 360, height = 640) => fact(url, { width, height, colorSpace: "bt709", sha256 });
  const report = assessPreviewReadiness([element], new Map([
    ["/render-cutout.mp4", colorFact("/render-cutout.mp4", renderHash, 1080, 1920)],
    ["/preview-cutout.webm", colorFact("/preview-cutout.webm", previewHash)],
    ["/render-parent.mp4", colorFact("/render-parent.mp4", parentRenderHash, 1080, 1920)],
    ["/preview-parent.mp4", colorFact("/preview-parent.mp4", parentPreviewHash)],
  ]));
  assert.equal(report.ok, true);
});

test("a stale or unmeasured RGB-bearing alpha derivative blocks preview handoff", () => {
  const expected = "a".repeat(64);
  const element = video("cutout", 0, {
    has_alpha: true,
    preview_source_url: "/preview-cutout.webm",
    rgb_parent_authority_required: true,
    rgb_parent_authority_source_url: "/render-parent.mp4",
    rgb_parent_preview_source_url: "/preview-parent.mp4",
    rgb_parent_authority_sha256: expected,
    rgb_parent_preview_sha256: expected,
    rgb_derivative_sha256: expected,
    rgb_preview_derivative_sha256: expected,
    rgb_parent_start_frame: 40,
    rgb_parent_frame_count: 3,
    rgb_parent_parity_minimum_ssim: 0.97,
  });
  const stale = (url: string) => fact(url, { colorSpace: "bt709", sha256: "f".repeat(64) });
  const report = assessPreviewReadiness([element], new Map([
    ["/render-cutout.mp4", stale("/render-cutout.mp4")],
    ["/preview-cutout.webm", stale("/preview-cutout.webm")],
    ["/render-parent.mp4", stale("/render-parent.mp4")],
    ["/preview-parent.mp4", stale("/preview-parent.mp4")],
  ]));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.code === "alpha_rgb_parent_hash_mismatch"));
  assert.ok(report.findings.some((item) => item.code === "alpha_rgb_parent_parity_missing"));
});

test("a tracked alpha cutout cannot omit its RGB-parent provenance gate", () => {
  const element = video("legacy-cutout", 0, {
    has_alpha: true,
    mask_recipe: "sam2-presenter-mask-v1",
    preview_source_url: "/preview-legacy-cutout.webm",
  });
  const report = assessPreviewReadiness([element], new Map([
    ["/preview-legacy-cutout.webm", fact("/preview-legacy-cutout.webm", {
      codec: "vp9",
      colorSpace: "bt709",
    })],
  ]));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.code === "alpha_rgb_parent_receipt_missing"));
});

test("a missing dedicated preview audio file blocks handoff", () => {
  const element = video("a", 0, { preview_source_url: "/preview-a.mp4", preview_audio_source_url: "/preview-a.m4a" });
  const report = assessPreviewReadiness([element], new Map([["/preview-a.mp4", fact("/preview-a.mp4")]]));
  assert.ok(report.findings.some((item) => item.code === "preview_audio_unreadable"));
});

test("a dedicated preview audio clock cannot contain a video stream", () => {
  const element = video("a", 0, {
    preview_source_url: "/preview-a.mp4",
    preview_audio_source_url: "/treated-render.mp4",
  });
  const report = assessPreviewReadiness(
    [element],
    new Map([
      ["/preview-a.mp4", fact("/preview-a.mp4")],
      ["/treated-render.mp4", fact("/treated-render.mp4")],
    ]),
    new Set(["/treated-render.mp4"]),
  );
  assert.ok(
    report.findings.some((item) => item.code === "preview_audio_must_be_audio_only"),
  );
});

test("dedicated narration that still requires Web Audio blocks review handoff", () => {
  const element = {
    ...video("a", 0, {
      preview_source_url: "/preview-a.mp4",
      preview_audio_source_url: "/preview-a.m4a",
    }),
    volume: 2.85,
  };
  const report = assessPreviewReadiness(
    [element],
    new Map([["/preview-a.mp4", fact("/preview-a.mp4", { hasAudio: true })]]),
    new Set(["/preview-a.m4a"]),
  );
  assert.ok(
    report.findings.some(
      (item) => item.code === "preview_narration_requires_web_audio",
    ),
  );
});

test("gain-baked dedicated narration stays on the native clock and passes", () => {
  const element = {
    ...video("a", 0, {
      preview_source_url: "/preview-a.mp4",
      preview_audio_source_url: "/preview-a.m4a",
      preview_audio_baked_gain: 2.85,
    }),
    volume: 2.85,
  };
  const report = assessPreviewReadiness(
    [element],
    new Map([["/preview-a.mp4", fact("/preview-a.mp4", { hasAudio: true })]]),
    new Set(["/preview-a.m4a"]),
  );
  assert.equal(report.ok, true);
});

test("audible muxed preview audio cannot own the live playback clock", () => {
  const element = { ...video("a", 0, { preview_source_url: "/preview-a.mp4" }), volume: 1 };
  const report = assessPreviewReadiness([element], new Map([
    ["/preview-a.mp4", fact("/preview-a.mp4", { hasAudio: true })],
  ]));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.code === "preview_audio_clock_missing"));
});

test("a verified single muxed picture-and-narration clock passes", () => {
  const previewHash = "a".repeat(64);
  const element = {
    ...video("a", 0, {
      preview_source_url: "/preview-a.mp4",
      preview_audio_architecture: "single-muxed-picture-and-baked-narration-clock-v1",
      preview_proxy_sha256: previewHash,
      source_timing_preserved: true,
      preview_audio_recipe: {
        gain_baked_into_muxed_media: 2.85,
        authored_element_gain: 1,
        video_stream_treatment: "packet-copy",
        timing_preserved: true,
        duration_seconds: 10,
      },
    }),
    volume: 1,
  };
  const report = assessPreviewReadiness([element], new Map([
    ["/preview-a.mp4", fact("/preview-a.mp4", { hasAudio: true, sha256: previewHash })],
  ]));
  assert.equal(report.ok, true);
});

test("a declared muxed narration clock without a matching receipt blocks handoff", () => {
  const element = {
    ...video("a", 0, {
      preview_source_url: "/preview-a.mp4",
      preview_audio_architecture: "single-muxed-picture-and-baked-narration-clock-v1",
      preview_proxy_sha256: "a".repeat(64),
      source_timing_preserved: true,
      preview_audio_recipe: {
        gain_baked_into_muxed_media: 2.85,
        authored_element_gain: 1,
        video_stream_treatment: "packet-copy",
        timing_preserved: true,
        duration_seconds: 10,
      },
    }),
    volume: 1,
  };
  const report = assessPreviewReadiness([element], new Map([
    ["/preview-a.mp4", fact("/preview-a.mp4", { hasAudio: true, sha256: "b".repeat(64) })],
  ]));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.code === "preview_muxed_audio_receipt_invalid"));
});

test("muted muxed footage does not require a preview audio clock", () => {
  const element = { ...video("a", 0, { preview_source_url: "/preview-a.mp4" }), volume: 0 };
  const report = assessPreviewReadiness([element], new Map([
    ["/preview-a.mp4", fact("/preview-a.mp4", { hasAudio: true })],
  ]));
  assert.equal(report.ok, true);
});

test("10-bit H.264 and oversized media block review handoff", () => {
  const element = video("a");
  const report = assessPreviewReadiness([element], new Map([["/render-a.mp4", fact("/render-a.mp4", { width: 1080, height: 1920, pixelFormat: "yuv420p10le" })]]));
  assert.equal(report.ok, false);
  assert.deepEqual(report.findings.filter((item) => item.severity === "blocker").map((item) => item.code).sort(), ["preview_h264_pixel_format", "preview_oversized", "preview_proxy_required"]);
});

test("layered alpha motion uses the tighter 540x960 playback budget", () => {
  const element = video("alpha", 0, { has_alpha: true, preview_source_url: "/alpha.webm" });
  const report = assessPreviewReadiness([element], new Map([
    ["/alpha.webm", fact("/alpha.webm", { codec: "vp9", width: 720, height: 1280 })],
  ]));
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.code === "preview_alpha_oversized"));
});

test("a 540x960 alpha animation stays within the layered playback budget", () => {
  const element = video("alpha", 0, { has_alpha: true, preview_source_url: "/alpha.webm" });
  const report = assessPreviewReadiness([element], new Map([
    ["/alpha.webm", fact("/alpha.webm", { codec: "vp9", width: 540, height: 960 })],
  ]));
  assert.equal(report.ok, true);
});

test("opacity is irrelevant to decoder fanout", () => {
  const elements = Array.from({ length: 5 }, (_, index) => video(String(index), index * 0.1, { media_opacity: 0 }));
  const facts = new Map(elements.map((element) => [element.source_url!, fact(element.source_url!)]));
  const report = assessPreviewReadiness(elements, facts);
  assert.equal(report.summary.peakMountedDecoders, 5);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.code === "preview_decoder_fanout" && item.severity === "blocker"));
});

test("four mounted video decoders stay within the workshop budget", () => {
  const elements = Array.from({ length: 4 }, (_, index) => video(String(index), index * 0.1));
  for (const element of elements) element.props = { preview_source_url: element.source_url };
  const facts = new Map(elements.map((element) => [element.source_url!, fact(element.source_url!)]));
  const report = assessPreviewReadiness(elements, facts);
  assert.equal(report.summary.peakMountedDecoders, 4);
  assert.equal(report.ok, true);
});

test("an explicit preview premount override is included in the decoder budget", () => {
  const current = Array.from({ length: 4 }, (_, index) => video(`current-${index}`, 0));
  const cachedResume = video("resume", 2, { preview_premount_seconds: 0 });
  const elements = [...current, cachedResume];
  for (const element of elements) element.props = { ...element.props, preview_source_url: element.source_url };
  const facts = new Map(elements.map((element) => [element.source_url!, fact(element.source_url!)]));
  const report = assessPreviewReadiness(elements, facts);
  assert.equal(report.summary.peakMountedDecoders, 4);
  assert.equal(report.ok, true);
});

test("decoder fanout reports the decoder peak time rather than a later pixel-throughput peak", () => {
  const crowded = Array.from({ length: 5 }, (_, index) => video(`crowded-${index}`, 2, {
    preview_source_url: `/crowded-${index}.mp4`,
    preview_premount_seconds: 2,
  }));
  const laterLarge = video("later-large", 10, {
    preview_source_url: "/later-large.mp4",
    preview_premount_seconds: 0,
  });
  const facts = new Map<string, PreviewMediaFact>([
    ...crowded.map((element) => [String(element.props?.preview_source_url), fact(String(element.props?.preview_source_url))] as const),
    ["/later-large.mp4", fact("/later-large.mp4", { width: 720, height: 1280 })],
  ]);
  const report = assessPreviewReadiness([...crowded, laterLarge], facts);
  assert.equal(report.summary.peakMountedDecoders, 5);
  assert.equal(report.summary.peakAtSeconds, 0);
  assert.match(report.findings.find((finding) => finding.code === "preview_decoder_fanout")?.message ?? "", /0\.00s/);
});

test("a 2x render-authority still and smaller workshop derivative pass", () => {
  const element = still("cover", "/cover-render.png", "/cover-preview.png");
  const facts = new Map([
    ["/cover-render.png", fact("/cover-render.png", { width: 2160, height: 3840 })],
    ["/cover-preview.png", fact("/cover-preview.png", { width: 1080, height: 1920 })],
  ]);
  const report = assessPreviewReadiness([element], facts);
  assert.equal(report.ok, true);
});

test("an undersized render-authority still blocks review handoff", () => {
  const element = still("cover", "/cover-render.png", "/cover-preview.png");
  const facts = new Map([
    ["/cover-render.png", fact("/cover-render.png", { width: 1080, height: 1920 })],
    ["/cover-preview.png", fact("/cover-preview.png", { width: 1080, height: 1920 })],
  ]);
  const report = assessPreviewReadiness([element], facts);
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((item) => item.code === "still_render_authority_undersized"));
});

for(const recipe of [COLOR_MANAGED_ALPHA_VIDEO_RECIPE,...LEGACY_COLOR_MANAGED_ALPHA_VIDEO_RECIPES])
test(`HDR-alpha recipe ${recipe} cannot bypass the existing SDR authority/parity gate`,()=>{
 const element=video("alpha-hdr",0,{preview_source_url:"/preview.webm",proxy_recipe:recipe});
 const report=assessPreviewReadiness([element],new Map([
  [element.source_url!,fact(element.source_url!,{width:1080,height:1920,frameCount:300,colorSpace:"bt2020nc",colorTransfer:"arib-std-b67",colorPrimaries:"bt2020"})],
  ["/preview.webm",fact("/preview.webm",{frameCount:299,colorSpace:"bt709",colorTransfer:"bt709",colorPrimaries:"bt709"})],
 ]));
 assert.equal(report.ok,false);
 assert.ok(report.findings.some(f=>f.code==="video_color_authority_not_bt709"));
 assert.ok(report.findings.some(f=>f.code==="video_color_authority_frame_mismatch"));
 assert.ok(report.findings.some(f=>f.code==="video_color_authority_parity_missing"));
});
