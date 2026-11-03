import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export const MAX_DICTATION_BYTES = 16000 * 2 * 120 + 44;
export function validateDictationWav(input) {
  if (!(input instanceof Uint8Array) || input.byteLength < 46 || input.byteLength > MAX_DICTATION_BYTES) throw Error('Record between a moment and two minutes of speech.');
  const b = Buffer.from(input);
  if (b.toString('ascii',0,4)!=='RIFF' || b.readUInt32LE(4)!==b.length-8 || b.toString('ascii',8,12)!=='WAVE' || b.toString('ascii',12,16)!=='fmt ' || b.readUInt32LE(16)!==16 || b.readUInt16LE(20)!==1 || b.readUInt16LE(22)!==1 || b.readUInt32LE(24)!==16000 || b.readUInt32LE(28)!==32000 || b.readUInt16LE(32)!==2 || b.readUInt16LE(34)!==16 || b.toString('ascii',36,40)!=='data' || b.readUInt32LE(40)!==b.length-44 || b.length%2) throw Error('Unsupported microphone audio format.');
  let energy=0; for(let i=44;i<b.length;i+=2) energy+=(b.readInt16LE(i)/32768)**2;
  if(Math.sqrt(energy/((b.length-44)/2))<0.001) throw Error('No speech detected. Check your microphone and try again.');
  return b;
}
export async function transcribeDictation(input, { directory, signal, execute = run }) {
  const audio=validateDictationWav(input);
  const executable=path.join(directory,process.platform==='win32'?'whisper-cli.exe':'whisper-cli');
  const model=path.join(directory,'ggml-base.en.bin');
  await Promise.all([fs.access(executable),fs.access(model)]).catch(()=>{throw Error('Local voice files are missing. Prepare or reinstall the desktop voice bundle.');});
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-dictation-'));
  try {
    const file=path.join(temporary,'speech.wav'), output=path.join(temporary,'transcript');
    await fs.writeFile(file,audio,{mode:0o600});
    await execute(executable,['-m',model,'-f',file,'-l','en','-t','4','-otxt','-of',output,'-np','-nt'],{signal,timeout:120000,maxBuffer:1024*1024,windowsHide:true});
    const text=(await fs.readFile(output+'.txt','utf8')).trim();
    if(!text || /^\[(BLANK_AUDIO|SILENCE)\]$/i.test(text)) throw Error('No speech detected. Try again.');
    return text.slice(0,16000);
  } catch(error) {
    if(signal?.aborted) throw Error('Dictation cancelled.');
    if(error.message?.startsWith('No speech')) throw error;
    throw Error('Local transcription failed. Try a shorter recording.');
  } finally { await fs.rm(temporary,{recursive:true,force:true}); }
}
