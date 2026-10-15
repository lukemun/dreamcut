import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { prepareFixture as bundle } from "@/lib/render/fixture-renderer";
import { renderFixtureStill as renderStill, selectFixture as selectComposition } from "@/lib/render/fixture-renderer";
import sharp from 'sharp';
import assert from 'node:assert/strict';

async function main() {
  const dir = await mkdtemp(path.join(tmpdir(), 'recolor-proof-'));
  const png = path.join(dir, 'source.png');
  await sharp({create:{width:100,height:100,channels:4,background:'#00000000'}}).composite([{input:await sharp({create:{width:60,height:60,channels:4,background:'#808080'}}).png().toBuffer(),left:20,top:20}]).png().toFile(png);
  const video = path.join(dir,'source.webm');
  execFileSync('ffmpeg',['-loglevel','error','-loop','1','-i',png,'-t','1','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-auto-alt-ref','0',video]);
  const serveUrl = await bundle({entryPoint:path.resolve('src/lib/remotion/RecolorFixture.tsx')});
  for (const isVideo of [false,true]) for (const [amount,shading,expected] of [[0,0,128],[1,0,255],[1,1,128],[0.5,0,192]]) {
    const src = `data:${isVideo?'video/webm':'image/png'};base64,${(await readFile(isVideo?video:png)).toString('base64')}`;
    const inputProps={src,video:isVideo,amount,shading};
    const composition=await selectComposition({serveUrl,id:'RecolorFixture',inputProps});
    const output=path.join(dir,`${isVideo}-${amount}-${shading}.png`);
    await renderStill({serveUrl,composition,inputProps,output,frame:5,imageFormat:'png'});
    const data=await sharp(output).ensureAlpha().raw().toBuffer();
    const center=[...data.subarray((50*100+50)*4,(50*100+50)*4+4)];
    const corner=[...data.subarray((5*100+5)*4,(5*100+5)*4+4)];
    assert.ok(Math.abs(center[0]!-expected!)<=4, `center ${center}`);
    const other=amount===0?128:amount===0.5?64:0;
    assert.ok(Math.abs(center[1]!-other)<=4 && Math.abs(center[2]!-other)<=4, `channels ${center}`);
    assert.deepEqual(corner,[0,0,255,255], 'transparent area must reveal the blue layer below');
    console.log({video:isVideo,amount,shading,center,corner});
  }
  console.log(`Recolor pixel proof passed: ${dir}`);
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
