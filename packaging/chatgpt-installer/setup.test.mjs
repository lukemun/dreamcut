import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { installPlugin, PLUGIN_NAME } from './setup.mjs';
function fixture() {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dreamcut-desktop-installer-'));
 const home=path.join(root,'home with spaces');const payload=path.join(root,'payload');
 fs.mkdirSync(home);fs.mkdirSync(path.join(payload,'launcher/skills/open'),{recursive:true});fs.mkdirSync(path.join(payload,'assets'));
 fs.writeFileSync(path.join(payload,'launcher/skills/open/SKILL.md'),'test skill');fs.writeFileSync(path.join(payload,'assets/icon.png'),'fixture');
 return {root,home,payload,node:'/Applications/Private Node/bin/node'};
}
test('fresh install and reinstall preserve other plugins, catalog identity and user projects',()=>{
 const f=fixture();try {
  const market=path.join(f.home,'.agents/plugins/marketplace.json');fs.mkdirSync(path.dirname(market),{recursive:true});
  const other={name:'other',source:{source:'local',path:'./other'},policy:{installation:'AVAILABLE'}};
  fs.writeFileSync(market,JSON.stringify({name:'my-market',interface:{displayName:'My plugins'},plugins:[other]}));
  const result=installPlugin(f);assert.equal(result.marketplace,'My plugins');
  const project=path.join(f.home,'Library/Application Support/DreamCut/projects');fs.mkdirSync(project);fs.writeFileSync(path.join(project,'sentinel'),'unchanged');
  installPlugin(f);
  const catalog=JSON.parse(fs.readFileSync(market));assert.equal(catalog.name,'my-market');assert.deepEqual(catalog.plugins[0],other);
  assert.equal(catalog.plugins.filter(p=>p.name===PLUGIN_NAME).length,1);
  assert.equal(fs.readFileSync(path.join(project,'sentinel'),'utf8'),'unchanged');
  const config=JSON.parse(fs.readFileSync(path.join(result.dest,'.mcp.json'))).mcpServers.dreamcut;
  assert.equal(config.command,f.node);assert.ok(config.args[0].startsWith('${PLUGIN_ROOT}/'));
  assert.equal(config.env.DREAMCUT_CLOUD_INGEST_URL,'off');assert.ok(!JSON.stringify(config).includes(process.cwd()));
  assert.equal(JSON.parse(fs.readFileSync(path.join(result.dest,'.codex-plugin/plugin.json'))).requires_local_executor,true);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('malformed existing catalog fails without overwriting it or installing a plugin',()=>{
 const f=fixture();try {
  const market=path.join(f.home,'.agents/plugins/marketplace.json');fs.mkdirSync(path.dirname(market),{recursive:true});fs.writeFileSync(market,'{"plugins":{}}');
  assert.throws(()=>installPlugin(f),/catalog is invalid/);assert.equal(fs.readFileSync(market,'utf8'),'{"plugins":{}}');
  assert.equal(fs.existsSync(path.join(f.home,'.codex/plugins',PLUGIN_NAME)),false);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
test('failed payload preparation keeps the installed plugin and marketplace intact',()=>{
 const f=fixture();try {
  const {dest}=installPlugin(f);const market=path.join(f.home,'.agents/plugins/marketplace.json');
  const before=fs.readFileSync(market,'utf8');const manifest=fs.readFileSync(path.join(dest,'.codex-plugin/plugin.json'),'utf8');
  fs.rmSync(path.join(f.payload,'assets'),{recursive:true});assert.throws(()=>installPlugin(f));
  assert.equal(fs.readFileSync(market,'utf8'),before);assert.equal(fs.readFileSync(path.join(dest,'.codex-plugin/plugin.json'),'utf8'),manifest);
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});

test('unmanaged plugin directory is preserved',()=>{
 const f=fixture();try {
  const dest=path.join(f.home,'.codex/plugins',PLUGIN_NAME);fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'sentinel'),'keep');
  assert.throws(()=>installPlugin(f),/unmanaged plugin folder/);
  assert.equal(fs.readFileSync(path.join(dest,'sentinel'),'utf8'),'keep');
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});

test('CLI executes through a symlinked parent directory',()=>{
 const f=fixture();try {
  fs.copyFileSync(fileURLToPath(new URL('./setup.mjs',import.meta.url)),path.join(f.payload,'setup.mjs'));
  const alias=path.join(f.root,'alias');fs.symlinkSync(f.payload,alias,'dir');
  const output=execFileSync(process.execPath,[path.join(alias,'setup.mjs'),'--home',f.home],{encoding:'utf8'});
  assert.match(output,/ready to install in ChatGPT/);
  assert.ok(fs.existsSync(path.join(f.home,'.agents/plugins/marketplace.json')));
 }finally{fs.rmSync(f.root,{recursive:true,force:true});}
});
