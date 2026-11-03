import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { installChatIpc, projectFromWindowUrl } from './chat-ipc.mjs';

test('chat accepts only an exact local project route', () => {
 assert.equal(projectFromWindowUrl('http://127.0.0.1:3/p/film.v2#generate','http://127.0.0.1:3'),'film.v2');
 for(const url of ['http://localhost:3/p/film.v2','http://127.0.0.1:3/','http://127.0.0.1:3/p/../secret','http://127.0.0.1:3/p/a/b','http://127.0.0.1:3/p/%2E%2E/secret','http://127.0.0.1:3/p/a%2Fb','http://127.0.0.1:3/p/'+ 'x'.repeat(129)])assert.equal(projectFromWindowUrl(url,'http://127.0.0.1:3'),null);
});

test('IPC confines callers to registered main frames and closes sessions on project navigation', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-chat-ipc-'));
 await fs.mkdir(path.join(root,'film.v2')); await fs.writeFile(path.join(root,'film.v2/timeline.json'),'{}');
 let handler,url='http://127.0.0.1:3/p/film.v2',sent=[],modelsSent=[],closed=0;
 const register=installChatIpc({handle:(_name,fn)=>{handler=fn;}});
 const window=new EventEmitter(); window.webContents=Object.assign(new EventEmitter(),{id:77,mainFrame:{},getURL:()=>url,isDestroyed:()=>false,send:()=>{}});
 const dispose=register(window,{origin:'http://127.0.0.1:3',projectsRoot:root,userData:root,executable:'/codex',
  openEditing:async options=>{assert.equal(options.projectDirectory,await fs.realpath(path.join(root,'film.v2')));return {send:async (text,model)=>{sent.push(text);modelsSent.push(model);},cancel:async()=>{},close:async()=>{closed++;}};}});
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
 try{
  await assert.rejects(handler({...event,senderFrame:{}},'send','hello'),/Unrecognized/);
  await assert.rejects(handler(event,'arbitrary','hello'),/Unsupported/);
  await handler(event,'send','hello'); assert.deepEqual(sent,['hello']);
  await handler(event,'send',{text:'chosen model',model:'catalog-model'});
  assert.deepEqual(modelsSent,[undefined,'catalog-model']);
  await assert.rejects(handler(event,'send',{text:'bad model',model:{id:'other'}}),/Invalid model/);
  url='http://127.0.0.1:3/';window.webContents.emit('did-navigate');
  await assert.rejects(handler(event,'send','other'),/Open a project/);
  assert.equal(closed,1);
  await dispose();
  await assert.rejects(handler(event,'send','closed'),/Unrecognized/);
 }finally{await dispose();await fs.rm(root,{recursive:true,force:true});}
});

test('new conversation closes its owner before resetting the host-resolved project', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-reset-ipc-'));
 const project=path.join(root,'film.v2'); await fs.mkdir(project); await fs.writeFile(path.join(project,'timeline.json'),'{}');
 let handler; const order=[];
 const register=installChatIpc({handle:(_name,fn)=>{handler=fn;}});
 const window=new EventEmitter(); window.webContents=Object.assign(new EventEmitter(),{id:78,mainFrame:{},getURL:()=> 'http://127.0.0.1:3/p/film.v2',isDestroyed:()=>false,send:()=>{}});
 const dispose=register(window,{origin:'http://127.0.0.1:3',projectsRoot:root,userData:root,executable:'/codex',
  openEditing:async()=>({close:async()=>order.push('close')}),
  resetEditing:async options=>{assert.equal(options.projectDirectory,await fs.realpath(project));assert.equal(options.userData,root);order.push('reset');},
 });
 try {
  const event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
  await handler(event,'connect');
  await handler(event,'new-conversation','/renderer-cannot-select-a-path');
  assert.deepEqual(order,['close','reset']);
 }finally{await dispose();await fs.rm(root,{recursive:true,force:true});}
});

