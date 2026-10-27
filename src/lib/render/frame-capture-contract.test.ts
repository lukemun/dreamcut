import assert from 'node:assert/strict';
import test from 'node:test';
import { frameCaptureSchema } from './frame-capture-contract';
import { assertEditorOrigin, editorRequestOrigin } from './capture-origin';
const input = {width:640,height:360,fps:30,durationInFrames:3600,inputProps:{elements:[]}};
test('captures absolute frames beyond the prepared playback limit and rejects out-of-range frames',()=>{
  assert.equal(frameCaptureSchema.parse({frame:3599,input}).frame,3599);
  for(const frame of [-1,0.5,3600,Infinity]) assert.equal(frameCaptureSchema.safeParse({frame,input}).success,false);
});
test('rejects unbounded raster dimensions and ignores alternate render entry points',()=>{
  assert.equal(frameCaptureSchema.safeParse({frame:0,input:{...input,width:99999}}).success,false);
  const parsed=frameCaptureSchema.parse({frame:0,input:{...input,fixtureId:'injected',nativeProjectId:'other'}});
  assert.equal('fixtureId' in parsed.input,false);
  assert.equal('nativeProjectId' in parsed.input,false);
});
test('capture stays local and rejects cross-origin requests',()=>{
  assert.equal(assertEditorOrigin(new Request('http://127.0.0.1:3123/api',{headers:{origin:'http://127.0.0.1:3123'}})),'http://127.0.0.1:3123');
  assert.throws(()=>assertEditorOrigin(new Request('http://127.0.0.1:3123/api',{headers:{origin:'https://example.com'}})),/Cross-origin/);
  assert.throws(()=>assertEditorOrigin(new Request('https://example.com/api')),/local editor/);
});

test('exports render from the port the editor actually listens on, not Next\'s reconstructed default', () => {
  // The desktop service starts Next without a port, so request.url says :3000 while Host has the real port.
  assert.equal(editorRequestOrigin(new Request('http://localhost:3000/api/projects/p/render',{headers:{host:'127.0.0.1:59109'}})),'http://127.0.0.1:59109');
  assert.equal(editorRequestOrigin(new Request('http://127.0.0.1:3123/api/projects/p/render')),'http://127.0.0.1:3123');
  assert.throws(()=>editorRequestOrigin(new Request('http://localhost:3000/api',{headers:{host:'evil.example'}})),/local editor/);
});
