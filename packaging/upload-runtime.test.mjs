import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { publishRuntime } from './upload-runtime.mjs';

test('public feed rebases all platforms and shared archives; missing retained archive blocks publication', async () => {
  const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-upload-test-'));
  try {
    const bytes = Buffer.from('synthetic runtime');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const entry = file => ({file, bytes: bytes.length, sha256, folder: 'runtime', url: `https://github.com/private/${file}`});
    const local = {version:'0.2.0', platforms:{'darwin-arm64':{app:entry('mac.tar.gz'),base:entry('base.tar.gz'),media_source:entry('src.tar.gz')}}};
    const prior = {version:'0.2.0', platforms:{'win32-x64':{app:entry('win.tar.gz'),base:entry('base.tar.gz')}}};
    await fs.writeFile(path.join(dist, 'latest.json'), JSON.stringify(local));
    for (const name of ['mac.tar.gz','base.tar.gz','src.tar.gz']) await fs.writeFile(path.join(dist, name), bytes);
    let missing = false;
    const writes = [];
    const store = {
      head: async key => missing && key.endsWith('win.tar.gz') ? null : {size:bytes.length,url:`https://blob.test/${key}`},
      read: async key => key.endsWith('latest.json') ? JSON.stringify(prior) : sha256,
      put: async (key, body) => { writes.push([key, body]);return {url:`https://blob.test/${key}`}; },
    };
    await publishRuntime({dist,prefix:'runtime',store,publicBaseUrl:'https://dreamcut.io/downloads/runtime',log:()=>{}});
    const published=JSON.parse(writes.at(-1)[1]);
    assert.equal(writes.at(-1)[0], 'runtime/latest.json');
    for(const platform of Object.values(published.platforms)) for(const layer of ['app','base'])
      assert.equal(platform[layer].url, `https://dreamcut.io/downloads/runtime/${platform[layer].file}`);
    assert.equal(published.platforms['darwin-arm64'].media_source.url, 'https://dreamcut.io/downloads/runtime/src.tar.gz');
    await publishRuntime({dist,prefix:'other',store,log:()=>{}});
    const custom=JSON.parse(writes.at(-1)[1]);
    assert.equal(custom.platforms['darwin-arm64'].app.url,'https://blob.test/other/mac.tar.gz');
    writes.length=0;missing=true;
    await assert.rejects(publishRuntime({dist,prefix:'runtime',store,publicBaseUrl:'https://dreamcut.io/downloads/runtime',log:()=>{}}), /not in place/);
    assert.equal(writes.length,0);
    missing=false;
    await fs.writeFile(path.join(dist,'mac.tar.gz'),'corrupt');
    await assert.rejects(publishRuntime({dist,prefix:'runtime',store,publicBaseUrl:'https://dreamcut.io/downloads/runtime',log:()=>{}}), /does not match/);
    assert.equal(writes.length,0);
  } finally { await fs.rm(dist,{recursive:true,force:true}); }
});
