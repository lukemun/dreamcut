import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeAlphaRgbaFrame, intersectRasterizedAlpha, rasterizeAlphaFootprint, type AlphaFootprintArtifact } from './alpha-footprint';
import { projectSourceToComposition } from '../timeline/source-projection';

function rgba(width:number,height:number,points:Array<[number,number]>) {
  const bytes=Buffer.alloc(width*height*4);
  for(const [x,y] of points) bytes[(y*width+x)*4+3]=255;
  return bytes;
}
function artifact(points:Array<[number,number]>):AlphaFootprintArtifact {
  return {schema_version:1,recipe_version:'binary-alpha-footprint-v1',source_fingerprint_sha256:'a'.repeat(64),width:4,height:4,
    alpha_threshold:1,frame_rate:null,duration_seconds:null,frames:[analyzeAlphaRgbaFrame(rgba(4,4,points),4,4,0)]};
}

test('decoded alpha records exact source rows, bounds and centroid',()=>{
  const frame=analyzeAlphaRgbaFrame(rgba(4,3,[[1,0],[2,0],[0,2]]),4,3,0);
  assert.deepEqual(frame.rows,[[1,3],[],[0,1]]);
  assert.deepEqual(frame.bounds,{x:0,y:0,width:3,height:3});
  assert.deepEqual(frame.centroid,{x:1.5,y:1.166667});
  assert.equal(frame.occupied_pixels,3);
});

test('composition raster includes deterministic ordered sticker support and pixel contact',()=>{
  const projection=projectSourceToComposition({source_width:4,source_height:4,composition_width:40,composition_height:40,fit:'contain',
    timeline_time_seconds:0,timeline_start_seconds:0});
  const base={evidence:{revision_id:'r',artifact:artifact([[1,1]])},projection,canvas:{width:40,height:40},source_time_seconds:0};
  const subject=rasterizeAlphaFootprint(base);
  const outlined=rasterizeAlphaFootprint({...base,sticker_outline_width:1,media_scale:1});
  assert.equal(subject.occupied_pixels,100);
  assert.ok(outlined.occupied_pixels>subject.occupied_pixels);
  const contact=intersectRasterizedAlpha(subject,outlined);
  assert.equal(contact.subject_pixels,100);
  assert.equal(contact.border_involved_pixels,0);
});
