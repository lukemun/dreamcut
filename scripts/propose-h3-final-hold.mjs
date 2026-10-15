import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const project = path.resolve('projects/scratchpad-layered-cutout');
const timelineFile = path.join(project, 'timeline.json');
const timelineBytes = fs.readFileSync(timelineFile);
const timeline = JSON.parse(timelineBytes);
const active = timeline.elements.filter((element) => !element.removed_at);
const oldEnd = Math.max(...active.map((element) => element.timeline_start + element.duration));
if (Math.abs(oldEnd - 10.8) > 1e-6) throw new Error(`Unexpected current ending ${oldEnd}`);
const newEnd = oldEnd + 2;
const lastStart = 10.233333333333333;
const lastVisuals = active.filter((element) => element.type === 'still' &&
  Math.abs(element.timeline_start - lastStart) < 1e-6 &&
  Math.abs(element.timeline_start + element.duration - oldEnd) < 1e-6);
if (lastVisuals.length !== 8 ||
  lastVisuals.filter((element) => element.source_url?.includes('h3-grow-pose-16-') && element.source_url.endsWith('-step-14-v3.png')).length !== 7 ||
  lastVisuals.filter((element) => element.source_url?.endsWith('h3-beat-pose-16-subject-v1.png')).length !== 1) {
  throw new Error('The final eight-layer H3 pose does not match the approved sequence');
}
const music = active.find((element) => element.type === 'music' &&
  Math.abs(element.timeline_start + element.duration - oldEnd) < 1e-6);
if (!music || !Number.isFinite(music.trim_end) || music.trim_end < 2) {
  throw new Error('Cannot safely extend the soundtrack by two seconds');
}
const musicEnvelope = music.props?.volume_envelope;
if (!Array.isArray(musicEnvelope) ||
  Math.abs(musicEnvelope.at(-1)?.time_seconds - oldEnd) > 1e-6) {
  throw new Error('The soundtrack volume envelope has an unexpected endpoint');
}
const operations = [
  ...lastVisuals.map((element) => ({
    element_id: element.id,
    rationale: 'Hold this exact final subject or paper layer for two more seconds.',
    patch: {duration: newEnd - lastStart},
  })),
  {
    element_id: music.id,
    rationale: 'Let the existing soundtrack continue through the two-second visual hold, retaining its fade at the new end.',
    patch: {
      timeline_start: music.timeline_start,
      duration: newEnd,
      trim_start: music.trim_start,
      trim_end: music.trim_end - 2,
    },
    props: {volume_envelope: musicEnvelope.map((point, index) =>
      index === musicEnvelope.length - 1 ? {...point, time_seconds: newEnd} : point)},
  },
];
const requestedMutations = 13;
const proposal = {
  schema_version: 2,
  project_id: 'scratchpad-layered-cutout',
  expected_revision: crypto.createHash('sha256').update(timelineBytes).digest('hex'),
  rebase_policy: 'strict',
  mode: 'workshop',
  decision: 'propose',
  summary: 'Hold the final frame for two more seconds',
  assumptions: [
    'Keep the approved 14 cuts, final arm-cross pose, seven rotating contour colors, size, and all earlier timing unchanged.',
    'The two-second extension holds the final still composite without adding a new color or pose change.',
    'Continue the existing soundtrack under the hold and retain its short fade at the new 12.8-second end.',
  ],
  unresolved_gaps: [],
  supersedes_proposal_ids: [],
  caps: {max_mutations: requestedMutations, requested_mutations: requestedMutations, max_renders: 0},
  options: [{
    id: 'hold-last-frame-two-seconds',
    label: 'Hold final frame 2s',
    recommended: true,
    summary: 'Extend the finished pose and all seven paper layers from 10.8 to 12.8 seconds, with the music continuing underneath.',
    requested_mutations: requestedMutations,
    operations,
  }],
};
const output = path.join(project, 'analysis/editorial-intent-plans/h3-final-hold-two-seconds-proposal.json');
fs.writeFileSync(output, JSON.stringify(proposal, null, 2) + '\n');
console.log(JSON.stringify({output, oldEnd, newEnd, visualLayers: lastVisuals.length, operations: operations.length}));
