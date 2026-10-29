import assert from 'node:assert/strict';
import test from 'node:test';
import { ownerTextFindings } from './check-owner-text.mjs';

test('owner-only rules in shipped instructions are refused, with their line', () => {
  const text = 'Shared rule.\n## Owner working agreements\n- Use pnpm dev (owner, 2026-10-27).\nRead `../dreamcut-cloud/docs/editor-project-status.md`.\nFeature freeze since 2026-10-24.';
  assert.deepEqual(ownerTextFindings('AGENTS.md', text), [
    'AGENTS.md:2: the owner working agreements', 'AGENTS.md:3: an owner-dated rule',
    'AGENTS.md:4: a private checkout path (link docs/project-status.md instead)', 'AGENTS.md:5: a feature freeze']);
  assert.equal(ownerTextFindings('.agents/skills/x/SKILL.md', '(owner, 2026-10-27)').length, 1);
  // Skills send agents into their references and the shared standards as instructions too.
  assert.equal(ownerTextFindings('.agents/skills/x/references/packaging.md', 'Feature freeze since 2026-10-24.').length, 1);
  assert.equal(ownerTextFindings('docs/standards/tool-authoring.md', 'Read ../dreamcut-cloud/docs/x.md').length, 1);
});

test('history, code and the public pointer are not instructions', () => {
  const text = 'Decided (owner, 2026-10-27) during the feature freeze.';
  assert.deepEqual(ownerTextFindings('.agents/skills/x/evolution.md', text), []);
  assert.deepEqual(ownerTextFindings('src/lib/timeline/captions.ts', text), []);
  assert.deepEqual(ownerTextFindings('AGENTS.md', 'Decisions are in the [project status](docs/project-status.md).'), []);
});
