/** Next is a client of preparation; reloading the editor cannot terminate a render. */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {ensurePreparedRuntime,preparedRuntimeRoot} from './prepared-runtime';
import type {PreparedPreviewInput,PreparedPreviewStatus} from '../timeline/prepared-preview';
type Connection={origin:string;token:string;pid:number;version:string};
const connections=new Map<string,Promise<Connection>>();
const pause=()=>new Promise(r=>setTimeout(r,100));
async function call(connection:Connection,command:unknown) {
  const response=await fetch(connection.origin+'/control',{method:'POST',headers:{Authorization:`Bearer ${connection.token}`,'Content-Type':'application/json'},body:JSON.stringify(command),signal:AbortSignal.timeout(15_000)});
  const result=await response.json();if(!response.ok)throw new Error(result.error??'Preparation worker failed');return result;
}
async function connect(version:string):Promise<Connection> {
  const existing=connections.get(version);if(existing)return existing;
  const work=(async()=>{
    const directory=path.join(preparedRuntimeRoot(),version),file=path.join(directory,'process.json'),lock=path.join(directory,'starting.lock');
    const read=async()=>{try {const value=JSON.parse(fs.readFileSync(file,'utf8'));await call(value,{action:'ping'});return value as Connection;}catch{return null;}};
    const deadline=Date.now()+30_000;
    while(Date.now()<deadline){
      const running=await read();if(running)return running;
      try {fs.mkdirSync(lock);} catch(error) {
        if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
        if(Date.now()-fs.statSync(lock).mtimeMs>35_000)fs.rmSync(lock,{recursive:true,force:true});
        await pause();continue;
      }
      try {
        const running=await read();if(running)return running;
        const token=randomUUID(),log=fs.openSync(path.join(directory,'worker.log'),'a');
        try {spawn(process.execPath,[path.join(directory,'worker.cjs'),directory,token],{cwd:process.cwd(),env:process.env,detached:true,stdio:['ignore',log,log]}).unref();}finally{fs.closeSync(log);}
        while(Date.now()<deadline){const ready=await read();if(ready)return ready;await pause();}
        throw new Error('Preparation worker could not start. See its worker.log.');
      } finally {fs.rmSync(lock,{recursive:true,force:true});}
    }
    throw new Error('Preparation worker startup timed out');
  })();connections.set(version,work);
  try{return await work;}finally{connections.delete(version);}
}
function jobVersion(id:string):string {
  const version=fs.readFileSync(path.join(preparedRuntimeRoot(),'jobs',id),'utf8');
  if(!/^[a-f0-9]{64}$/.test(version))throw new Error('Invalid preparation runtime');return version;
}
async function request(version:string,command:unknown){
  try{return await call(await connect(version),command);}
  catch(error){
    // The process may exit after the health check but before the control request.
    // Durable owner/sequence/id records make replaying this request idempotent.
    if(!(error instanceof TypeError) && !(error instanceof Error && error.name==='TimeoutError'))throw error;
    return call(await connect(version),command);
  }
}
export const preparedWorker={
  async start(project:string,owner:string,input:PreparedPreviewInput,origin:string,sequence:number):Promise<PreparedPreviewStatus>{
    const version=await ensurePreparedRuntime();
    const result=await request(version,{action:'start',project,owner,input,origin,sequence});
    const directory=path.join(preparedRuntimeRoot(),'jobs');fs.mkdirSync(directory,{recursive:true});
    fs.writeFileSync(path.join(directory,result.id),version);return result;
  },
  async status(project:string,id:string):Promise<PreparedPreviewStatus>{return request(jobVersion(id),{action:'status',project,id});},
  async file(project:string,id:string):Promise<string>{return request(jobVersion(id),{action:'file',project,id});},
  async cancel(project:string,id:string){return request(jobVersion(id),{action:'cancel',project,id});},
};
