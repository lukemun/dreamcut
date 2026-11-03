import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

test('the restricted trial runs from this checkout and a rerun keeps project storage', () => {
 const home = fs.mkdtempSync(path.join(os.tmpdir(),'dreamcut-plugin-test-'));
 const run = (...args) => execFileSync(process.execPath,['packaging/setup-chatgpt-local-trial.mjs',...args],{env:{...process.env,DREAMCUT_PLUGIN_HOME:home},stdio:'pipe'});
 const dest=path.join(home,'.codex/plugins/dreamcut-local-trial');
 const read=name=>JSON.parse(fs.readFileSync(path.join(dest,name),'utf8'));
 try {
  run();
  const server=read('.mcp.json').mcpServers.dreamcut;
  assert.ok(server.args.includes('--local-media-only'));
  assert.equal(server.args[0],path.join(process.cwd(),'bin/dreamcut.mjs'));
  assert.equal(server.command,process.execPath);
  assert.equal(server.env.PATH.split(path.delimiter)[0],path.dirname(process.execPath));
  const manifest=read('.codex-plugin/plugin.json');
  assert.equal(manifest.skills,'./skills/');
  assert.ok(fs.existsSync(path.join(dest,'skills/chatgpt-local-trial/SKILL.md')));
  const sentinel=path.join(server.env.TIMELINE_PROJECTS_DIR,'preserve-me');
  fs.writeFileSync(sentinel,'unchanged');
  run();
  assert.equal(fs.readFileSync(sentinel,'utf8'),'unchanged');
  assert.deepEqual(read('.mcp.json').mcpServers.dreamcut,server);
  assert.throws(()=>run('--full-access'));
 } finally { fs.rmSync(home,{recursive:true,force:true}); }
});
