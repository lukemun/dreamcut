import assert from "node:assert/strict";
import test from "node:test";

import {
  proposalPlaybackLeadInSeconds,
  resolveAuditionPlaybackRange,
  resolveLaneOrderPlaybackRange,
  resolveProposalPlaybackRange,
} from "@/lib/timeline/audition-playback";

const elements = [
  { id: "one", timeline_start: 4, duration: 2, removed_at: null },
  { id: "two", timeline_start: 6.6, duration: 3, removed_at: null },
  { id: "removed", timeline_start: 10, duration: 2, removed_at: "2026-07-18T00:00:00.000Z" },
];

test("a caption-only proposal replays when its fill or animation changes", () => {
  const caption = {
    id: "airbus", type: "caption_text", timeline_start: 14.4, duration: 4,
    removed_at: null,
    props: { text: "AIRBUS", mediaFillVideoUrl: "old.mp4", mediaFillVideoPlaybackRate: 1, animationInDuration: 0.5 },
  };
  for (const patch of [
    { mediaFillVideoUrl: "left-moving-clouds.mp4" },
    { mediaFillVideoPlaybackRate: 1.5 },
    { animationInDuration: 1 },
  ]) {
    const draft = { ...caption, props: { ...caption.props, ...patch } };
    assert.deepEqual(resolveProposalPlaybackRange([caption.id], [draft], [caption]), {
      startSeconds: 14.4, endSeconds: 18.4,
    });
  }
  assert.equal(resolveProposalPlaybackRange([caption.id], [caption], [caption]), null);
});

test("music proposal playback starts on the cue while cut previews keep context", () => {
  assert.equal(proposalPlaybackLeadInSeconds({
    rows: [{ changes: [{ target: "create_audio", field: "type", after_value: "music" }] }],
  }), 0);
  assert.equal(proposalPlaybackLeadInSeconds({
    rows: [{ changes: [{ target: "patch", field: "duration", after_value: 2 }] }],
  }), 3);
});

test("resolveAuditionPlaybackRange returns one candidate's exact timeline window", () => {
  assert.deepEqual(resolveAuditionPlaybackRange(["two"], elements), {
    startSeconds: 6.6,
    endSeconds: 9.6,
  });
});

test("resolveAuditionPlaybackRange spans ordered active candidates and ignores missing or removed ids", () => {
  assert.deepEqual(resolveAuditionPlaybackRange(["two", "missing", "removed", "one"], elements), {
    startSeconds: 4,
    endSeconds: 9.6,
  });
  assert.equal(resolveAuditionPlaybackRange(["missing", "removed"], elements), null);
});

test("resolveLaneOrderPlaybackRange focuses where reordered lanes are simultaneously visible", () => {
  const scene = [
    { id: "phone", lane_key: "visual_17", timeline_start: 35.7, duration: 1.5, removed_at: null },
    { id: "kylie", lane_key: "visual_18", timeline_start: 37.2, duration: 2.2, removed_at: null },
    { id: "creator-a", lane_key: "visual_19", timeline_start: 37.4, duration: 2, removed_at: null },
    { id: "creator-b", lane_key: "visual_20", timeline_start: 37.6, duration: 1.8, removed_at: null },
    { id: "viewer", lane_key: "visual_21", timeline_start: 35.7, duration: 1.5, removed_at: null },
    { id: "creator-c", lane_key: "visual_21", timeline_start: 37.8, duration: 1.6, removed_at: null },
  ];
  assert.deepEqual(resolveLaneOrderPlaybackRange(
    ["visual_21", "visual_20", "visual_19", "visual_18", "visual_17"],
    ["visual_18", "visual_19", "visual_20", "visual_21", "visual_17"],
    scene,
  ), { startSeconds: 37.4, endSeconds: 39.4 });
});

test("resolveLaneOrderPlaybackRange ignores reordering when the affected lanes never overlap", () => {
  assert.equal(resolveLaneOrderPlaybackRange(
    ["visual_2", "visual_1"],
    ["visual_1", "visual_2"],
    [
      { id: "early", lane_key: "visual_1", timeline_start: 0, duration: 1, removed_at: null },
      { id: "late", lane_key: "visual_2", timeline_start: 2, duration: 1, removed_at: null },
    ],
  ), null);
});

test("resolveProposalPlaybackRange plays a removal-only option over its base-timeline window", () => {
  // The draft tombstones "one"; its window must come from the base timeline so
  // a deletion still auditions the surrounding context.
  const draft = [
    { id: "one", timeline_start: 4, duration: 2, removed_at: "2026-08-13T00:00:00.000Z" },
    { id: "two", timeline_start: 6.6, duration: 3, removed_at: null },
  ];
  assert.deepEqual(resolveProposalPlaybackRange(["one"], draft, elements), {
    startSeconds: 4,
    endSeconds: 6,
  });
});

test("resolveProposalPlaybackRange unions draft windows with base windows of replaced elements", () => {
  // "one" is removed in the draft (base window 4–6); "created" exists only in
  // the draft (window 7–9). The audition window spans both.
  const draft = [
    { id: "created", timeline_start: 7, duration: 2, removed_at: null },
  ];
  assert.deepEqual(resolveProposalPlaybackRange(["one", "created"], draft, elements), {
    startSeconds: 4,
    endSeconds: 9,
  });
});

test("resolveProposalPlaybackRange prefers the draft window when the element moved", () => {
  const draft = [
    { id: "one", timeline_start: 12, duration: 2, removed_at: null },
  ];
  assert.deepEqual(resolveProposalPlaybackRange(["one"], draft, elements), {
    startSeconds: 12,
    endSeconds: 14,
  });
});

