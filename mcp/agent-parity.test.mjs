import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { checkAgentParity } from '../scripts/check-agent-parity.mjs';
import { editorAgentFamilies, editorAgentTools, registry, validateEditorAgentAccess } from './capability-catalog.mjs';

const derived = {
  session: "const families = (await import(x)).editorAgentFamilies();",
  harness: 'const OPERATOR_TOOLS=editorAgentTools();',
};

function skills(map) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-skills-'));
  for (const [name, text] of Object.entries(map)) {
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, 'SKILL.md'), text);
  }
  return dir;
}

const noExemptions = { schema_version: 1, coding_agent_skills: {}, gaps: [] };

test('the live repository satisfies the parity contract', () => {
  const report = checkAgentParity();
  assert.deepEqual(report.violations, []);
});

test('the editor surface is derived from registry access, including exclusions', () => {
  assert.deepEqual(validateEditorAgentAccess(), []);
  const tools = editorAgentTools();
  assert.ok(tools.has('capability_catalog'));
  assert.ok(tools.has('proposal_create'));
  assert.ok(!tools.has('element_create'), 'direct workspace writes stay out of the editor agent');
  const source = structuredClone(registry);
  source.capabilities.find((cap) => cap.id === 'proposal-authoring').editor_agent = { access: 'enabled', excluded_tools: { recipe_compile: 'example' } };
  assert.ok(!editorAgentTools(source).has('recipe_compile'));
  assert.ok(editorAgentFamilies(source).includes('proposal-authoring'));
});

test('a capability without declared editor access is a violation', () => {
  const source = structuredClone(registry);
  delete source.capabilities[0].editor_agent;
  source.capabilities[1].editor_agent = { access: 'excluded' };
  const problems = validateEditorAgentAccess(source);
  assert.ok(problems.some((problem) => problem.includes(source.capabilities[0].id)));
  assert.ok(problems.some((problem) => /needs a reason/.test(problem)));
});

test('a hand-kept family list or allowlist is a violation', () => {
  const report = checkAgentParity({
    skillsDir: skills({}),
    exemptions: noExemptions,
    files: { session: "export const EDITING_FAMILIES = ['editing-context'];", harness: "const OPERATOR_TOOLS=new Set(['timeline_get']);" },
  });
  assert.equal(report.violations.length, 2);
});

test('editing skills must name an MCP tool, record a gap, or be coding-agent skills', () => {
  const dir = skills({
    'sound-demo': 'Inspect `sfx-library/catalog.json` for candidates.\n',
    'named-demo': 'Run `pnpm frame-state demo`, or in the editor `run_instrument` then `timeline_evidence`.\n',
    'dev-demo': 'Run `pnpm typecheck`.\n',
  });
  const strict = checkAgentParity({ skillsDir: dir, exemptions: noExemptions, files: derived });
  assert.equal(strict.violations.length, 2);
  assert.match(strict.violations.join('\n'), /sound-demo\/SKILL\.md:1/);
  assert.match(strict.violations.join('\n'), /dev-demo\/SKILL\.md:1/);

  const exempted = checkAgentParity({
    skillsDir: dir,
    files: derived,
    exemptions: {
      schema_version: 1,
      coding_agent_skills: { 'dev-demo': 'Repository development.' },
      gaps: [{ skill: 'sound-demo', line_contains: 'sfx-library/catalog.json', missing: 'SFX search', reason: 'No tool yet.' }],
    },
  });
  assert.deepEqual(exempted.violations, []);
  assert.deepEqual(exempted.gaps.map((gap) => gap.missing), ['SFX search']);
});

test('an exemption that no longer matches fails, so closed gaps leave the list', () => {
  const report = checkAgentParity({
    skillsDir: skills({ 'sound-demo': 'Use `sfx_search` to find candidates.\n' }),
    files: derived,
    exemptions: {
      schema_version: 1,
      coding_agent_skills: { 'gone-skill': 'Removed.' },
      gaps: [{ skill: 'sound-demo', line_contains: 'sfx-library/catalog.json', missing: 'SFX search', reason: 'No tool yet.' }],
    },
  });
  assert.match(report.violations.join('\n'), /stale gap/);
  assert.match(report.violations.join('\n'), /stale coding-agent skill exemption: gone-skill/);
});
