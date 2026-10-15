import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function visualAnalyze({project_id,action='prepare',job_id,...input}){
 if(!/^[A-Za-z0-9._-]{1,128}$/.test(project_id??'')||['.','..'].includes(project_id))throw Error('Invalid project ID');
 if(!['prepare','status'].includes(action)||action==='status'&&!/^[a-f0-9-]{36}$/.test(job_id??''))throw Error('Invalid visual analysis action/job');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['--import','tsx',path.join(root,'mcp/visual-analysis-cli.ts'),action,project_id,...(action==='status'?[job_id]:[])],{cwd:root,stdio:['pipe','pipe','pipe'],env:process.env});
  let output='';const timeout=setTimeout(()=>{child.kill('SIGTERM');reject(Error('Visual analysis admission timed out; inspect existing jobs before retrying'));},25000);
  child.stdout.on('data',chunk=>{output+=chunk;if(output.length>128000){child.kill('SIGTERM');reject(Error('Analysis response exceeded bound'));}});child.stderr.on('data',()=>{});
  child.on('error',error=>{clearTimeout(timeout);reject(error);});
  child.on('close',()=>{clearTimeout(timeout);try{const reply=JSON.parse(output);if(reply.error)reject(Object.assign(Error(reply.error),{toolError:reply.toolError}));else resolve(reply.result);}catch(error){reject(error);}});
  child.stdin.on('error',()=>{});child.stdin.end(action==='prepare'?JSON.stringify(input):'');
 });
}
