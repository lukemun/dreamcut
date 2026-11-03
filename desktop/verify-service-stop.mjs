import { app, utilityProcess } from 'electron';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { stopDesktopService } from './service-shutdown.mjs';

void app.whenReady().then(async () => {
  const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-forced-stop-'));
  let service,exitCode=1;
  try {
    const file=path.join(scratch,'unresponsive.cjs');
    await fs.writeFile(file,'setInterval(()=>{},1000);');
    service=utilityProcess.fork(file,[],{stdio:'ignore'});
    let exited=false;service.once('exit',()=>{exited=true;});
    await once(service,'spawn');
    assert.ok(service.pid);
    const result=await stopDesktopService(service,{timeoutMs:20,forceTimeoutMs:3000});
    assert.equal(result,'forced');assert.equal(exited,true);
    assert.equal(await stopDesktopService(service),'already-stopped');
    console.log('Electron forced service shutdown waits for its observed exit');
    exitCode=0;
  } catch(error) {console.error(error.message);}
  finally {
    if(service?.pid) service.kill();
    await fs.rm(scratch,{recursive:true,force:true});app.exit(exitCode);
  }
});
