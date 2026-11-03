import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateDictationWav,transcribeDictation,MAX_DICTATION_BYTES} from './dictation.mjs';
function wav(silent=false) {const b=Buffer.alloc(3244);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(16000,24);b.writeUInt32LE(32000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);if(!silent)for(let i=44;i<b.length;i+=2)b.writeInt16LE(1000,i);return b;}
test('dictation rejects silence, arbitrary bytes and oversized IPC payloads',()=>{assert.throws(()=>validateDictationWav(wav(true)),/No speech/);assert.throws(()=>validateDictationWav(new Uint8Array(MAX_DICTATION_BYTES+1)));assert.throws(()=>validateDictationWav(Buffer.alloc(64)));assert.equal(validateDictationWav(wav()).length,3244);});
test('transcription owns fixed arguments and removes temporary audio on success and failure',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'voice-test-'));
 try {for(const name of ['whisper-cli','whisper-cli.exe','ggml-base.en.bin'])await fs.writeFile(path.join(dir,name),'fixture');
 let input;
 const text=await transcribeDictation(wav(),{directory:dir,execute:async(executable,args,options)=>{assert.equal(options.windowsHide,true);input=args[args.indexOf('-f')+1];assert.equal(path.basename(input),'speech.wav');await fs.writeFile(args[args.indexOf('-of')+1]+'.txt','Review this edit');}});
 assert.equal(text,'Review this edit');await assert.rejects(fs.access(input));
 await assert.rejects(transcribeDictation(wav(),{directory:dir,execute:async(_,args)=>{input=args[args.indexOf('-f')+1];throw Error('private details');}}),/Local transcription failed/);await assert.rejects(fs.access(input));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('dictation rejects inconsistent PCM headers',()=>{for(const offset of [4,28,32]){const bytes=wav();bytes[offset]^=1;assert.throws(()=>validateDictationWav(bytes),/Unsupported/);}});
