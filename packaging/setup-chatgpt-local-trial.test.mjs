import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('full upgrade keeps project storage and replaces restricted entry skills; default remains restricted', () => {
 const home = fs.mkdtempSync(path.join(os.tmpdir(),'dreamcut-plugin-test-'));
 const run = (...args) => execFileSync(process.execPath,['packaging/setup-chatgpt-local-trial.mjs',...args],{env:{...process.env,DREAMCUT_PLUGIN_HOME:home},stdio:'pipe'});
 const dest=path.join(home,'.codex/plugins/dreamcut-local-trial');
 const read=name=>JSON.parse(fs.readFileSync(path.join(dest,name),'utf8'));
 try {
  run();
  const restricted=read('.mcp.json').mcpServers.dreamcut;
  assert.ok(restricted.args.includes('--local-media-only'));
  const sentinel=path.join(restricted.env.TIMELINE_PROJECTS_DIR,'preserve-me');
  fs.writeFileSync(sentinel,'unchanged');
  run('--full-access');
  const full=read('.mcp.json').mcpServers.dreamcut;
  assert.ok(!full.args.includes('--local-media-only'));
  assert.deepEqual(full.env,restricted.env);
  assert.equal(fs.readFileSync(sentinel,'utf8'),'unchanged');
  const manifest=read('.codex-plugin/plugin.json');
  assert.equal(manifest.skills,'./full-skills/');
  const skill=fs.readFileSync(path.join(dest,manifest.skills,'edit-video/SKILL.md'),'utf8');
  assert.match(skill,/speech_prepare/);
  assert.match(skill,/Never approve/);
  assert.equal(manifest.version,'0.3.0');
  assert.ok(full.args.includes('--package=dreamcut@0.2.2'));
  assert.ok(!full.args.some(arg=>arg.includes(path.join(process.cwd(),'bin'))));
  assert.equal(full.cwd,path.join(home,'.codex/dreamcut-local-trial'));
  assert.equal(full.command,process.execPath);
  assert.equal(full.env.PATH.split(path.delimiter)[0],path.dirname(process.execPath));
  run();
  assert.ok(read('.mcp.json').mcpServers.dreamcut.args.includes('--local-media-only'));
 } finally { fs.rmSync(home,{recursive:true,force:true}); }
});