test('Stop interrupts an in-flight send without waiting for the send queue', {timeout:5000}, async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-chat-stop-'));
 await fs.mkdir(path.join(root,'film')); await fs.writeFile(path.join(root,'film/timeline.json'),'{}');
 let handler,finishSend,started,opened=0,cancelled=0,releaseOpen,opening;
 const openGate=new Promise(resolve=>{releaseOpen=resolve;});
 const connecting=new Promise(resolve=>{opening=resolve;});
 const sending=new Promise(resolve=>{started=resolve;});
 const register=installChatIpc({handle:(_name,fn)=>{handler=fn;}});
 const window=new EventEmitter();window.webContents=Object.assign(new EventEmitter(),{id:91,mainFrame:{},getURL:()=> 'http://127.0.0.1:3/p/film',isDestroyed:()=>false,send:()=>{}});
 const dispose=register(window,{origin:'http://127.0.0.1:3',projectsRoot:root,userData:root,executable:'/codex',
  openEditing:async()=>{opened++;opening();await openGate;return {
   send:()=>new Promise(resolve=>{finishSend=resolve;started();}),
   cancel:async()=>{cancelled++;finishSend();},close:async()=>{},
  };},
 });
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
 let timer;
 try {
  await handler(event,'cancel');assert.equal(opened,0);
  const pending=handler(event,'send','cancel while connecting');
  await connecting;await handler(event,'cancel');releaseOpen();await pending;
  assert.equal(finishSend,undefined);
  const send=handler(event,'send','fixture request');
  await sending;
  await assert.rejects(handler({...event,senderFrame:{}},'cancel'),/Unrecognized/);
  await Promise.race([handler(event,'cancel'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Stop waited behind Send')),500);})]);
  await send;assert.equal(cancelled,1);assert.equal(opened,1);
 } finally {clearTimeout(timer);releaseOpen();finishSend?.();await dispose();await fs.rm(root,{recursive:true,force:true});}
});

test('window disposal closes active transport before draining a pending send', {timeout:5000}, async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-chat-close-'));
 await fs.mkdir(path.join(root,'film'));await fs.writeFile(path.join(root,'film/timeline.json'),'{}');
 let handler,started,finishSend,closed=0;
 const sending=new Promise(resolve=>{started=resolve;});
 const register=installChatIpc({handle:(_name,fn)=>{handler=fn;}});
 const window=new EventEmitter();window.webContents=Object.assign(new EventEmitter(),{id:92,mainFrame:{},getURL:()=> 'http://127.0.0.1:3/p/film',isDestroyed:()=>false,send:()=>{}});
 const dispose=register(window,{origin:'http://127.0.0.1:3',projectsRoot:root,userData:root,executable:'/codex',
  openEditing:async()=>({send:()=>new Promise(resolve=>{finishSend=resolve;started();}),close:async()=>{closed++;finishSend();}}),
 });
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame};let timer;
 try {
  const send=handler(event,'send','pending acknowledgement');await sending;
  const stopping=dispose();assert.equal(dispose(),stopping);
  await Promise.race([stopping,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Disposal waited behind send')),500);})]);
  await send;assert.equal(closed,1);
  assert.equal(window.webContents.listenerCount('did-navigate'),0);
  await assert.rejects(handler(event,'send','after close'),/Unrecognized/);
 }finally{clearTimeout(timer);finishSend?.();await dispose();await fs.rm(root,{recursive:true,force:true});}
});


test('closed window cleanup never reads a destroyed BrowserWindow or contents id', async () => {
 let handler;
 const register=installChatIpc({handle:(_name,fn)=>{handler=fn;}});
 const window=new EventEmitter();
 const contents=Object.assign(new EventEmitter(),{id:93,isDestroyed:()=>false,getURL:()=> 'http://127.0.0.1:3/p/film'});
 window.webContents=contents;
 const dispose=register(window,{origin:'http://127.0.0.1:3'});
 Object.defineProperty(window,'webContents',{get(){throw Error('Object has been destroyed');}});
 Object.defineProperty(contents,'id',{get(){throw Error('Object has been destroyed');}});
 contents.isDestroyed=()=>true;
 assert.doesNotThrow(()=>window.emit('closed'));
 await dispose();
 assert.equal(contents.listenerCount('did-navigate'),0);
 assert.equal(contents.listenerCount('did-navigate-in-page'),0);
 await assert.rejects(handler({sender:{id:93}},'connect'),/Unrecognized/);
});

test('agent providers: status, per-provider sessions and allowlisted selection', async () => {
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-chat-agents-'));
 await fs.mkdir(path.join(root,'film')); await fs.writeFile(path.join(root,'film/timeline.json'),'{}');
 let handler; const opened=[], closed=[], resets=[];
 const register=installChatIpc({handle:(_name,fn)=>{handler=fn;}});
 const window=new EventEmitter(); window.webContents=Object.assign(new EventEmitter(),{id:91,mainFrame:{},getURL:()=>'http://127.0.0.1:3/p/film',isDestroyed:()=>false,send:()=>{}});
 const dispose=register(window,{origin:'http://127.0.0.1:3',projectsRoot:root,userData:root,
  agents:{codex:undefined,claude:{executable:'/claude',authentication:'signed-out'}},
  openEditing:async options=>{opened.push([options.provider,options.executable]);return {models:async()=>({models:[],selected:''}),send:async()=>{},cancel:async()=>{},close:async()=>{closed.push(options.provider);}};},
  resetEditing:async options=>{resets.push(options.provider);}});
 const event={sender:window.webContents,senderFrame:window.webContents.mainFrame};
 try{
  assert.deepEqual(await handler(event,'status'),{providers:[
   {provider:'codex',label:'Codex',available:false,authentication:'unknown'},
   {provider:'claude',label:'Claude',available:true,authentication:'signed-out'},
   {provider:'local',label:'Local',available:false,authentication:'unknown'}]});
  await assert.rejects(handler(event,'connect',{provider:'codex'}),/Install and sign in to Codex/);
  await assert.rejects(handler(event,'connect',{provider:'gemini'}),/Unsupported editing agent/);
  await handler(event,'connect',{provider:'claude'});
  await handler(event,'send',{text:'hi',provider:'claude'});
  assert.deepEqual(opened,[['claude','/claude']]);
  await handler(event,'new-conversation',{provider:'claude'});
  assert.deepEqual(closed,['claude']);
  assert.deepEqual(resets,['claude']);
 }finally{await dispose();await fs.rm(root,{recursive:true,force:true});}
});
