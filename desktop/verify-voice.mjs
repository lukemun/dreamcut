import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { transcribeDictation } from './dictation.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Upstream public speech fixture; never records the creator's microphone.
const audio=await fs.readFile(path.join(root,'.desktop-build/whisper-source/samples/jfk.wav'));
// The fixture has metadata chunks; normalize only its PCM header to our IPC format.
let pcm;
for(let offset=12;offset+8<=audio.length;) {const size=audio.readUInt32LE(offset+4);if(audio.toString('ascii',offset,offset+4)==='data'){pcm=audio.subarray(offset+8,offset+8+size);break;}offset+=8+size+(size%2);}
assert.ok(pcm);
const wav=Buffer.alloc(44+pcm.length);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);pcm.copy(wav,44);
const text=await transcribeDictation(wav,{directory:path.join(root,'.desktop-build/voice')});
assert.match(text,/ask not what your country can do for you/i);
console.log('Bundled speech runtime transcribed the upstream fixture successfully.');
