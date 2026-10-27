import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCanvasKit} from '../gpu-preview/canvaskit-loader';
import {GET} from '../../app/api/preview-runtime/canvaskit/route';

test('installed runtime assets are allowlisted and retain their real content types',async()=>{
 for(const asset of ['../package.json','full','', 'wasm/path'])assert.equal((await GET(new Request(`http://localhost/api?asset=${encodeURIComponent(asset)}`))).status,404);
 const wasm=await GET(new Request('http://localhost/api?asset=wasm'));
 assert.equal(wasm.status,200);assert.equal(wasm.headers.get('content-type'),'application/wasm');
 assert.deepEqual([...new Uint8Array(await wasm.arrayBuffer()).slice(0,4)],[0,97,115,109]);
 const js=await GET(new Request('http://localhost/api?asset=js'));
 assert.equal(js.status,200);assert.equal(js.headers.get('content-type'),'application/javascript');
 assert.match(await js.text(),/CanvasKitInit/);
});

test('concurrent library loads share work and a network failure can retry',async()=>{
 const originals={window:globalThis.window,document:globalThis.document};
 const scripts:any[]=[];const globals:any={};
 Object.assign(globalThis,{window:globals,document:{createElement(){return {removed:false,remove(){this.removed=true;}};},head:{append(script:any){scripts.push(script);}}}});
 try{
  const first=loadCanvasKit(),second=loadCanvasKit();
  assert.equal(first,second);assert.equal(scripts.length,1);
  const failed=assert.rejects(first,/could not load/);scripts[0].onerror();await failed;
  assert.equal(scripts[0].removed,true);
  let initCount=0;const kit={};
  const retried=loadCanvasKit();assert.equal(scripts.length,2);
  globals.CanvasKitInit=async(options:any)=>{initCount++;assert.equal(options.locateFile('canvaskit.wasm'),'/api/preview-runtime/canvaskit?asset=wasm');return kit;};
  scripts[1].onload();assert.equal(await retried,kit);assert.equal(await loadCanvasKit(),kit);assert.equal(initCount,1);
 }finally{Object.assign(globalThis,originals);}
});
