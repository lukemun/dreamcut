import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sfxAuditionPrepare } from "../src/lib/agent/sfx-tools";
import {
  SOUND_SYNC_CASES,
  SOUND_SYNC_EVAL_VERSION,
  gradeSoundSync,
  setupSoundSyncFixture,
  soundSyncCase,
  soundSyncPacket,
  type SoundSyncCase,
  type SoundSyncScore,
} from "../src/lib/agent/sound-sync-eval";
import { visualActivityPrepare } from "../src/lib/agent/visual-activity-tool";
import { readProposal } from "../src/lib/local-store/proposals";
import { projectMediaDir } from "../src/lib/local-store/paths";
import { encodeWav16, runSynthProgram } from "../src/lib/sound-synth/synth";

const USAGE = `Usage: pnpm eval:sound-sync list
       pnpm eval:sound-sync packet <case-id> <project-id>
       pnpm eval:sound-sync setup <case-id> <project-id>     (disposable fixture project)
       pnpm eval:sound-sync grade <case-id> <project-id> <proposal-id | proposal.json> [rendered.wav]
       pnpm eval:sound-sync baseline [case-id]                (scripted policies in a temporary projects folder)`;

type Operation = { create_audio: Record<string, unknown> };

/** The earlier habit: one library sound placed by eye at a single cue (here, generously, the truth's loudest moment). */
async function singleCueLibrary(projectId: string, testCase: SoundSyncCase, cue: number): Promise<Operation[]> {
  const audition = await sfxAuditionPrepare(projectId, { cue_seconds: cue, role: testCase.library_role, query: testCase.library_query, max_candidates: 1 });
  return [audition.candidates[0]!.proposal_operation];
}

/** Loudness only: filtered noise whose level follows the case's curve. */
const LOUDNESS_RENDER = (curve: string, seconds: number) => `
function render({ sampleRate, random }) {
  const n = Math.round(sampleRate * ${seconds});
  const left = new Float32Array(n);
  let low = 0;
  for (let i = 0; i < n; i += 1) {
    low += 0.25 * ((random() * 2 - 1) - low);
    left[i] = low * activityAt(${JSON.stringify(curve)}, i / sampleRate) * 0.9;
  }
  return { channels: [left, left] };
}`;

/** Handwriting pencil: level and brightness follow pen speed; a bright scratch where the stroke turns. */
const PEN_RENDER = (seconds: number) => `
function render({ sampleRate, random }) {
  const n = Math.round(sampleRate * ${seconds});
  const left = new Float32Array(n);
  let low = 0, bandHigh = 0, bandLow = 0;
  for (let i = 0; i < n; i += 1) {
    const t = i / sampleRate;
    const speed = activityAt("pen_speed", t);
    const turn = speed > 0.03 ? Math.min(1, activityAt("pen_turn", t) * 1.5) : 0;
    const white = random() * 2 - 1;
    low += (0.06 + 0.4 * speed) * (white - low);
    // Scratch: noise band-passed to roughly 2-7 kHz, where a pencil's grit sits.
    bandHigh += 0.6 * (white - bandHigh);
    bandLow += 0.25 * (white - bandLow);
    left[i] = (low * speed * 0.9 + (bandHigh - bandLow) * turn * 0.9) * 0.9;
  }
  return { channels: [left, left] };
}`;

