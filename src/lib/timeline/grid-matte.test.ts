import test from 'node:test';
import assert from 'node:assert/strict';
import {gridMatteCells,gridMatteFrameUrl,gridMatteMaskSchema,normalizeGridMatte} from './grid-matte';
test('grid coverage averages only the keep mask, preserves fractional edges, and fills zero at zero coverage',()=>{
 const pixels=new Uint8ClampedArray([255,0,0,255,0,0,0,255,128,0,0,255,128,0,0,255]);
 assert.deepEqual(gridMatteCells(pixels,2,2,1,2,1),[.5,128/255]);
 assert.deepEqual(gridMatteCells(pixels,2,2,1,2,2),[1,1]);
 assert.deepEqual(gridMatteCells(pixels,2,2,1,2,0),[0,0]);
});
test('mask follows source trims and rate through explicit source seconds and rejects missing handles',()=>{
 const mask=gridMatteMaskSchema.parse({source_url:'/api/projects/demo/media/masks',source_start_seconds:2,fps:30,frame_count:120,width:540,height:960,source_sha256:'a'.repeat(64)});
 assert.match(gridMatteFrameUrl(mask,2),/00000.png$/);
 assert.match(gridMatteFrameUrl(mask,3),/00030.png$/);
 assert.match(gridMatteFrameUrl(mask,5.99),/00119.png$/);
 assert.throws(()=>gridMatteFrameUrl(mask,1.9));assert.throws(()=>gridMatteFrameUrl(mask,6.1));
 assert.throws(()=>gridMatteMaskSchema.parse({...mask,fps:0}));
});

test("tiny cells cannot create an unbounded live grid while zero remains identity",()=>{
 assert.equal(normalizeGridMatte("grid_matte_cell_size",1),24);
 assert.equal(normalizeGridMatte("grid_matte_cell_size",0),0);
 assert.equal(normalizeGridMatte("grid_matte_cell_size",90),90);
});
