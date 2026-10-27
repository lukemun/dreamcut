import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
for (const mode of ['disconnect', 'crash']) test(mode === 'disconnect' ? 'real MCP input closure terminates an active helper and its nested child' : 'real MCP forced death terminates an active helper and its nested child', {skip:process.platform==='win32',timeout:15000}, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-mcp-disconnect-'));
  let server, helperPid, nestedPid;
  const gone = pid => {
    try { process.kill(pid, 0); return false; }
    catch (error) { if (error.code === 'ESRCH') return true; throw error; }
  };
  try {
    await fs.cp(path.join(repository,'mcp'),path.join(root,'mcp'),{recursive:true});
    for(const name of ['node_modules','docs','src']) await fs.symlink(path.join(repository,name),path.join(root,name));
    // The server imports helpers from scripts/; link them all and replace only project-health with the fixture.
    await fs.mkdir(path.join(root,'scripts'));
    for(const name of await fs.readdir(path.join(repository,'scripts'))) if(name!=='project-health.ts') await fs.symlink(path.join(repository,'scripts',name),path.join(root,'scripts',name));
    const ready = path.join(root,'ready.json');
    await fs.writeFile(path.join(root,'scripts/project-health.ts'), `
      const {spawn}=require('node:child_process');
      const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:['ignore',1,2]});
      require('node:fs').writeFileSync(${JSON.stringify(ready)},JSON.stringify([process.pid,child.pid]));
      setInterval(()=>{},1000);
    `);
    server=spawn(process.execPath,[path.join(root,'mcp/server.mjs'),'--profile=full'],{
      cwd:root,env:{...process.env,DREAMCUT_TOOL_FAMILIES:'visual-evidence',TIMELINE_EDITOR_BASE_URL:'http://127.0.0.1:1'},stdio:['pipe','pipe','pipe']});
    let output=''; server.stdout.on('data',chunk=>{output+=chunk;}); server.stderr.resume();
    const exit = new Promise((resolve,reject)=>{server.once('error',reject);server.once('exit',resolve);});
    server.stdin.write(JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'run_instrument',arguments:{instrument:'project-health',project_id:'fixture'}}})+'\n');
    for(let i=0;i<500;i++) {
      try { [helperPid,nestedPid]=JSON.parse(await fs.readFile(ready,'utf8')); break; }
      catch(error) { if(error.code!=='ENOENT') throw error; }
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.ok(helperPid && nestedPid,'fixture helper must start before disconnect');
    if (mode === 'crash') server.kill('SIGKILL'); else server.stdin.end();
    let deadline;
    try { assert.equal(await Promise.race([exit,new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('MCP did not exit after disconnect')),4000);})]),mode === 'crash' ? null : 0); }
    finally { clearTimeout(deadline); }
    for(let i=0;i<100 && (!gone(helperPid)||!gone(nestedPid));i++) await new Promise(resolve=>setTimeout(resolve,20));
    assert.ok(gone(helperPid)); assert.ok(gone(nestedPid));
    helperPid=undefined; nestedPid=undefined;
    assert.equal(output,'','disconnected request must not emit a late result');
  } finally {
    if(server && server.exitCode===null) server.kill('SIGKILL');
    if(helperPid) {try {process.kill(-helperPid,'SIGKILL');} catch{}}
    await fs.rm(root,{recursive:true,force:true});
  }
});
