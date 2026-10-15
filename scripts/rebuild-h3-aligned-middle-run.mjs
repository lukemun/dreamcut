import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const folder = path.join(root, 'projects/scratchpad-layered-cutout/analysis/editorial-intent-plans');
const source = JSON.parse(fs.readFileSync(path.join(folder, 'align-hits-2.json'), 'utf8'));
source.expected_revision = 'a703d56b9c4f0e6752a745422d85f8add942061f5d48ebea5dc03733373db752';
const sourceOps = source.options[0].operations;
const byPose = (pose) => sourceOps.filter((op) =>
  (op.patch?.source_url ?? op.create_visual?.source_url ?? '').includes(`h3-beat-pose-${pose}-`));
const replacePose = (op, fromPose, toPose, start, duration) => {
  const next = structuredClone(op);
  const patch = next.patch ?? next.create_visual;
  patch.source_url = patch.source_url.replace(`h3-beat-pose-${fromPose}-`, `h3-beat-pose-${toPose}-`);
  patch.timeline_start = start;
  patch[next.patch ? 'duration' : 'duration_seconds'] = duration;
  next.rationale = `Group 2: applied marked hit, source sprite ${toPose}; synchronized subject and contour.`;
  return next;
};
const at = (frame) => frame / 30;
const lastMiddle = 288;
const events = [
  { from: '08', to: '07', template: 'patch', frame: 234, next: 238 },
  { from: '09', to: '08', template: 'create', frame: 238, next: 242 },
  { from: '09', to: '09', template: 'create', frame: 242, next: 246 },
  { from: '10', to: '11', template: 'patch', frame: 246, next: 256 },
  { from: '11', to: '11a', template: 'create', frame: 256, next: 259 },
  { from: '11', to: '12', template: 'create', frame: 259, next: lastMiddle },
];
let newId = 97;
const operations = [];
for (const event of events) {
  const template = byPose(event.from).filter((op) => Boolean(op.patch) === (event.template === 'patch'));
  if (template.length !== 8) throw new Error(`Expected eight ${event.template} operations for ${event.from}, got ${template.length}`);
  for (const original of template) {
    const op = replacePose(original, event.from, event.to, at(event.frame), at(event.next - event.frame));
    if (event.template === 'create') op.element_id = `b3a70000-0000-4000-8000-${String(newId++).padStart(12, '0')}`;
    operations.push(op);
  }
}
operations.push(...sourceOps.filter((op) => {
  const url = op.patch?.source_url ?? op.create_visual?.source_url ?? '';
  return /h3-beat-pose-(?:13|14|15|16)-/.test(url);
}));
operations.sort((a, b) => Number(Boolean(b.patch)) - Number(Boolean(a.patch)));
if (operations.length !== 80 || new Set(operations.map((op) => op.element_id)).size !== 80) throw new Error('Invalid operation set');
source.summary = 'Hit alignment — all 14 applied marks';
source.assumptions = [
  'Keep the approved first run, music, body scale, regular crisp contours, and 10.8s ending.',
  'Use all 14 currently applied marked hits: four first, six middle, four final.',
  'Middle uses source-video poses 7, 8, 9, 11, 11a, 12; the second drum skips pose 10 and 11a is raw video frame 45.',
  'Every pose and all seven companion contours cut together on a 30 fps boundary.',
];
source.options[0].label = source.summary;
source.options[0].summary = 'One synchronized subject-and-contour state per applied hit in the middle and final runs.';
for (const [label, subset] of [['all-14', operations]]) {
  const plan = structuredClone(source);
  plan.summary = `Hit alignment — ${label === 'all-14' ? 'all 14 marked hits' : label === 'middle-six' ? 'middle six' : 'final four'}`;
  plan.options[0].label = plan.summary;
  plan.options[0].operations = subset;
  plan.supersedes_proposal_ids = ['20260926T004807-8b5c43a6', '20260926T011759-21d44b0f', '20260926T011823-ba0a1075'];
  const mutations = subset.reduce((total, op) => total + Object.keys(op.patch ?? op.create_visual).length, 0);
  plan.options[0].requested_mutations = mutations;
  plan.caps.max_mutations = mutations;
  plan.caps.requested_mutations = mutations;
  const output = path.join(folder, `align-hits-${label}-all-14.json`);
  fs.writeFileSync(output, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(output, subset.length, mutations);
}

const analysisDir = path.join(root, 'projects/scratchpad-layered-cutout/analysis');
const mapPath = path.join(analysisDir, 'beat-cut-map.json');
const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
const settings = JSON.parse(fs.readFileSync(path.join(analysisDir, 'instruments', map.analysis_key, 'settings.json'), 'utf8'));
const analysis = JSON.parse(fs.readFileSync(path.join(analysisDir, 'instruments', map.analysis_key, 'manifest.json'), 'utf8'));
const timeline = JSON.parse(fs.readFileSync(path.join(root, 'projects/scratchpad-layered-cutout/timeline.json'), 'utf8'));
const selected = settings.marked_hits.map((key) => {
  const [instrument, rawTime] = key.split(':');
  const time = Number(rawTime);
  const hit = analysis.lanes.find((lane) => lane.id === instrument)?.hits.find((candidate) => Math.abs(candidate.time_seconds - time) < 0.000001);
  if (!hit) throw new Error(`Unresolved applied hit ${key}`);
  return { instrument, time, strength: hit.strength };
}).sort((a, b) => a.time - b.time);
if (selected.length !== 14) throw new Error(`Expected 14 applied hits, found ${selected.length}`);
const frames = [3,4,5,6,7,8,9,11,'11a',12,13,14,15,16];
map.timeline_revision = source.expected_revision;
map.applied_settings = settings;
map.notes = [
  'The first four cuts are already approved; this proposal replaces only the middle six and final four.',
  'The second middle drum skips sprite pose 10; the following 11a still is source-video frame 45 between board poses 11 and 12.',
];
map.rows = selected.map((hit, index) => {
  const frame = frames[index];
  const targetFrame = Math.round((hit.time - 14.45) * 30);
  const sourceFragment = `h3-beat-pose-${String(frame).padStart(2, '0')}-`;
  const affected = index < 4
    ? timeline.elements.filter((element) => element.source_url?.includes(sourceFragment)).map((element) => element.id)
    : operations.filter((op) => (op.patch?.source_url ?? op.create_visual?.source_url ?? '').includes(sourceFragment)).map((op) => op.element_id);
  if (affected.length !== 8) throw new Error(`Expected eight synchronized layers for pose ${frame}, got ${affected.length}`);
  const timelineSeconds = hit.time - 14.45;
  const group = index < 4 ? 1 : index < 10 ? 2 : 3;
  return {
    time_seconds: hit.time, strength: hit.strength, instrument: hit.instrument,
    group, role: hit.instrument === 'drums' ? 'drum jump' : 'marked melody/other hit',
    source_sprite_frame: frame, timeline_seconds: timelineSeconds,
    target_frame: targetFrame, quantized_seconds: targetFrame / 30,
    error_ms: (targetFrame / 30 - timelineSeconds) * 1000,
    affected_element_ids: affected,
  };
});
fs.writeFileSync(mapPath, `${JSON.stringify(map, null, 2)}\n`);
console.log(mapPath, map.rows.length);
