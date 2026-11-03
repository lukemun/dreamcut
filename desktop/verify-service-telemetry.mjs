import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import { gunzipSync, inflateSync } from 'node:zlib';

// Run in a disposable packaged service directory; compiled hooks own SDK loading.
const bodies = [];
let received;
const delivered = new Promise(resolve => { received = resolve; });
const server = createServer((request, response) => {
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    let bytes = Buffer.concat(chunks);
    if(request.headers['content-encoding']==='gzip') bytes=gunzipSync(bytes);
    if(request.headers['content-encoding']==='deflate') bytes=inflateSync(bytes);
    const text=bytes.toString('utf8');
    bodies.push(text); response.end('{}');
    if(text.includes('DreamCut desktop service error')) received();
  });
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
let timer;
try {
  process.env.DREAMCUT_SERVICE_ROOT=process.cwd();
  process.env.NEXT_RUNTIME='nodejs';
  process.env.SENTRY_ENABLED='1';
  process.env.SENTRY_DSN=`http://public@127.0.0.1:${server.address().port}/1`;
  const hooks=createRequire(import.meta.url)(path.join(process.cwd(),'.next-desktop/server/instrumentation.js'));
  await hooks.register();
  const sentinel='SYNTHETIC_CREATOR_TEXT_NEVER_TRANSMIT';
  hooks.onRequestError(new Error(sentinel),{path:`/p/${sentinel}`,method:'GET',headers:{authorization:sentinel}},
    {routerKind:'App Router',routePath:`/p/${sentinel}`,routeType:'route'});
  await Promise.race([delivered,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Compiled request hook delivered no error')),5000);})]);
  const output=bodies.join('\n');
  for(const privateValue of [sentinel,os.homedir(),os.hostname()]) assert.equal(output.includes(privateValue),false);
  const events=bodies.flatMap(body=>body.split('\n').flatMap(line=>{try{const value=JSON.parse(line);return value.message?[value]:[];}catch{return [];}}));
  assert.equal(events.length,1);
  assert.equal(events[0].message,'DreamCut desktop service error');
  assert.deepEqual(events[0].tags,{component:'desktop-service'});
  console.log('Compiled service request hook delivered one reconstructed error to local collector');
} finally {
  clearTimeout(timer);
  server.closeAllConnections();
  await new Promise(resolve=>server.close(resolve));
}
