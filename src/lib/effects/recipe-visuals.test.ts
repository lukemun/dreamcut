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
  for(const input of visual.inputs)assert.ok(Boolean(input.file)!==Boolean(input.words?.length),`${id}: ${input.label} needs exactly one of a picture or words`);
  for(const file of [visual.video,visual.poster,...visual.inputs.flatMap(input=>input.file?[input.file]:[]),...visual.stages.map(stage=>stage.file)])assert.ok(fs.existsSync('public'+file),`${id}: missing ${file}`);
  const root='public'+visual.video.slice(0,visual.video.lastIndexOf('/')+1);
  const manifest=JSON.parse(fs.readFileSync(root+'manifest.json','utf8'));
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
 // Walker's denim shorts: white in the white phase, original denim colour before the scene cut.
 assert.ok(at(1,270,540).every(value=>value>245));
 assert.ok(at(2,270,540).every(value=>value<160));
 assert.ok(Math.abs(at(2,270,540)[2]-at(2,270,540)[0])<40,'colour phase keeps the denim, not the neon behind it');
 // Night sky stays the outgoing scene through the subject-only lead-in, then the destination replaces it.
 const start=at(0,15,30);
 for(const index of [1,2])assert.ok(at(index,15,30).every((value,i)=>Math.abs(value-start[i])<8));
 assert.ok(at(3,15,30).some((value,i)=>Math.abs(value-start[i])>25));
});
test('Mask Glitch poster shows the white subject over the starting scene, not the empty first frame',async()=>{
 const {data,info}=await sharp('public/recipe-previews/mask-glitch/poster.jpg').removeAlpha().raw().toBuffer({resolveWithObject:true});
 const at=(x:number,y:number)=>Array.from(data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3));
 // Walker's torso and legs are a white silhouette; the neon night sky behind is unchanged.
 for(const [x,y] of [[300,500],[300,600],[310,700]])assert.ok(at(x,y).every(value=>value>245),`white subject at ${x},${y}`);
 assert.ok(at(15,30).every(value=>value<30),'starting night scene stays behind the subject');
});
const pixels=async(file:string)=>{const {data,info}=await sharp('public/recipe-previews/'+file).removeAlpha().raw().toBuffer({resolveWithObject:true});return {at:(x:number,y:number)=>Array.from(data.subarray((y*info.width+x)*3,(y*info.width+x)*3+3)),count:(test:(r:number,g:number,b:number)=>boolean)=>{let n=0;for(let i=0;i<data.length;i+=3)if(test(data[i],data[i+1],data[i+2]))n++;return n;}};};
const white=(r:number,g:number,b:number)=>r>240&&g>240&&b>240;
test('Masking Hook stages show a white, a coloured and a head-only cut-out on black, then the shot',async()=>{
 const [w,c,h,s]=await Promise.all(['white','red','head','shot'].map(name=>pixels(`masking-hook/${name}.jpg`)));
 assert.ok(w.count(white)>100000,'full white silhouette');assert.deepEqual(w.at(20,20),[0,0,0]);
 assert.ok(c.count((r,g,b)=>r>170&&g<90&&b<110)>100000,'colour silhouette');
 assert.ok(h.count(white)>5000&&h.count(white)<w.count(white)/3,'head only is a small part of the silhouette');
 assert.ok(s.count((r,g,b)=>r+g+b<30)<s.count(()=>true)/10,'the real shot follows');
});
test('Clone Flash poster shows a clone arriving in white; the settled frame has none',async()=>{
 const [poster,settled]=await Promise.all([pixels('clone-flash/poster.jpg'),pixels('clone-flash/three.jpg')]);
 assert.ok(poster.count(white)>20000);assert.equal(settled.count(white),0);
});
test('Silhouette Window changes footage inside the person and leaves the sky outside alone',async()=>{
 const stages=await Promise.all(['meadow','ridge','rocks','sky'].map(name=>pixels(`silhouette-window/${name}.jpg`)));
 const sky=stages[0].at(1150,150);
 for(const stage of stages)assert.ok(stage.at(1150,150).every((v,i)=>Math.abs(v-sky[i])<8));
 const inside=stages.map(stage=>stage.at(500,300));
 assert.ok(inside.some(p=>p.some((v,i)=>Math.abs(v-inside[0][i])>60)),'fill footage changes inside the silhouette');
});
test('Lyric Pop word is absent before the beat and gold while it holds',async()=>{
 const gold=(r:number,g:number,b:number)=>r>200&&g>150&&g<200&&b<110;
 const [before,hold]=await Promise.all([pixels('lyric-pop/before.jpg'),pixels('lyric-pop/hold.jpg')]);
 assert.equal(before.count(gold),0);assert.ok(hold.count(gold)>2000);
});
test('Cross into Negative shows colour shot A, then a greyscale negative filling the frame',async()=>{
 const [a,neg]=await Promise.all([pixels('cross-negative/shot-a.jpg'),pixels('cross-negative/negative.jpg')]);
 const tinted=(r:number,_g:number,b:number)=>Math.abs(r-b)>12;
 assert.ok(a.count(tinted)>100000);assert.ok(neg.count(tinted)<2000);
});
test('Speed Entrance & Exit starts on the empty set and settles on a sharp, dark-haired subject',async()=>{
 const [empty,settled]=await Promise.all([pixels('speed-entrance-exit/empty.jpg'),pixels('speed-entrance-exit/settled.jpg')]);
 const dark=(r:number,g:number,b:number)=>r+g+b<150;
 assert.ok(empty.count(dark)<200,'no subject on the empty set');assert.ok(settled.count(dark)>5000,'his hair and face are sharp once he lands');
});
test('Mask Glitch · Glow shows a white silhouette first, then the pose in its own colour',async()=>{
 const [w,c,poster]=await Promise.all([pixels('mask-glitch-glow/white.jpg'),pixels('mask-glitch-glow/colour.jpg'),pixels('mask-glitch-glow/poster.jpg')]);
 assert.ok(w.count(white)>50000);assert.ok(poster.count(white)>50000,'poster is on a glowing white silhouette');
 assert.ok(c.count(white)<w.count(white)/20,'colour returns once the flash ends');
});
test('Moving Grid Matte shows bright studio cells over the dark background',async()=>{
 const poster=await pixels('moving-grid-matte/poster.jpg');
 assert.ok(poster.count((r,g,b)=>r>200&&g>200&&b>190)>10000,'cells of the bright original shot');
 assert.ok(poster.count((r,g,b)=>r<60&&b>r)>300000,'dark teal background outside the cells');
});
test('Talking-Head Background Removal replaces the room with the plain backdrop',async()=>{
 const [before,after]=await Promise.all([pixels('talking-head-cutout/original.jpg'),pixels('talking-head-cutout/removed.jpg')]);
 const pink=(r:number,g:number,b:number)=>r>150&&r-g>35&&b>g;
 assert.ok(before.count(pink)<20000);assert.ok(after.count(pink)>250000);
});