/** The routine: get the curves, synthesize a sound that follows them, place it at the window start. */
async function curveSynth(projectId: string, testCase: SoundSyncCase, mode: "loudness" | "pen" = "loudness"): Promise<Operation[]> {
  const activity = await visualActivityPrepare(projectId, { start_seconds: testCase.window.start, end_seconds: testCase.window.end }) as { synth_embed: string };
  const seconds = testCase.window.end - testCase.window.start;
  const code = `${activity.synth_embed}\n${mode === "pen" ? PEN_RENDER(seconds) : LOUDNESS_RENDER(testCase.curve, seconds)}`;
  const result = runSynthProgram(code, { controls: {}, seed: 1 });
  const dir = path.join(projectMediaDir(projectId), "sounds", "eval-follow");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${mode}.wav`), encodeWav16(result.channels, result.sampleRate));
  return [{ create_audio: {
    type: "sound_effect", title: "Follows the picture", source_url: `/api/projects/${projectId}/media/sounds/eval-follow/${mode}.wav`,
    timeline_start: testCase.window.start, source_duration_seconds: result.durationSeconds, source_start_seconds: 0, source_end_seconds: result.durationSeconds, volume: 1,
  } }];
}

/** The routine's library path: one library sound per active span, peak on the span's peak, tail trimmed to the span. */
async function curveLibraryHits(projectId: string, testCase: SoundSyncCase): Promise<Operation[]> {
  const activity = await visualActivityPrepare(projectId, { start_seconds: testCase.window.start, end_seconds: testCase.window.end }) as {
    curves: Array<{ name: string; peaks: Array<{ time_seconds: number; value: number }>; active_intervals: Array<[number, number]> }>;
  };
  const curve = activity.curves.find((candidate) => candidate.name === testCase.curve);
  if (!curve) return [];
  const operations: Operation[] = [];
  for (const [from, to] of curve.active_intervals) {
    const inside = curve.peaks.filter((candidate) => candidate.time_seconds >= from && candidate.time_seconds <= to);
    const peak = inside.length ? inside.reduce((best, candidate) => (candidate.value > best.value ? candidate : best)).time_seconds : (from + to) / 2;
    const audition = await sfxAuditionPrepare(projectId, { cue_seconds: peak, role: testCase.library_role, query: testCase.library_query, max_candidates: 1 });
    const operation = audition.candidates[0]!.proposal_operation as Operation;
    const create = operation.create_audio;
    const start = create.timeline_start as number;
    const sourceStart = create.source_start_seconds as number;
    create.source_end_seconds = Math.min(create.source_end_seconds as number, sourceStart + Math.max(0.05, to + 0.15 - start));
    create.lane_key = `sound_effect_${operations.length}`;
    create.lane_index = 20 + operations.length;
    operations.push(operation);
  }
  return operations;
}

function truthPeak(testCase: SoundSyncCase, values: Float64Array) {
  let best = 0;
  for (let index = 1; index < values.length; index += 1) if (values[index]! > values[best]!) best = index;
  return testCase.window.start + (best + 0.5) / 100;
}

const brief = (score: SoundSyncScore) => ({ pass: score.pass, sounds: score.sound_count, correlation: score.correlation, median_onset_ms: score.median_onset_ms, uncaused: score.uncaused_fraction, turn_response: score.turn_response, turns: score.turns?.turns, failures: score.failures });

async function baseline(only?: string) {
  const { truthCurve } = await import("../src/lib/agent/sound-sync-eval");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-sound-sync-"));
  process.env.TIMELINE_PROJECTS_DIR = root;
  const results: Array<Record<string, unknown>> = [];
  try {
    for (const testCase of SOUND_SYNC_CASES.filter((candidate) => !only || candidate.id === only)) {
      const projectId = `eval-sound-sync-${testCase.id}`;
      setupSoundSyncFixture(testCase.id, projectId);
      const policies: Record<string, () => Promise<Operation[]>> = {
        "single-cue-library": () => singleCueLibrary(projectId, testCase, truthPeak(testCase, truthCurve(testCase))),
        "curve-library-hits": () => curveLibraryHits(projectId, testCase),
        "curve-synth": () => curveSynth(projectId, testCase),
        ...(testCase.id === "handwriting" ? { "pen-synth": () => curveSynth(projectId, testCase, "pen") } : {}),
      };
      for (const [policy, run] of Object.entries(policies)) {
        const operations = await run();
        const score = await gradeSoundSync(testCase.id, { projectId, proposal: { operations } });
        results.push({ case_id: testCase.id, policy, ...brief(score), sounds_placed: operations.map((operation) => ({ title: operation.create_audio.title, timeline_start: operation.create_audio.timeline_start })) });
      }
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const receipt = { suite: SOUND_SYNC_EVAL_VERSION, kind: "scripted-baseline", ran_at: new Date().toISOString(), results };
  const out = path.join("private", "eval-sound-sync");
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `${receipt.ran_at.replace(/[:.]/g, "-")}-baseline.json`);
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
  console.table(results.map(({ case_id, policy, pass, correlation, median_onset_ms, uncaused, turn_response }) => ({ case_id, policy, pass, correlation, median_onset_ms, uncaused, turn_response })));
  console.log(`receipt: ${file}`);
}

async function main() {
  const [command, caseId, projectId, proposalArg, audio] = process.argv.slice(2);
  if (command === "list") {
    console.log(JSON.stringify({ suite: SOUND_SYNC_EVAL_VERSION, cases: SOUND_SYNC_CASES.map(({ id, title, request, window, curve }) => ({ id, title, request, window, curve })) }, null, 2));
  } else if (command === "packet" && caseId && projectId) {
    console.log(JSON.stringify(soundSyncPacket(caseId, projectId), null, 2));
  } else if (command === "setup" && caseId && projectId) {
    console.log(JSON.stringify(setupSoundSyncFixture(caseId, projectId), null, 2));
  } else if (command === "grade" && caseId && projectId && proposalArg) {
    soundSyncCase(caseId);
    const proposal = proposalArg.endsWith(".json") ? JSON.parse(fs.readFileSync(proposalArg, "utf8")) : readProposal(projectId, proposalArg);
    const score = await gradeSoundSync(caseId, { projectId, proposal, ...(audio ? { renderedAudio: audio } : {}) });
    console.log(JSON.stringify(score, null, 2));
    if (!score.pass) process.exitCode = 1;
  } else if (command === "baseline") {
    await baseline(caseId);
  } else {
    throw new Error(USAGE);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
