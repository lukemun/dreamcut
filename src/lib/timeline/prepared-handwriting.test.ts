import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HANDWRITING_PACKS } from './handwriting-packs-sync';
import { PREPARED_HANDWRITING_FONTS, PREPARED_HANDWRITING_CHARACTERS, handwritingPackStatus } from './handwriting-status';
import { SHARED_FONT_LIBRARY } from '../fonts/registry';
import { layoutPreparedHandwriting, HANDWRITING_PEN_LIFT } from './prepared-handwriting';
import { PreparedHandwritingText } from '../remotion/PreparedHandwritingText';
import { HandwritingText } from '../remotion/HandwritingText';
import { measurePreparedHandwriting } from '../qc/measure-handwriting';

test('every editor handwriting font has an explicit saved pack or reference route',()=>{
 assert.deepEqual(SHARED_FONT_LIBRARY.filter(f=>f.category==='Handwriting').map(f=>f.id).sort(),['permanent_marker',...Object.keys(HANDWRITING_PACKS)].sort());
 assert.deepEqual(Object.keys(PREPARED_HANDWRITING_FONTS).sort(),Object.keys(HANDWRITING_PACKS).sort());
 assert.equal(handwritingPackStatus('clean_sans','A').kind,'fallback');
 assert.equal(handwritingPackStatus('comic_neue','é').unsupported[0],'é');
 assert.equal(handwritingPackStatus('permanent_marker','é').unsupported[0],'é');
});
test('the native Handwriting renderer automatically selects each saved font pack',()=>{
 const props={text:'Bi',progress:.5,fontSize:120,maxWidth:640,singleLine:true,align:'center' as const,color:'black'};
 for(const fontPreset of Object.keys(HANDWRITING_PACKS)){
  const svg=renderToStaticMarkup(React.createElement(HandwritingText,{...props,fontPreset}));
  assert.ok(svg.includes(`data-handwriting="${fontPreset}"`),fontPreset);
  assert.match(svg,/data-handwriting-review="needs-review"/);
 }
 const fallback=renderToStaticMarkup(React.createElement(HandwritingText,{...props,fontPreset:'clean_sans'}));
 assert.match(fallback,/data-handwriting="stroke-paths"/);
});
for(const [fontId,pack] of Object.entries(HANDWRITING_PACKS)) {
 test(`${fontId}: exact case, licensed source and complete repertoire`,()=>{
  const config=PREPARED_HANDWRITING_FONTS[fontId as keyof typeof PREPARED_HANDWRITING_FONTS];
  const dir=path.resolve('src/lib/timeline/handwriting/fonts',config.slug);
  const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
  assert.equal(manifest.instance_sha256,createHash('sha256').update(fs.readFileSync(path.join(dir,'source.ttf'))).digest('hex'));
  assert.match(fs.readFileSync(path.join(dir,'LICENSE'),'utf8'),manifest.license==='Apache-2.0'?/Apache License/:/SIL OPEN FONT LICENSE/);
  assert.notEqual(pack.outlines.a.d,pack.outlines.A.d,'lowercase is not uppercase anatomy');
  for(const c of PREPARED_HANDWRITING_CHARACTERS) {
   assert.ok(pack.outlines[c].d,c);assert.ok(pack.strokes[c].length,c);
   assert.equal(pack.sweeps[c].length,pack.strokes[c].length,c);
   assert.ok(pack.sweeps[c].every(bands=>bands.length===64),c);
   const g=layoutPreparedHandwriting(pack,c).glyphs[0];
   assert.ok(g.strokes.every(s=>Number.isFinite(s.length)&&s.length>0),c);
   for(let i=1;i<g.strokes.length;i++)assert.ok(g.strokes[i].start>=g.strokes[i-1].start+g.strokes[i-1].length+HANDWRITING_PEN_LIFT-1e-7,c);
  }
 });
 test(`${fontId}: source advances, kerning and line resets survive`,()=>{
  const p=layoutPreparedHandwriting(pack,'AV A\nVA');
  assert.ok(Math.abs(p.glyphs[1].x-p.glyphs[0].x-pack.outlines.A.advance-(pack.metrics.kerning.AV??0))<1e-7);
  assert.ok(Math.abs(p.glyphs[2].x-p.glyphs[1].x-pack.outlines.V.advance-(pack.metrics.kerning['V ']??0)-pack.metrics.spaceAdvance-(pack.metrics.kerning[' A']??0))<1e-7);
  assert.equal(p.glyphs[3].x,pack.metrics.paddingLeft);
  assert.equal(p.glyphs[3].y,pack.metrics.lineHeight);
  assert.ok(p.glyphs.every((g,i)=>i===0||g.start>=p.glyphs[i-1].end));
 });
 test(`${fontId}: review evidence covers every glyph and identifies the current assets`,()=>{
  const config=PREPARED_HANDWRITING_FONTS[fontId as keyof typeof PREPARED_HANDWRITING_FONTS];
  const dir=path.resolve('src/lib/timeline/handwriting/fonts',config.slug);
  const audit=JSON.parse(fs.readFileSync(path.join(dir,'audit/coverage.json'),'utf8'));
  const review=JSON.parse(fs.readFileSync(path.join(dir,'review.json'),'utf8'));
  const checklist=JSON.parse(fs.readFileSync(path.join(dir,'checklist.json'),'utf8'));
  assert.deepEqual(audit.characters.map((r:{character:string})=>r.character).sort(),[...PREPARED_HANDWRITING_CHARACTERS].sort());
  assert.equal(checklist.length,85);
  for(const key of ['outlines','strokes','widths','sweeps','metrics'] as const){
   const hash=createHash('sha256').update(JSON.stringify(pack[key])).digest('hex');
   assert.equal(audit.pack_hashes[key],hash,`${key} changed: regenerate pixel evidence`);
   assert.equal(review.audit_pack_hashes[key],hash,`${key} changed: invalidate the prior review`);
  }
  for(const [file,hash] of Object.entries(review.asset_hashes)){
   assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex'),hash,file);
  }
  for(const [file,hash] of Object.entries(review.audit_hashes)){
   assert.equal(createHash('sha256').update(fs.readFileSync(path.join(dir,file))).digest('hex'),hash,file);
  }
  for(const row of audit.characters){
   assert.ok(Number.isFinite(row.coverage_percent)&&row.coverage_percent>0,row.character);
   assert.ok(row.samples.some((s:{progress:string})=>s.progress==='0.1'),row.character);
   assert.ok(row.samples.some((s:{progress:string})=>s.progress==='0.75'),row.character);
   assert.ok(fs.existsSync(path.join(dir,'audit',row.page)),row.character);
  }
  assert.equal(review.status,'needs_review');
  assert.equal(review.human_acceptance,null,'sampled coverage cannot manufacture human acceptance');
  assert.ok(checklist.every((c:{continuous_motion:string;human_acceptance:string})=>c.continuous_motion==='pending'&&c.human_acceptance==='pending'));
 });
 test(`${fontId}: B descends before bowls; lowercase i dots before the separate stem`,()=>{
  const b=pack.strokes.B;assert.equal(b.length,2);
  assert.ok(b[0].at(-1)![1]>b[0][0][1]+30,'B starts with descending stem');
  const i=pack.strokes.i;assert.equal(i.length,2);
  assert.ok(Math.max(...i[0].map(p=>p[1]))<Math.min(...i[1].map(p=>p[1])),'dot first, then stem');
  assert.ok(i[1].at(-1)![1]>i[1][0][1],'descending i stem');
 });
 test(`${fontId}: completion stays contour masked and measurement matches production SVG`,async()=>{
  const props={fontPreset:fontId,text:'B i AV',singleLine:true,fontSizePx:120,maxWidth:.8,fontSizing:'fixed',animationIn:'handwriting'};
  const measured=(await measurePreparedHandwriting(props,800))!;
  const svg=renderToStaticMarkup(React.createElement(PreparedHandwritingText,{fontPreset:fontId,text:props.text,progress:1,fontSize:120,maxWidth:640,singleLine:true,align:'center',color:'black'}));
  assert.match(svg,/<g mask="url\(#/);assert.ok(!svg.includes('strokeDashoffset'),'owned timing regions replace broad nib');
  const height=Number(svg.match(/height="([\d.]+)"/)![1]);assert.ok(Math.abs(height-measured.height)<1e-7);
  const empty=renderToStaticMarkup(React.createElement(PreparedHandwritingText,{fontPreset:fontId,text:'B',progress:0,fontSize:120,maxWidth:640,singleLine:true,align:'center',color:'black'}));
  assert.ok(!empty.includes('fill="white"'),'nothing visible before contact');
  assert.equal(layoutPreparedHandwriting(pack,'é🦉').glyphs[0].strokes.length,0);
 });
}
