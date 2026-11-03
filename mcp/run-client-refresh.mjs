import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { gradeRefreshProbe } from './client-refresh-probe.mjs';
import { readEnv } from './env-name.mjs';

const model=process.argv[2];
const profile=process.argv[3] ?? 'editing';
if(!['editing','full'].includes(profile))throw Error('Profile must be editing or full');
if(!model || !/^[a-zA-Z0-9._-]+$/.test(model))throw Error('Usage: node mcp/run-client-refresh.mjs <exact-model-id>');
const root=fileURLToPath(new URL('../',import.meta.url));
const parent=path.join(root,'private','eval-tool-refresh');fs.mkdirSync(parent,{recursive:true});
const dir=fs.mkdtempSync(path.join(parent,`${model}-`));
const home=fs.mkdtempSync(path.join(os.tmpdir(),'dreamcut-refresh-auth-'));fs.chmodSync(home,0o700);
const workspace=path.join(dir,'empty-workspace');fs.mkdirSync(workspace);
const auth=path.join(process.env.CODEX_HOME ?? path.join(os.homedir(),'.codex'),'auth.json');
if(fs.existsSync(auth)){fs.copyFileSync(auth,path.join(home,'auth.json'));fs.chmodSync(path.join(home,'auth.json'),0o600);}
const receipt=path.join(dir,'receipt.json');
const config=`model = ${JSON.stringify(model)}\nmodel_reasoning_effort = "medium"\napproval_policy = "never"\nweb_search = "disabled"\n[features]\nshell_tool = false\nunified_exec = false\napps = false\nplugins = false\nmulti_agent = false\nbrowser_use = false\ncomputer_use = false\nimage_generation = false\nmemories = false\nhooks = false\ncode_mode = false\n[mcp_servers.dreamcut-refresh-probe]\ncommand = ${JSON.stringify(process.execPath)}\nargs = ${JSON.stringify([path.join(root,'mcp/client-refresh-probe.mjs'),'serve',receipt,profile])}\nstartup_timeout_sec = 20\ntool_timeout_sec = 30\n`;
fs.writeFileSync(path.join(home,'config.toml'),config);
const prompt='Use only dreamcut-refresh-probe tools. Find the masking/cutout capability in its catalog and load that family. Then use its cutout job-status tool to inspect project refresh-probe, job probe-job. Report the returned probe marker. Do not prepare media, modify a project, use shell/code, or call another server. If the status tool never becomes callable, report that blocker. Stop after reporting the marker or blocker.';
fs.writeFileSync(path.join(dir,'prompt.txt'),prompt);
fs.writeFileSync(path.join(dir,'config.toml'),config);
const executable=readEnv("CODEX_EXECUTABLE") ?? 'codex';
const manifest={case_id:'client-tool-refresh-v1',requested_model:model,profile,reasoning:'medium',client_version:execFileSync(executable,['--version'],{encoding:'utf8'}).trim(),started_at:new Date().toISOString(),status:'running',run_dir:dir,token_usage:null};
const save=()=>fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2));save();
console.log(JSON.stringify({run_dir:dir,model,status:'running'}));
const started=Date.now();
try {
  const child=spawn(executable,['exec','--ephemeral','--ignore-rules','--skip-git-repo-check','--sandbox','read-only','--cd',workspace,'--model',model,'--json','--output-last-message',path.join(dir,'answer.txt'),prompt],{env:{...process.env,CODEX_HOME:home},stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32'});
  const kill=()=>{try{if(process.platform!=='win32')process.kill(-child.pid,'SIGKILL');else child.kill();}catch{}};
  const timer=setTimeout(()=>{manifest.status='timeout';kill();},180000);
  child.stdout.on('data',chunk=>fs.appendFileSync(path.join(dir,'events.jsonl'),chunk));
  child.stderr.on('data',chunk=>fs.appendFileSync(path.join(dir,'stderr.log'),chunk));
  try{const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});manifest.exit_code=code;if(manifest.status!=='timeout')manifest.status=code===0?'completed':'failed';}finally{clearTimeout(timer);kill();}
  if(fs.existsSync(receipt)){const grade=gradeRefreshProbe(JSON.parse(fs.readFileSync(receipt,'utf8')));manifest.grade=grade;fs.writeFileSync(path.join(dir,'grade.json'),JSON.stringify(grade,null,2));}
  if(fs.existsSync(path.join(dir,'events.jsonl')))for(const line of fs.readFileSync(path.join(dir,'events.jsonl'),'utf8').split('\n')){try{const e=JSON.parse(line);if(e.usage)manifest.token_usage=e.usage;}catch{}}
} catch(error){manifest.status='failed';manifest.error=error.message;}
finally{manifest.elapsed_ms=Date.now()-started;save();fs.rmSync(home,{recursive:true,force:true});}
console.log(JSON.stringify(manifest));
if(manifest.status!=='completed'||!manifest.grade?.pass)process.exitCode=1;
