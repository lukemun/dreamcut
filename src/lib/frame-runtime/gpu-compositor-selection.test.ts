import test from 'node:test';
import assert from 'node:assert/strict';
import {gpuCompositorEngine} from '../gpu-preview/compositor-engine';
test('Browser GPU defaults to CanvasKit without changing the renderer preference',()=>{
 assert.equal(gpuCompositorEngine(),'canvaskit');
 assert.equal(gpuCompositorEngine(''),'canvaskit');
 assert.equal(gpuCompositorEngine('canvaskit'),'canvaskit');
});
test('the legacy custom compositor requires an explicit development override',()=>{
 assert.equal(gpuCompositorEngine('webgpu'),'webgpu');
 assert.equal(gpuCompositorEngine('unknown'),'canvaskit');
});
