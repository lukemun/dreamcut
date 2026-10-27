import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import {
  checkFinalRenderAuthority,
  colorGradeFingerprint,
  declaredFinalRenderAuthority,
  mediaSourcesMatch,
} from "@/lib/qc/final-render-authority";

function video(overrides: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id: "video-1",
    project_id: "project",
    type: "video_clip",
    source_url: "/api/projects/project/media/originals/take.mp4",
    props: {},
    beat_id: null,
    character_id: null,
    timeline_start: 0,
    duration: 1,
    lane_key: "visual-1",
    lane_index: 0,
    trim_start: 0,
    trim_end: null,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    created_at: "2026-07-20T00:00:00.000Z",
    updated_at: "2026-07-20T00:00:00.000Z",
    ...overrides,
  };
}

test("accepts the mapped authority while allowing a separate editor preview", () => {
  const element = video({
    props: {
      original_source_url: "/api/projects/project/media/originals/take.mp4",
      preview_source_url: "/api/projects/project/media/previews/take.mp4",
    },
  });
  assert.deepEqual(checkFinalRenderAuthority([element]), []);
});

test("blocks a proxy source when a higher-quality original is mapped", () => {
  const element = video({
    source_url: "/api/projects/project/media/proxies/take-720.mp4",
    props: { original_source_url: "/api/projects/project/media/originals/take.mp4" },
  });
  const findings = checkFinalRenderAuthority([element]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0]?.code, "declared_render_authority_not_active");
});

test("prefers a managed render authority over a camera original", () => {
  const element = video({
    source_url: "/api/projects/project/media/render-authority/take-bt709.mp4",
    props: {
      original_source_url: "/api/projects/project/media/originals/take-hdr.mov",
      render_authority_source_url: "/api/projects/project/media/render-authority/take-bt709.mp4",
    },
  });
  assert.equal(declaredFinalRenderAuthority(element), element.props?.render_authority_source_url);
  assert.deepEqual(checkFinalRenderAuthority([element]), []);
});

test("matches relative render-authority paths to project API URLs", () => {
  assert.equal(
    mediaSourcesMatch(
      "/api/projects/project/media/cover-walkthrough-source.mp4",
      "media/cover-walkthrough-source.mp4",
    ),
    true,
  );
});

test("recognizes the render_authority field used by product walkthroughs", () => {
  const element = video({
    source_url: "/api/projects/project/media/proxies/walkthrough-preview.mp4",
    props: { render_authority: "media/proxies/walkthrough-720x1280.mp4" },
  });
  assert.equal(checkFinalRenderAuthority([element])[0]?.requiredSourceUrl, "media/proxies/walkthrough-720x1280.mp4");
});

test("requires an authority when the element explicitly opts into the gate", () => {
  const findings = checkFinalRenderAuthority([
    video({ props: { render_authority_required: true } }),
  ]);
  assert.equal(findings[0]?.code, "render_authority_missing");
});

test("ignores removed and non-video elements", () => {
  const original = "/api/projects/project/media/originals/take.mp4";
  assert.deepEqual(checkFinalRenderAuthority([
    video({ removed_at: "2026-07-20T00:00:01.000Z", source_url: "proxy.mp4", props: { original_source_url: original } }),
    video({ id: "still", type: "image", source_url: "proxy.jpg", props: { original_source_url: original } }),
  ]), []);
});

test("blocks a required still when its workshop derivative is the active delivery source", () => {
  const preview = "/api/projects/project/media/stills/cover-preview.png";
  const findings = checkFinalRenderAuthority([
    video({
      id: "cover",
      type: "still",
      source_url: preview,
      props: { render_authority_required: true, preview_source_url: preview },
    }),
  ]);
  assert.equal(findings[0]?.code, "still_workshop_source_active");
});

test("accepts a required still with separate delivery and workshop sources", () => {
  assert.deepEqual(checkFinalRenderAuthority([
    video({
      id: "cover",
      type: "still",
      source_url: "/api/projects/project/media/stills/render-authority/cover-2x.png",
      props: {
        render_authority_required: true,
        preview_source_url: "/api/projects/project/media/stills/cover-preview.png",
        render_authority_dimensions: [2160, 3840],
        workshop_preview_dimensions: [1080, 1920],
      },
    }),
  ]), []);
});

test("blocks a required still whose declared delivery dimensions are not at least 2x", () => {
  const findings = checkFinalRenderAuthority([
    video({
      id: "cover",
      type: "still",
      source_url: "/api/projects/project/media/stills/render-authority/cover.png",
      props: {
        render_authority_required: true,
        preview_source_url: "/api/projects/project/media/stills/cover-preview.png",
        render_authority_dimensions: [1600, 2400],
        workshop_preview_dimensions: [900, 1400],
      },
    }),
  ]);
  assert.equal(findings[0]?.code, "still_authority_undersized");
});

// ── Declaration-free proxy sensor ───────────────────────────────────────────
// Every other check needs a DECLARED authority, so an undeclared proxy used to
// pass straight through to delivery (2026-07-22: a 720x1280 on-camera hook
// proxy in a 1080x1920 render, caught only by eye).

