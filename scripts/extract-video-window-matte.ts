/** Extract an original-resolution frame and complementary glass/surround mattes from an authored SVG aperture. No timeline writes. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
async function main() {
  const [source, seconds, aperture, output] = process.argv.slice(2);
  if (!source || !aperture || !output || !Number.isFinite(Number(seconds)) || Number(seconds) < 0) throw new Error('Usage: extract-video-window-matte source-video source-seconds aperture.svg output-dir');
  await fs.mkdir(output, {recursive:true});
  const frame = path.join(output, 'source-frame.png');
  execFileSync('ffmpeg', ['-v','error','-ss',seconds!,'-i',source,'-frames:v','1','-y',frame]);
  const {data,info} = await sharp(frame).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const mask = await sharp(aperture).resize(info.width,info.height).ensureAlpha().raw().toBuffer();
  const surround = Buffer.from(data), glassWhite = Buffer.from(data), surroundWhite = Buffer.from(data);
  for(let i=0;i<data.length;i+=4) {
    const a = mask[i+3]!;
    surround[i+3]=255-a;
    for(const buffer of [glassWhite,surroundWhite]) buffer.fill(255,i,i+3);
    glassWhite[i+3]=a; surroundWhite[i+3]=255-a;
  }
  for(const [name,buffer] of [['window-surround',surround],['window-glass-white',glassWhite],['window-surround-white',surroundWhite]] as const) {
    await sharp(buffer,{raw:info}).png().toFile(path.join(output,name+'.png'));
  }
  await fs.writeFile(path.join(output,'receipt.json'),JSON.stringify({source:path.resolve(source),source_seconds:Number(seconds),source_sha256:createHash('sha256').update(await fs.readFile(source)).digest('hex'),aperture:path.resolve(aperture),width:info.width,height:info.height,recipe:'original-video-svg-aperture-v1'},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
