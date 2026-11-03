import test from "node:test";
import assert from "node:assert/strict";

test('preparation and import queues deduplicate burst startup before child lock creation', async () => {
  const fs = await import('node:fs/promises');
  const os = await import('node:os'); const path = await import('node:path');
  const { EventEmitter } = await import('node:events');
  const { startPreparationWorker } = await import('./media-preparation');
  const { startImportWorker } = await import('./media-import-jobs');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-worker-burst-'));
  const ownerKey=Symbol.for('dreamcut.desktop.worker-owner');
  const host=process as NodeJS.Process & {[key:symbol]:unknown};const oldOwner=host[ownerKey];
  const keys=['TIMELINE_PROJECTS_DIR','MEDIA_PREPARATION_AUTOSTART','DREAMCUT_IMPORT_AUTOSTART'] as const;
  const previous=new Map(keys.map(key=>[key,process.env[key]]));
  const children: InstanceType<typeof EventEmitter>[]=[];
  try {
    process.env.TIMELINE_PROJECTS_DIR=root;process.env.MEDIA_PREPARATION_AUTOSTART='1';process.env.DREAMCUT_IMPORT_AUTOSTART='1';
    host[ownerKey]={spawn(){const child=Object.assign(new EventEmitter(),{unref(){}});children.push(child);return child;}};
    for(let i=0;i<100;i++) {
      startPreparationWorker('film');startImportWorker('film');
      startPreparationWorker('other');startImportWorker('other');
    }
    assert.equal(children.length,4,'one live launcher per project and queue kind');
    children[0].emit('exit',0);startPreparationWorker('film');assert.equal(children.length,5);
    // Identical folder IDs in another configured workspace remain independent.
    process.env.TIMELINE_PROJECTS_DIR=path.join(root,'another-workspace');
    startPreparationWorker('film');assert.equal(children.length,6);
  }finally{
    for(const child of children)child.emit('exit',0);
    if(oldOwner===undefined)delete host[ownerKey];else host[ownerKey]=oldOwner;
    for(const key of keys){const value=previous.get(key);if(value===undefined)delete process.env[key];else process.env[key]=value;}
    await fs.rm(root,{recursive:true,force:true});
  }
});

test('failed queue startup releases its reservation for a later explicit retry', async () => {
 const { EventEmitter } = await import('node:events');
 const { startBackgroundWorkerOnce } = await import('./background-worker');
 const key=`fixture-startup-${process.pid}`;
 assert.throws(()=>startBackgroundWorkerOnce(key,()=>{throw Error('spawn refused');}),/spawn refused/);
 const child=new EventEmitter() as unknown as import('node:child_process').ChildProcess;
 child.on('error',()=>{});
 assert.equal(startBackgroundWorkerOnce(key,()=>child),child);
 child.emit('error',Error('spawn failed'));
 const retry=new EventEmitter() as unknown as import('node:child_process').ChildProcess;
 assert.equal(startBackgroundWorkerOnce(key,()=>retry),retry);
 // A late event from the previous child must not release its replacement.
 child.emit('exit',1);
 assert.equal(startBackgroundWorkerOnce(key,()=>{throw Error('duplicate launch');}),retry);
 retry.emit('exit',0);
});
