import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {installDictationIpc} from './dictation-ipc.mjs';
test('voice IPC rejects unknown frames/origins and cancellation revokes a pending permission request',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'voice-ipc-test-'));
 try {
  for(const name of ['whisper-cli','whisper-cli.exe','ggml-base.en.bin'])await fs.writeFile(path.join(directory,name),'fixture');
  let invoke,permissionResolve;const permission=new Promise(resolve=>{permissionResolve=resolve;});
  const register=installDictationIpc({handle:(_,fn)=>{invoke=fn;}},{requestMicrophone:()=>permission});
  let url='http://127.0.0.1:9000/p/fixture';
  const contents=Object.assign(new EventEmitter(),{id:10,mainFrame:{},getURL:()=>url,isDestroyed:()=>false});
  const window=Object.assign(new EventEmitter(),{webContents:contents});
  const owner=register(window,{origin:'http://127.0.0.1:9000',directory});
  const event={sender:contents,senderFrame:contents.mainFrame};
  await assert.rejects(invoke({...event,senderFrame:{}},'status'),/Open an editing project/);
  url='https://example.com/p/fixture';await assert.rejects(invoke(event,'begin'),/Open an editing project/);url='http://127.0.0.1:9000/p/fixture';
  await assert.rejects(invoke(event,'transcribe',new Uint8Array(4)),/Start a new/);
  const starting=invoke(event,'begin');await new Promise(resolve=>setImmediate(resolve));
  await invoke(event,'cancel');permissionResolve(true);await assert.rejects(starting,/project changed/);assert.equal(owner.canRecord(),false);
  assert.equal(await invoke(event,'preview',new Uint8Array(4)),'');
  await invoke(event,'begin');assert.equal(owner.canRecord(),true);
  // A failed live preview stays quiet and leaves the recording armed for its final pass.
  assert.equal(await invoke(event,'preview',new Uint8Array(4)),'');assert.equal(owner.canRecord(),true);
  contents.emit('did-start-navigation');assert.equal(owner.canRecord(),false);
  window.emit('closed');await assert.rejects(invoke(event,'status'),/Open an editing project/);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
