import test from 'node:test';
import assert from 'node:assert/strict';
import {readRendererChoice,RENDERER_KEY} from './renderer-choice';
import {getStoredItem} from '../persisted-key';
// Mirrors the editor: keys saved under the OpenEdit prefix migrate on read.
const read=(saved:Record<string,string>,native=false)=>{const values=new Map(Object.entries(saved));const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};return readRendererChoice(key=>getStoredItem(storage,key),native);};
test('new installs choose GPU and a saved renderer drives both consumers',()=>{
 assert.deepEqual(read({}),{renderer:'gpu',needsConfirmation:false});
 for(const renderer of ['standard','gpu','rust'])assert.deepEqual(read({[RENDERER_KEY]:renderer},true),{renderer,needsConfirmation:false});
});
test('legacy conflicting renderer choices require confirmation instead of silent migration',()=>{
 assert.deepEqual(read({'openedit.preview-preparation':'gpu','openedit.playback-engine':'standard'}),{renderer:'gpu',needsConfirmation:true});
 assert.deepEqual(read({'openedit.preview-source-engine':'standard','openedit.playback-engine':'rust'},true),{renderer:'standard',needsConfirmation:true});
 assert.deepEqual(read({'openedit.playback-engine':'standard'}),{renderer:'standard',needsConfirmation:false});
 assert.deepEqual(read({'dreamcut.playback-engine':'standard'}),{renderer:'standard',needsConfirmation:false});
 assert.deepEqual(read({'openedit.renderer':'standard'}),{renderer:'standard',needsConfirmation:false});
});
test('unavailable Rust never silently becomes a different export renderer',()=>{
 assert.deepEqual(read({[RENDERER_KEY]:'rust'}),{renderer:'rust',needsConfirmation:true});
});