test("flags a proxy-named source even when nothing declares an authority", () => {
  const findings = checkFinalRenderAuthority([
    video({ source_url: "/api/projects/project/media/talking-head-take-02-proxy.mp4", props: {} }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "active_source_is_named_proxy");
});

test("flags a proxy-named source that is also mounted as the preview derivative", () => {
  const proxy = "/api/projects/project/media/take-02-proxy.mp4";
  const findings = checkFinalRenderAuthority([
    video({ source_url: proxy, props: { preview_source_url: proxy } }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "active_source_is_named_proxy");
});

test("stays quiet when a proxy IS the declared authority", () => {
  const proxy = "/api/projects/project/media/screen-capture-preview.mp4";
  assert.deepEqual(
    checkFinalRenderAuthority([
      video({ source_url: proxy, props: { render_authority_source_url: proxy } }),
    ]),
    [],
  );
});

test("blocks archival-original fallback when preview uses a receipt-bound framing derivative", () => {
  const original = "/api/projects/project/media/recording-authority.mp4";
  const findings = checkFinalRenderAuthority([
    video({
      source_url: original,
      props: {
        original_source_url: original,
        preview_source_url: "/api/projects/project/media/hook-framed-preview.mp4",
        framing_receipt_path: "preprocess/framing/receipt.json",
      },
    }),
  ]);
  assert.equal(findings[0]?.code, "framed_render_authority_missing");
});

test("accepts a receipt-bound framing derivative when its explicit authority is active", () => {
  const authority = "/api/projects/project/media/hook-framed-av.mp4";
  assert.deepEqual(checkFinalRenderAuthority([
    video({
      source_url: authority,
      props: {
        original_source_url: "/api/projects/project/media/recording-authority.mp4",
        render_authority_source_url: authority,
        preview_source_url: "/api/projects/project/media/hook-framed-preview.mp4",
        framing_receipt_path: "preprocess/framing/receipt.json",
      },
    }),
  ]), []);
});

test("does not fire on ordinary sources that merely contain the substring", () => {
  for (const name of ["approximation.mp4", "improxy-notes.mp4", "walkthrough-v25b-25fps-source.mp4"]) {
    assert.deepEqual(
      checkFinalRenderAuthority([video({ source_url: `/api/projects/project/media/${name}`, props: {} })]),
      [],
      `${name} should not be treated as a workshop derivative`,
    );
  }
});

test("recognises separator variants around the marker", () => {
  for (const name of ["clip-proxy.mp4", "clip_proxy.mp4", "clip.proxy.mp4", "proxy-clip.mp4", "arrival-v2-30fps-preview.mp4"]) {
    const findings = checkFinalRenderAuthority([
      video({ source_url: `/api/projects/project/media/${name}`, props: {} }),
    ]);
    assert.equal(findings.length, 1, `${name} should be flagged`);
  }
});

test("blocks a proxy-audition grade until an applied transfer receipt exists", () => {
  const authority = "/api/projects/project/media/render-authority/take-bt709.mp4";
  const element = video({
    source_url: authority,
    props: {
      render_authority_source_url: authority,
      preview_source_url: "/api/projects/project/media/proxies/take-360p.mp4",
      color_grade_model: "linear-srgb-v1",
      grade_contrast: 1.24,
      grade_transfer_required: true,
    },
  });
  assert.equal(checkFinalRenderAuthority([element])[0]?.code, "grade_transfer_missing");
});

test("accepts the exact transferred grade on the mapped render authority", () => {
  const authority = "/api/projects/project/media/render-authority/take-bt709.mp4";
  const props: Record<string, unknown> = {
    render_authority_source_url: authority,
    preview_source_url: "/api/projects/project/media/proxies/take-360p.mp4",
    color_grade_model: "linear-srgb-v1",
    grade_contrast: 1.24,
    grade_saturation: 0.9,
    grade_transfer_required: true,
  };
  props.grade_transfer_receipt = {
    status: "applied",
    render_authority_source_url: authority,
    grade_fingerprint: colorGradeFingerprint(props),
  };
  assert.deepEqual(checkFinalRenderAuthority([
    video({ source_url: authority, props }),
  ]), []);
});

test("blocks delivery when the grade changes after its transfer receipt", () => {
  const authority = "/api/projects/project/media/render-authority/take-bt709.mp4";
  const props: Record<string, unknown> = {
    render_authority_source_url: authority,
    color_grade_model: "linear-srgb-v1",
    grade_contrast: 1.2,
    grade_transfer_required: true,
  };
  props.grade_transfer_receipt = {
    status: "applied",
    render_authority_source_url: authority,
    grade_fingerprint: colorGradeFingerprint(props),
  };
  props.grade_contrast = 1.3;
  assert.equal(
    checkFinalRenderAuthority([video({ source_url: authority, props })])[0]?.code,
    "grade_transfer_stale",
  );
});
