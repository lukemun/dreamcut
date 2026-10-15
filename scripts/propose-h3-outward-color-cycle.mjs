import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const project = path.resolve('projects/scratchpad-layered-cutout');
const timelineFile = path.join(project, 'timeline.json');
const timelineBytes = fs.readFileSync(timelineFile);
const timeline = JSON.parse(timelineBytes);
const receipt = JSON.parse(fs.readFileSync(path.join(project, 'media/sources/h3-growing-bands-v3-receipt.json')));
const sources = new Set(receipt.assets.map((asset) => asset.output));
if (sources.size !== 98) throw new Error(`Expected 98 independent paper assets, found ${sources.size}`);
const active = timeline.elements.filter((element) => !element.removed_at &&
  /h3-grow-pose-.+-step-\d+-v2\.png$/.test(element.source_url ?? ''));
if (active.length !== 98) throw new Error(`Expected 98 active growing paper elements, found ${active.length}`);
const sourcePrefix = '/api/projects/scratchpad-layered-cutout/media/sources/';
const operations = active.map((element) => {
  const sourceName = path.basename(element.source_url).replace(/-v2\.png$/, '-v3.png');
  if (!sources.has(sourceName)) throw new Error(`Missing generated source ${sourceName}`);
  return {
    element_id: element.id,
    rationale: 'Shift the paper palette outward one band at this cut while preserving its contour radius and layer position.',
    patch: {source_url: sourcePrefix + sourceName},
  };
});
const revision = crypto.createHash('sha256').update(timelineBytes).digest('hex');
const proposal = {
  schema_version: 2,
  project_id: 'scratchpad-layered-cutout',
  expected_revision: revision,
  rebase_policy: 'strict',
  mode: 'workshop',
  decision: 'propose',
  summary: 'Move contour colors outward one band on every cut',
  assumptions: [
    'Keep all 14 approved hit times, arm poses, body size, stepped contour widths, music, and total duration unchanged.',
    'At every cut, each visible color moves one band outward. The former outer color cycles into the innermost band so seven colors remain visible.',
    'Keep the seven separate paper layers editable and retain their existing shared geometry, shadows, and front-to-back order.',
  ],
  unresolved_gaps: [],
  supersedes_proposal_ids: [],
  caps: {max_mutations: 98, requested_mutations: 98, max_renders: 0},
  options: [{
    id: 'outward-one-band-per-cut',
    label: 'Colors move outward each cut',
    recommended: true,
    summary: 'The colors advance outward one contour band on every selected hit while the bands keep growing to fill the screen.',
    requested_mutations: 98,
    operations,
  }],
};
const output = path.join(project, 'analysis/editorial-intent-plans/h3-outward-color-cycle-proposal.json');
fs.writeFileSync(output, JSON.stringify(proposal, null, 2) + '\n');
console.log(JSON.stringify({output, revision, operations: operations.length}));
