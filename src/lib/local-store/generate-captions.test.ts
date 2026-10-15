import test from "node:test";
import assert from "node:assert/strict";
import { buildGeneratedCaptions } from "./generate-captions";
import { captionFollowsAudio } from "@/lib/timeline/caption-audio-link";
import { reconcileCaptionFollowers } from "./caption-followers";
import { applyElementPatch } from "./element-patch";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { POST } from "@/app/api/projects/[projectId]/timeline/captions/generate/route";

const source = { id: "speech", project_id: "test", type: "video_clip", source_url: "/speech.wav",
  timeline_start: 10, duration: 2, trim_start: 3, trim_end: 3, playback_rate: 2,
  props: { source_duration_seconds: 10 }, removed_at: null, position_locked: false } as TimelineElement;
const words = [{ word: "Hello", start: 0.1, end: 0.5 }, { word: "beautiful", start: 0.6, end: 1 }, { word: "world.", start: 1.1, end: 1.8 }];

test("generation stores absolute source bindings immediately, including sped-up trimmed video", () => {
  const [caption] = buildGeneratedCaptions(source, words);
  assert.ok(captionFollowsAudio(caption!));
  assert.equal(caption!.props?.caption_single_line_contract, true);
  assert.equal(caption!.props?.text, "Hello beautiful world.");
  assert.equal(caption!.timeline_start, 10.05);
  const binding = caption!.props?.caption_audio_binding as { start: number; words: Array<{start: number}> };
  assert.ok(Math.abs(binding.start - 3.1) < 1e-8);
  assert.ok(Math.abs(binding.words[1]!.start - 3.6) < 1e-8);
  const before = [source, caption!];
  const after = structuredClone(before);
  applyElementPatch(after[0]!, { playback_rate: 1 });
  reconcileCaptionFollowers(before, after);
  assert.ok(Math.abs(after[1]!.timeline_start - 10.1) < 1e-8);
  assert.equal(after[1]!.props?.text, caption!.props?.text);
});

test("unlinking one generated caption preserves the binding for Undo and does not affect its siblings", () => {
  const captions = buildGeneratedCaptions(source, [...words, { word: "Again.", start: 3, end: 3.5 }]);
  assert.equal(captions.length, 2);
  const binding = structuredClone(captions[0]!.props?.caption_audio_binding);
  applyElementPatch(captions[0]!, { props: { ...captions[0]!.props, caption_follow_audio: false } });
  assert.equal(captionFollowsAudio(captions[0]!), false);
  assert.equal(captionFollowsAudio(captions[1]!), true);
  assert.deepEqual(captions[0]!.props?.caption_audio_binding, binding);
  applyElementPatch(captions[0]!, { props: { ...captions[0]!.props, caption_follow_audio: true } });
  assert.equal(captionFollowsAudio(captions[0]!), true);
  assert.deepEqual(captions[0]!.props?.caption_audio_binding, binding);
});

test("generation rejects empty and out-of-window alignment without dropping words", () => {
  assert.throws(() => buildGeneratedCaptions(source, []), /No aligned speech/);
  assert.throws(() => buildGeneratedCaptions(source, [{ word: "Outside", start: 4, end: 5 }]), /outside/);
});

test("generation maps each word through source-bound speed steps", () => {
  const stepped = { ...source, playback_rate: 1, duration: 3,
    props: { source_duration_seconds: 10, keyframes: { playback_rate: [{ t: 2, source_t: 5, v: 2, ease: "hold" }] } } } as TimelineElement;
  const [caption] = buildGeneratedCaptions(stepped, [
    { word: "Before", start: 1.6, end: 1.9 }, { word: "after", start: 2, end: 2.6 }, { word: "step.", start: 2.7, end: 3.1 },
  ]);
  const binding = caption!.props?.caption_audio_binding as { words: Array<{ start: number; end: number }> };
  assert.ok(Math.abs(binding.words[1]!.start - 5) < 1e-6);
  assert.ok(Math.abs(binding.words[1]!.end - 5.6) < 1e-6);
});

test("generation route rejects malformed requests before preprocessing or mutation", async () => {
  const response = await POST(new Request("http://localhost/captions/generate", {
    method: "POST", body: JSON.stringify({ action: "generate", sessionId: "../../unsafe", text: "Hello" }),
  }), { params: Promise.resolve({ projectId: "test" }) });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Invalid/);
});

test("caption preparation respects desktop shutdown, releases its busy state and preserves the timeline", async () => {
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const { createProject, readTimeline, writeTimeline } = await import("./store");
  const { prepareCaptionTranscript } = await import("./generate-captions");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamcut-caption-owner-"));
  const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
  const key = Symbol.for("dreamcut.desktop.worker-owner");
  const host = process as NodeJS.Process & { [key: symbol]: unknown };
  const previousOwner = host[key];
  let attempts = 0;
  try {
    process.env.TIMELINE_PROJECTS_DIR = root;
    const project = "fixture";
    createProject(project, "web");
    const media = path.join(root, project, "media");
    await fs.mkdir(media, { recursive: true });
    await fs.writeFile(path.join(media, "speech.wav"), "fixture never reaches a decoder");
    const timeline = readTimeline(project);
    timeline.elements = [{ ...source, project_id: project, source_url: `/api/projects/${project}/media/speech.wav` }];
    writeTimeline(project, timeline, "fixture");
    const timelinePath = path.join(root, project, "timeline.json");
    const before = await fs.readFile(timelinePath);
    host[key] = { spawn() { attempts++; throw Error("DreamCut is shutting down"); } };
    await assert.rejects(prepareCaptionTranscript(project, source.id), /shutting down/);
    await assert.rejects(prepareCaptionTranscript(project, source.id), /shutting down/);
    assert.equal(attempts, 2);
    assert.deepEqual(await fs.readFile(timelinePath), before);
  } finally {
    if (previousOwner === undefined) delete host[key]; else host[key] = previousOwner;
    if (previousRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
    await fs.rm(root, { recursive: true, force: true });
  }
});
