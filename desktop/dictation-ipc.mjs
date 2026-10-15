import fs from 'node:fs/promises';
import path from 'node:path';
import { transcribeDictation } from './dictation.mjs';
import { projectFromWindowUrl } from './chat-ipc.mjs';
export function installDictationIpc(ipcMain, { requestMicrophone = async()=>true } = {}) {
  const owners=new Map();
  ipcMain.handle('dreamcut:dictation',async(event,action,data)=>{
    const owner=owners.get(event.sender.id);
    if(!owner || event.senderFrame!==event.sender.mainFrame || !projectFromWindowUrl(event.sender.getURL(),owner.origin)) throw Error('Open an editing project to dictate.');
    if(action==='status') return {ready:await owner.ready()};
    if(action==='cancel') {owner.cancel();return;}
    if(action==='begin') {
      if(owner.opening || owner.job || owner.armedUntil>Date.now()) throw Error('Dictation is already active.');
      const url=event.sender.getURL(), epoch=owner.epoch;
      owner.opening=true;
      try {
      if(!await owner.ready()) throw Error('Local voice files are missing. Prepare the desktop voice bundle.');
      if(!await requestMicrophone()) throw Error('Allow microphone access in system settings to dictate.');
      if(event.sender.isDestroyed() || event.sender.getURL()!==url || epoch!==owner.epoch) throw Error('The open project changed.');
      owner.armedUntil=Date.now()+150000; return;
      } finally {owner.opening=false;}
    }
    // Live text while recording: best effort, one at a time, and never outlives the final pass.
    if(action==='preview') {
      if(owner.preview || owner.job || owner.armedUntil<Date.now()) return '';
      const preview=new AbortController();owner.preview=preview;
      try { return await transcribeDictation(data,{directory:owner.directory,signal:preview.signal}); }
      catch { return ''; }
      finally {if(owner.preview===preview) owner.preview=undefined;}
    }
    if(action!=='transcribe' || owner.job || owner.armedUntil<Date.now()) throw Error('Start a new dictation recording.');
    owner.armedUntil=0;owner.preview?.abort();owner.preview=undefined;
    const job=new AbortController();owner.job=job;
    try { return await transcribeDictation(data,{directory:owner.directory,signal:job.signal}); }
    finally {if(owner.job===job) owner.job=undefined;}
  });
  return (window,{origin,directory})=>{
    const owner={origin,directory,armedUntil:0,epoch:0,opening:false,job:undefined,preview:undefined,
      ready:async()=>Promise.all(['ggml-base.en.bin',process.platform==='win32'?'whisper-cli.exe':'whisper-cli'].map(file=>fs.access(path.join(directory,file)))).then(()=>true,()=>false),
      cancel(){this.epoch++;this.armedUntil=0;this.job?.abort();this.preview?.abort();this.preview=undefined;}};
    const id=window.webContents.id;
    owners.set(id,owner);
    const reset=()=>owner.cancel();
    window.webContents.on('did-start-navigation',reset);
    window.webContents.on('render-process-gone',reset);
    window.on('closed',()=>{owner.cancel();owners.delete(id);});
    return {cancel:reset,canRecord:()=>owner.armedUntil>Date.now() && projectFromWindowUrl(window.webContents.getURL(),origin)!==null};
  };
}