test("resolveProposalPlaybackRange still auditions an in-place property change", () => {
  const base = [{ id: "audio", timeline_start: 8, duration: 4, removed_at: null, volume: 1 }];
  const draft = [{ id: "audio", timeline_start: 8, duration: 4, removed_at: null, volume: 0.6 }];
  assert.deepEqual(resolveProposalPlaybackRange(["audio"], draft, base), {
    startSeconds: 8,
    endSeconds: 12,
  });
});

test("resolveProposalPlaybackRange focuses a tail trim near the changed ending", () => {
  const base = [{
    id: "talking-head",
    type: "video_clip",
    source_url: "/media/talking-head.mov",
    timeline_start: 0,
    duration: 38.5,
    trim_start: 9.8,
    trim_end: 0.433333,
    removed_at: null,
  }];
  const draft = [{
    ...base[0],
    duration: 34.5,
    trim_end: 4.433333,
  }];

  assert.deepEqual(resolveProposalPlaybackRange(["talking-head"], draft, base), {
    startSeconds: 33,
    endSeconds: 34.5,
  });
});

test("resolveProposalPlaybackRange does not play removed sign-off captions past a tail trim", () => {
  const base = [
    {
      id: "talking-head",
      type: "video_clip",
      source_url: "/media/talking-head.mov",
      timeline_start: 0,
      duration: 38.5,
      trim_start: 9.8,
      trim_end: 0.433333,
      removed_at: null,
    },
    {
      id: "sign-off",
      type: "caption_text",
      timeline_start: 34.49,
      duration: 3.6,
      removed_at: null,
      props: { text: "This has been day six. See you tomorrow." },
    },
  ];
  const draft = [{
    ...base[0],
    duration: 34.5,
    trim_end: 4.433333,
  }];

  assert.deepEqual(resolveProposalPlaybackRange(["talking-head", "sign-off"], draft, base), {
    startSeconds: 33,
    endSeconds: 34.5,
  });
});

test("resolveProposalPlaybackRange plays a created replacement beyond a shortened element boundary", () => {
  const base = [{
    id: "old-card",
    type: "caption_text",
    timeline_start: 53.690909091,
    duration: 8.654545455,
    removed_at: null,
    props: { text: "SHIP NOW vs SAFETY CREDIBILITY" },
  }];
  const draft = [
    { ...base[0], duration: 6.409090909 },
    {
      id: "callback-frame",
      type: "still",
      source_url: "/media/trump-xi.png",
      timeline_start: 60.1,
      duration: 2.2333333333,
      removed_at: null,
    },
  ];

  assert.deepEqual(resolveProposalPlaybackRange(
    ["old-card", "callback-frame"],
    draft,
    base,
  ), {
    startSeconds: 58.6,
    endSeconds: 62.345454546,
  });
});

test("resolveProposalPlaybackRange returns null only when no window exists anywhere", () => {
  assert.equal(resolveProposalPlaybackRange(["missing"], [], elements), null);
});

test("resolveProposalPlaybackRange focuses a caption-track repair instead of replaying unchanged cues from 0:00", () => {
  const caption = (id: string, text: string, timeline_start: number, duration: number) => ({
    id,
    type: "caption_text",
    source_url: null,
    timeline_start,
    duration,
    removed_at: null,
    props: { text, fontPreset: "teko", fontSizePx: 92, styleVariant: "bold_outline" },
  });
  const base = [
    caption("old-opening", "Opening unchanged", 0.1, 1),
    caption("old-spelling", "to M-O-N-R-O-E", 29.83, 0.7),
    caption("old-fragment", "N R O", 30.55, 0.84),
    caption("old-following", "because it just", 31.46, 1.73),
  ];
  const draft = [
    caption("new-opening", "Opening unchanged", 0.1, 1),
    caption("new-spelling", "to M-O-N-R-O-E", 29.83, 2.5),
    caption("new-following", "because it just", 32.42, 0.77),
  ];

  const range = resolveProposalPlaybackRange(
    [...base, ...draft].map((element) => element.id),
    draft,
    base,
  );
  assert.ok(range);
  assert.equal(range.startSeconds, 29.83);
  assert.ok(Math.abs(range.endSeconds - 33.19) < 1e-6);
});

test("ripple-cut preview focuses the inserted join, not every shifted lane", () => {
  const base = [{ id: 'speaker', timeline_start: 0, duration: 69, removed_at: null }];
  const draft = [
    { ...base[0], duration: 31.2333333333 },
    { id: 'right', timeline_start: 31.2333333333, duration: 34.8666666667, removed_at: null },
    { id: 'later-caption', timeline_start: 65, duration: 1, removed_at: null },
  ];
  const review = { rows: [{ changes: [{ target: 'source_range_cut', field: 'inserted_element_id', after_value: 'right' }] }] };
  const range = resolveProposalPlaybackRange(draft.map(e => e.id), draft, base, review)!;
  assert.equal(range.startSeconds, 31.2333333333);
  assert.ok(Math.abs(range.endSeconds - 35.2333333333) < 1e-6);
});


test("explicit proposal context previews the full sequence and clamps to its end", () => {
  const draft = [{ id: "music", timeline_start: 0, duration: 12.8 }, { id: "flash", timeline_start: 8.067, duration: 0.133 }];
  const review = { rows: [], preview_range: { start_seconds: 6.4, end_seconds: 12.8 } };
  assert.deepEqual(resolveProposalPlaybackRange(["flash"], draft, draft, review), { startSeconds: 6.4, endSeconds: 12.8 });
  assert.equal(proposalPlaybackLeadInSeconds(review), 0);
  assert.deepEqual(resolveProposalPlaybackRange(["flash"], draft, draft, { ...review, preview_range: { start_seconds: 6.4, end_seconds: 90 } }), { startSeconds: 6.4, endSeconds: 12.8 });
});
