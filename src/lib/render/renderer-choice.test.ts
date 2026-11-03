import test from 'node:test';
import assert from 'node:assert/strict';
import {readRendererChoice,affectsRendererChoice,keepVisitFallback,RENDERER_KEY,RENDERER_CHOSEN_KEY} from './renderer-choice';
import {getStoredItem} from '../persisted-key';
// Mirrors the editor: keys saved under the OpenEdit prefix migrate on read.
const read=(saved:Record<string,string>,native=false)=>{const values=new Map(Object.entries(saved));const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};return readRendererChoice(key=>getStoredItem(storage,key),native);};
test('new installs choose GPU and a saved renderer drives both consumers',()=>{
 assert.deepEqual(read({}),{renderer:'gpu',needsConfirmation:false});
 for(const renderer of ['gpu','rust'])assert.deepEqual(read({[RENDERER_KEY]:renderer},true),{renderer,needsConfirmation:false});
 assert.deepEqual(read({[RENDERER_KEY]:'standard',[RENDERER_CHOSEN_KEY]:'1'}),{renderer:'standard',needsConfirmation:false});
});
test('a Browser renderer nobody picked was an automatic fallback, so the Graphics card is tried again',()=>{
 assert.deepEqual(read({[RENDERER_KEY]:'standard'}),{renderer:'gpu',needsConfirmation:false});
});
test('legacy conflicting renderer choices require confirmation instead of silent migration',()=>{
 assert.deepEqual(read({'openedit.preview-preparation':'gpu','openedit.playback-engine':'standard'}),{renderer:'gpu',needsConfirmation:true});
 assert.deepEqual(read({'openedit.preview-source-engine':'standard','openedit.playback-engine':'rust'},true),{renderer:'standard',needsConfirmation:true});
 assert.deepEqual(read({'openedit.playback-engine':'standard'}),{renderer:'standard',needsConfirmation:false});
 assert.deepEqual(read({'dreamcut.playback-engine':'standard'}),{renderer:'standard',needsConfirmation:false});
 // A Browser saved under the old name was never picked either.
 assert.deepEqual(read({'openedit.renderer':'standard'}),{renderer:'gpu',needsConfirmation:false});
});
test('unavailable Rust never silently becomes a different export renderer',()=>{
 assert.deepEqual(read({[RENDERER_KEY]:'rust'}),{renderer:'rust',needsConfirmation:true});
});
test('the Browser fallback for this visit survives unrelated storage writes until someone picks a renderer',()=>{
 assert.equal(affectsRendererChoice('dreamcut.timeline-zoom'),false);
 for(const key of [RENDERER_KEY,RENDERER_CHOSEN_KEY,'openedit.renderer',null])assert.equal(affectsRendererChoice(key),true);
 // Nothing saved reads as GPU; after this visit fell back, a re-read stays on Browser.
 assert.deepEqual(keepVisitFallback(read({}),true),{renderer:'standard',needsConfirmation:false});
 assert.deepEqual(keepVisitFallback(read({}),false),{renderer:'gpu',needsConfirmation:false});
 // An explicit non-GPU choice still wins; picking a renderer here clears the fallback flag.
 assert.deepEqual(keepVisitFallback(read({[RENDERER_KEY]:'rust'},true),true),{renderer:'rust',needsConfirmation:false});
 assert.deepEqual(keepVisitFallback(read({[RENDERER_KEY]:'gpu',[RENDERER_CHOSEN_KEY]:'1'}),false),{renderer:'gpu',needsConfirmation:false});
});
