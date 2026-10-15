import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedPreviewRenderer,previewRendererChange,previewFallbackMessage} from '../preview-renderer-selection';
test('legacy GPU selection preserves export engine and restores prior preparation on return',()=>{
 assert.equal(selectedPreviewRenderer('rust','gpu'),'gpu');
 assert.deepEqual(previewRendererChange('gpu','rust','rolling'),{engine:'rust',preparation:'gpu'});
 assert.deepEqual(previewRendererChange('standard','rust','gpu','rolling'),{engine:'standard',preparation:'rolling'});
 assert.deepEqual(previewRendererChange('rust','standard','gpu'),{engine:'rust',preparation:'prepared'});
 assert.deepEqual(previewRendererChange('rust','standard','live'),{engine:'rust',preparation:'live'});
});
test('fallback names the requested renderer and actual Standard display',()=>{
 assert.match(previewFallbackMessage('gpu','Unsupported effect')!,/GPU preview unavailable.*Displaying with Standard.*Unsupported effect/);
 assert.equal(previewFallbackMessage('gpu',null),null);
});

test('graphics loss offers an actionable retry without exposing backend implementation names',()=>{
 for(const reason of ['CanvasKit GPU context lost','GPU preview stopped: device lost']){
  const message=previewFallbackMessage('gpu',reason)!;
  assert.match(message,/Displaying with Standard/);
  assert.match(message,/graphics connection was interrupted/);
  assert.match(message,/choose Standard, then Graphics card to try again/);
  assert.doesNotMatch(message,/CanvasKit|device lost/);
 }
 assert.match(previewFallbackMessage('gpu','Unsupported effect')!,/Unsupported effect$/);
});
