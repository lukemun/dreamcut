/** Read-only browser pixel audit of a reusable pack. Never mutates a timeline.
 * tsx scripts/audit-handwriting-pack.tsx <font_id> [--out directory]
 * Saves exact production SVG at each stroke midpoint plus global partial/completion
 * frames. Coverage and intermediate inspection are separate gates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ensureBrowser } from '@remotion/renderer';
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import { HANDWRITING_PACKS, LINE_HANDWRITING_PACKS } from '../src/lib/timeline/handwriting-packs-sync';
import { layoutPreparedHandwriting } from '../src/lib/timeline/prepared-handwriting';
import lineGuides from '../src/lib/timeline/handwriting/experiments/pacifico-line-mask/guides.json';
import { PreparedHandwritingText } from '../src/lib/remotion/PreparedHandwritingText';
async function main(){
const fontId=process.argv[2],pack=(process.argv.includes("--saved-strokes")?HANDWRITING_PACKS:LINE_HANDWRITING_PACKS)[fontId];
if(!pack)throw new Error('Unknown prepared font ID');
const dir=path.resolve(process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:`src/lib/timeline/handwriting/fonts/${fontId.replaceAll('_','-')}/audit`);
fs.mkdirSync(dir,{recursive:true});
const browserStatus=await ensureBrowser({logLevel:'error'});
if(!('path' in browserStatus))throw new Error('Review browser is unavailable; set HANDWRITING_CHROME_PATH');
const browser=await chromium.launch({executablePath:process.env.HANDWRITING_CHROME_PATH??browserStatus.path,headless:true});
const page=await browser.newPage({viewport:{width:1200,height:1000},deviceScaleFactor:1});
const sampleWidth=Number(process.argv.includes('--size')?process.argv[process.argv.indexOf('--size')+1]:120),sampleHeight=Math.round(sampleWidth*4/3);
if(!Number.isFinite(sampleWidth)||sampleWidth<120||sampleWidth>480)throw new Error('Audit size must be 120–480');
const records=[];const chars=process.argv.includes('--characters')?[...process.argv[process.argv.indexOf('--characters')+1]]:Object.keys(pack.outlines);
if(chars.some(c=>!pack.outlines[c]))throw new Error('Audit character is unprepared');
try {
 for(let pageNumber=0;pageNumber<Math.ceil(chars.length/10);pageNumber++){
  const cells=[];
  for(const char of chars.slice(pageNumber*10,pageNumber*10+10)){
   const layout=layoutPreparedHandwriting(pack,char,Infinity,"left",process.argv.includes("--saved-strokes")?"saved_strokes":"line_mask"),g=layout.glyphs[0];
   const checkpoints=[0.1,0.25,0.5,0.75,0.999,1];
   for(const s of g.strokes)checkpoints.push((s.start+s.length*.5)/layout.duration);
   if(process.argv.includes('--steps')) {
     const steps=Number(process.argv[process.argv.indexOf('--steps')+1]);
     if(!Number.isInteger(steps)||steps<2||steps>120)throw new Error('Steps must be 2–120');
     for(let step=0;step<=steps;step++)checkpoints.push(step/steps);
   }
   const progress=[...new Set(checkpoints)].sort((a,b)=>a-b);
   const glyph=pack.outlines[char],m=pack.metrics;
   const original=`<svg style="display:inline-block;vertical-align:middle;overflow:visible" viewBox="0 0 ${layout.width} ${layout.height}" width="${sampleWidth}" height="${sampleHeight}"><g transform="translate(${g.x} ${g.y})"><path d="${glyph.d}" transform="translate(0 ${m.baseline}) scale(1 -1)" fill="black"/></g></svg>`;
   const markup=progress.map(p=>{
    let svg=renderToStaticMarkup(<PreparedHandwritingText revealMode={process.argv.includes("--saved-strokes") ? "saved_strokes" : "line_mask"} fontPreset={fontId} text={char} progress={p} fontSize={120} maxWidth={120} singleLine align="center" color="black"/>);
    // Keep original and production pixels on the same layout scaling for comparison.
    svg=svg.replaceAll('_R_0_', `audit-${char.codePointAt(0)}-${Math.round(p*1e8)}-`);
    svg=svg.replace(/width="[^"]+" height="[^"]+" viewBox=/,`width="${sampleWidth}" height="${sampleHeight}" viewBox=`);
    return `<div class="sample" data-char="${char.codePointAt(0)}" data-progress="${p}"><small>${(p*100).toFixed(1)}%</small><div class="ink">${svg}</div></div>`;
   }).join('');
   cells.push(`<section data-char="${char.codePointAt(0)}"><b>${char.replaceAll('&','&amp;').replaceAll('<','&lt;')} · ${g.strokes.length} gestures</b><div class="samples">${markup}<div class="sample reference" data-char="${char.codePointAt(0)}"><small>source</small><div class="ink">${original}</div></div></div></section>`);
  }
  await page.setContent(`<html><style>body{margin:12px;background:white;color:#142030;font:13px sans-serif}section{margin-bottom:14px;border-bottom:1px solid #eee}b{display:block;height:22px}.samples{display:flex;align-items:flex-start}.sample{width:${sampleWidth}px;flex-shrink:0}.ink{width:${sampleWidth}px;height:${sampleHeight}px}small{display:block;height:20px;color:#526}</style><h2>${fontId} · page ${pageNumber+1} · each gesture midpoint + partial frames</h2>${cells.join('')}</html>`);
  const pageFile=`page-${pageNumber+1}.png`;const pagePixels=await page.screenshot({path:path.join(dir,pageFile),fullPage:true});
  for(const char of chars.slice(pageNumber*10,pageNumber*10+10)){
   const code=String(char.codePointAt(0));
   const crop=async(selector:string)=>{
     const rect=await page.locator(selector).evaluate((el,size)=>{const b=el.getBoundingClientRect();return {left:Math.round(b.x+window.scrollX),top:Math.round(b.y+window.scrollY),width:size.width,height:size.height};},{width:sampleWidth,height:sampleHeight});
     return sharp(pagePixels).extract(rect).png().toBuffer();
   };
   // Compare crops from one rasterization. Locator screenshots scroll the page
   // independently and can change fractional pixel alignment of thin contours.
   const reference=await crop(`.reference[data-char="${code}"] .ink`);
   const final=await crop(`.sample[data-char="${code}"][data-progress="1"] .ink`);
   const a=await sharp(reference).removeAlpha().raw().toBuffer();const b=await sharp(final).removeAlpha().raw().toBuffer();
   let total=0,missing=0,extra=0;
   for(let i=0;i<a.length;i+=3){const original=1-a[i]/255,current=1-b[i]/255;total+=original;missing+=Math.max(0,original-current);extra+=Math.max(0,current-original);}
   const section=await page.locator(`section[data-char="${code}"]`).boundingBox();
   const samples=await page.locator(`section[data-char="${code}"] .sample`).evaluateAll(els=>els.map(el=>({progress:el.getAttribute('data-progress'),x:el.getBoundingClientRect().x+window.scrollX,inkY:el.querySelector('.ink')!.getBoundingClientRect().y+window.scrollY})));
   records.push({section,samples,character:char,codepoint:Number(code),page:pageFile,gestures:pack.lineStrokes?.[char]?.length??pack.strokes[char]?.length??0,coverage_percent:Math.round((1-missing/total)*10000)/100,extra_ink_percent:Math.round(extra/total*10000)/100,intermediate_review:'pending',motion_review:'pending'});
  }
 }
 const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 fs.writeFileSync(path.join(dir,'coverage.json'),JSON.stringify({font_id:fontId,reveal_mode:process.argv.includes("--saved-strokes")?"saved_strokes":"line_mask",line_guides_sha256:pack.lineStrokes?hash(pack.lineStrokes):undefined,method:`Chromium production component SVG; same-page alpha-weighted source comparison at ${sampleWidth}×${sampleHeight}; no unmask-at-completion shortcut`,pack_hashes:{outlines:hash(pack.outlines),strokes:hash(pack.strokes),widths:hash(pack.widths),sweeps:hash(pack.sweeps),metrics:hash(pack.metrics)},characters:records},null,2));
 // Compact sheets keep every character's intermediate states legible together.
 for(let group=0;group<Math.ceil(records.length/30);group++){
   const subset=records.slice(group*30,group*30+30),composite:sharp.OverlayOptions[]=[];
   for(let i=0;i<subset.length;i++){
     const record=subset[i],left=(i%2)*440,top=Math.floor(i/2)*130;
     const title=Buffer.from(`<svg width="435" height="24"><text x="4" y="17" font-size="15" font-family="sans-serif">U+${record.codepoint.toString(16).toUpperCase()} · ${record.character.replaceAll('&','&amp;').replaceAll('<','&lt;')} · 10 / 25 / 50 / 75 / 100% / source</text></svg>`);
     composite.push({input:title,left,top});
     const chosen=['0.1','0.25','0.5','0.75','1',null];
     for(let j=0;j<chosen.length;j++){
       const sample=record.samples.find(s=>s.progress===chosen[j])!;
       const input=await sharp(path.join(dir,record.page)).extract({left:Math.round(sample.x),top:Math.round(sample.inkY),width:sampleWidth,height:sampleHeight}).resize(72,96).png().toBuffer();
       composite.push({input,left:left+j*72,top:top+24});
     }
   }
   await sharp({create:{width:880,height:Math.ceil(subset.length/2)*130,channels:3,background:'white'}}).composite(composite).png().toFile(path.join(dir,`review-sheet-${group+1}.png`));
 }
 if(process.argv.includes('--steps')) {
   for(const record of records) {
     const tiles:sharp.OverlayOptions[]=[];
     for(let i=0;i<record.samples.length;i++) {
       const sample=record.samples[i],left=i%6*190,top=Math.floor(i/6)*266;
       const crop=await sharp(path.join(dir,record.page)).extract({left:Math.round(sample.x),top:Math.round(sample.inkY),width:sampleWidth,height:sampleHeight}).resize(180,240).png().toBuffer();
       tiles.push({input:crop,left,top:top+24});
       const label=sample.progress===null?'Source':`${(Number(sample.progress)*100).toFixed(1)}%`;
       tiles.push({input:Buffer.from(`<svg width="190" height="24"><text x="10" y="18" font-size="16">${label}</text></svg>`),left,top});
     }
     await sharp({create:{width:1140,height:Math.ceil(record.samples.length/6)*266,channels:3,background:'white'}}).composite(tiles).png().toFile(path.join(dir,`motion-${record.codepoint}.png`));
   }
 }
 console.log(fontId,records.length,'characters;',records.filter(r=>r.coverage_percent<99).map(r=>`${r.character}:${r.coverage_percent}`).join(' '));
}finally{await browser.close();}

}
main().catch(error=>{console.error(error);process.exitCode=1;});
