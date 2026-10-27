import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCpuProfileSummary, shortLocation, stacksTo, summarizeCpuProfile, type CpuProfile } from './cpu-profile-summary';

const frame = (functionName: string, url = '', lineNumber = 0) => ({ functionName, url, lineNumber, columnNumber: 0, scriptId: '1' });

// root → main → { outer → inner, outer(recursive) → outer }, plus idle and GC leaves.
const profile: CpuProfile = {
  startTime: 0,
  endTime: 10_000,
  nodes: [
    { id: 1, callFrame: frame('(root)'), children: [2, 6, 7] },
    { id: 2, callFrame: frame('main', 'file:///repo/scripts/run.ts', 9), children: [3] },
    { id: 3, callFrame: frame('outer', 'file:///repo/src/lib/a.ts', 19), children: [4, 5] },
    { id: 4, callFrame: frame('inner', 'file:///repo/node_modules/.pnpm/perfect-freehand@1.2.2/node_modules/perfect-freehand/dist/index.js', 4) },
    { id: 5, callFrame: frame('outer', 'file:///repo/src/lib/a.ts', 19) },
    { id: 6, callFrame: frame('(idle)') },
    { id: 7, callFrame: frame('(garbage collector)') },
  ],
  // Each sample owns the interval to the next one: 1 ms each, the last one the mean.
  samples: [4, 4, 4, 5, 5, 3, 2, 6, 6, 7],
  timeDeltas: [0, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
};

test('self and total time per function, recursion counted once per sample', () => {
  const summary = summarizeCpuProfile(profile, { root: '/repo' });
  assert.equal(summary.samples, 10);
  assert.equal(summary.sampledMs, 10);
  assert.equal(summary.categories.idleMs, 2);
  assert.equal(summary.categories.gcMs, 1);
  assert.equal(summary.busyMs, 8);
  const inner = summary.bySelf.find((cost) => cost.name === 'inner')!;
  assert.equal(inner.selfMs, 3);
  assert.equal(inner.location, 'perfect-freehand/dist/index.js:5');
  const outer = summary.byTotal.find((cost) => cost.name === 'outer')!;
  // 3 inner + 2 recursive outer + 1 outer itself; the recursive frame is not counted twice.
  assert.equal(outer.totalMs, 6);
  assert.equal(outer.selfMs, 3);
  assert.equal(outer.location, 'src/lib/a.ts:20');
  assert.equal(summary.byTotal[0].name, 'main');
  assert.equal(summary.byTotal[0].totalMs, 7);
  assert.equal(summary.byFile[0].location, 'src/lib/a.ts');
  assert.ok(!summary.bySelf.some((cost) => cost.name.startsWith('(')));
});

test('a resolver maps positions to original sources', () => {
  const summary = summarizeCpuProfile(profile, {
    root: '/repo',
    resolve: (callFrame) => callFrame.url.endsWith('a.ts') ? { file: '/repo/src/lib/original.ts', line: 42, name: 'mapped' } : null,
  });
  const mapped = summary.byTotal.find((cost) => cost.name === 'mapped')!;
  assert.equal(mapped.location, 'src/lib/original.ts:42');
  assert.equal(mapped.totalMs, 6);
});

test('parent links are accepted instead of children lists', () => {
  const withParents: CpuProfile = { ...profile, nodes: profile.nodes.map(({ children: _children, ...node }) => node) };
  const parentOf: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 3, 6: 1, 7: 1 };
  for (const node of withParents.nodes) if (parentOf[node.id]) node.parent = parentOf[node.id];
  assert.equal(summarizeCpuProfile(withParents).byTotal.find((cost) => cost.name === 'outer')!.totalMs, 6);
});

test('locations read well for files, packages and served chunks', () => {
  assert.equal(shortLocation('file:///repo/src/x.ts', '/repo'), 'src/x.ts');
  assert.equal(shortLocation('/repo/node_modules/zod/lib/index.js', '/repo'), 'zod/lib/index.js');
  assert.equal(shortLocation('http://127.0.0.1:3123/_next/static/chunks/app.js'), 'chunks/app.js');
  assert.equal(shortLocation(''), '(native)');
});

test('formatting prints both rankings', () => {
  const text = formatCpuProfileSummary(summarizeCpuProfile(profile, { root: '/repo' }), { title: 'cold' });
  assert.match(text, /^cold/);
  assert.match(text, /By self time/);
  assert.match(text, /By total time/);
  assert.match(text, /inner\s+perfect-freehand/);
});

test('stacks to a function, heaviest first, recursion as one stack', () => {
  const stacks = stacksTo(profile, 'outer', { root: '/repo' });
  // Samples under outer: 3 inner, 2 recursive outer, 1 outer — all reach it through main.
  assert.equal(stacks.length, 1);
  assert.equal(stacks[0].ms, 6);
  assert.deepEqual(stacks[0].stack, ['outer src/lib/a.ts:20', 'main scripts/run.ts:10']);
  assert.equal(stacksTo(profile, 'inn')[0].ms, 3);
  assert.deepEqual(stacksTo(profile, 'missing'), []);
});
