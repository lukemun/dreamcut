import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {recipeVisuals,recipeVisualFor} from './recipe-visuals';

test('curated visual recipes include a result, supplied and prepared inputs, ordered frames and intact owned or licensed media',()=>{
 for(const [id,visual] of Object.entries(recipeVisuals)){
  assert.ok(visual.summary);assert.ok(visual.note);assert.ok(visual.credit);
  assert.ok(visual.inputs.some(input=>input.role==='supply'));assert.ok(visual.inputs.some(input=>input.role==='prepared'));
  assert.ok(visual.stages.length>=3&&visual.stages.length<=4);
  for(const input of visual.inputs)assert.equal([input.file,input.video,input.words?.length].filter(Boolean).length,1,`${id}: ${input.label} needs exactly one of a picture, a clip or words`);
  for(const file of [visual.video,visual.poster,...visual.inputs.flatMap(input=>[input.file,input.video].filter((f):f is string=>Boolean(f))),...visual.stages.map(stage=>stage.file)])assert.ok(fs.existsSync('public'+file),`${id}: missing ${file}`);
  const root='public'+visual.video.slice(0,visual.video.lastIndexOf('/')+1);
  const manifest=JSON.parse(fs.readFileSync(root+'manifest.json','utf8'));
  if(id.startsWith('LOOK-'))assert.deepEqual(visual.stages.map(stage=>stage.label),manifest.stages.map((stage:{label:string})=>stage.label),`${id}: card labels must match the rendered examples`);
  assert.ok(['owned','pexels-license'].includes(manifest.rights),`${id}: media must be owned or Pexels-licensed`);
  if(manifest.rights!=='owned')assert.match(manifest.credit,/Pexels/);
  for(const output of manifest.outputs)assert.equal(createHash('sha256').update(fs.readFileSync(root+output.file)).digest('hex'),output.sha256);
  for(const source of manifest.sources)assert.equal(createHash('sha256').update(fs.readFileSync('public'+source.file)).digest('hex'),source.sha256);
 }
 assert.equal(recipeVisualFor({id:'FX-MASK-GLITCH',origin:'user'}),undefined);
});
test('Mask Glitch visibly isolates white and colour subject before the background changes',async()=>{
 const root='public/recipe-previews/mask-glitch/';
 const images=await Promise.all(['start','white','colour','destination'].map(async name=>(await sharp(root+name+'.jpg').removeAlpha().raw().toBuffer({resolveWithObject:true}))));
 const at=(index:number,x:number,y:number)=>{const {data,info}=images[index];return Array.from(data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3));};
 // The incoming bobblehead's hair: white in the white phase, its own dark colour before the scene cut.
 assert.ok(at(1,540,320).every(value=>value>245));
 assert.ok(at(2,540,320).every(value=>value<80),'colour phase shows the dark hair, not the library behind it');
 // The library stays the outgoing scene through the subject-only lead-in, then the destination replaces it.
 const start=at(0,100,100);
 for(const index of [1,2])assert.ok(at(index,100,100).every((value,i)=>Math.abs(value-start[i])<8));
 assert.ok(at(3,100,100).some((value,i)=>Math.abs(value-start[i])>25));
});
test('Mask Glitch poster shows the white subject over the starting scene, not the empty first frame',async()=>{
 const {data,info}=await sharp('public/recipe-previews/mask-glitch/poster.jpg').removeAlpha().raw().toBuffer({resolveWithObject:true});
 const at=(x:number,y:number)=>Array.from(data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3));
 // The incoming bobblehead's head is a white silhouette; the bright library behind is unchanged.
 for(const [x,y] of [[540,300],[560,300]])assert.ok(at(x,y).every(value=>value>245),`white subject at ${x},${y}`);
 assert.ok(Math.abs(at(100,100)[0]-236)<12&&Math.abs(at(100,100)[2]-146)<12,'starting library stays behind the subject');
});
const pixels=async(file:string)=>{const {data,info}=await sharp('public/recipe-previews/'+file).removeAlpha().raw().toBuffer({resolveWithObject:true});return {at:(x:number,y:number)=>Array.from(data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3)),count:(test:(r:number,g:number,b:number)=>boolean)=>{let n=0;for(let i=0;i<data.length;i+=3)if(test(data[i],data[i+1],data[i+2]))n++;return n;}};};
const white=(r:number,g:number,b:number)=>r>240&&g>240&&b>240;
test('Clone Flash poster shows a clone arriving in white; the settled frame has none',async()=>{
 const [poster,settled]=await Promise.all([pixels('clone-flash/poster.jpg'),pixels('clone-flash/three.jpg')]);
 assert.ok(poster.count(white)>20000);assert.equal(settled.count(white),0);
});
test('Silhouette Window changes footage inside the subject and leaves the studio outside alone',async()=>{
 const stages=await Promise.all(['first','next','third','follows'].map(name=>pixels(`silhouette-window/${name}.jpg`)));
 const sky=stages[0].at(1150,150);
 for(const stage of stages)assert.ok(stage.at(1150,150).every((v,i)=>Math.abs(v-sky[i])<8));
 const inside=stages.map(stage=>stage.at(500,300));
 assert.ok(inside.some(p=>p.some((v,i)=>Math.abs(v-inside[0][i])>60)),'fill footage changes inside the silhouette');
});
test('Cross into Negative shows colour shot A, then a greyscale negative filling the frame',async()=>{
 const [a,neg]=await Promise.all([pixels('cross-negative/shot-a.jpg'),pixels('cross-negative/negative.jpg')]);
 const tinted=(r:number,_g:number,b:number)=>Math.abs(r-b)>12;
 assert.ok(a.count(tinted)>100000);assert.ok(neg.count(tinted)<2000);
});
test('Speed Entrance & Exit starts on the empty set and settles on a sharp subject',async()=>{
 const [empty,settled]=await Promise.all([pixels('speed-entrance-exit/empty.jpg'),pixels('speed-entrance-exit/settled.jpg')]);
 const skin=(r:number,g:number,b:number)=>r>215&&g>160&&g<215&&b>130&&b<200&&r-b>40;
 assert.ok(empty.count(skin)<1000,'no subject on the empty set');assert.ok(settled.count(skin)>8000,'the bobblehead\'s face is sharp once it lands');
});
test('Mask Glitch · Glow shows a white silhouette first, then the pose in its own colour',async()=>{
 const [w,c,poster]=await Promise.all([pixels('mask-glitch-glow/white.jpg'),pixels('mask-glitch-glow/colour.jpg'),pixels('mask-glitch-glow/poster.jpg')]);
 assert.ok(w.count(white)>50000);
 // The poster is the pose in its own colour inside the fading glow, so a still card reads as the effect.
 assert.ok(poster.count((r,g,b)=>r>150&&g>140&&b>130)>5000,'a light glow around the subject');
 assert.ok(poster.count(white)<w.count(white)/20,'the subject, not a white silhouette');
 assert.ok(c.count(white)<w.count(white)/20,'colour returns once the flash ends');
});
test('Moving Grid Matte shows pale studio cells over the dark background',async()=>{
 const poster=await pixels('moving-grid-matte/poster.jpg');
 assert.ok(poster.count((r,g,b)=>r>170&&g>165&&b>165)>10000,'cells of the pale grey original shot');
 assert.ok(poster.count((r,g,b)=>r<60&&b>r)>300000,'dark teal background outside the cells');
});
test('Background Removal replaces the studio with the plain backdrop',async()=>{
 const [before,after]=await Promise.all([pixels('talking-head-cutout/original.jpg'),pixels('talking-head-cutout/removed.jpg')]);
 const yellow=(r:number,g:number,b:number)=>r>200&&g>160&&b<120;
 assert.ok(before.count(yellow)<20000);assert.ok(after.count(yellow)>250000);
});
test('Paper cutout starts on the plain shot, then outlines the hiker in white and later in red',async()=>{
 const [original,outlined,colour]=await Promise.all(['original','white','colour'].map(name=>pixels(`paper-cutout/${name}.jpg`)));
 const red=(r:number,g:number,b:number)=>r>180&&g<80&&b<80;
 assert.ok(outlined.count(white)>original.count(white)+5000,'a white paper outline appears');
 assert.ok(original.count(red)<200&&colour.count(red)>5000,'the outline can be recoloured');
});
