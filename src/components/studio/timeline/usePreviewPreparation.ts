'use client';
import {readRendererChoice,affectsRendererChoice,keepVisitFallback,RENDERER_KEY,RENDERER_CHOSEN_KEY,RENDERER_EVENT,type RendererChoice} from '@/lib/render/renderer-choice';
import {useCallback,useEffect,useRef,useState} from 'react';
import {PREVIEW_PREPARATION_KEY,PREVIEW_PREPARATION_EVENT,parsePreviewPreparation,type PreviewPreparation} from '@/lib/preview-preparation';
import {getStoredItem} from '@/lib/persisted-key';
const read=()=>{try{return parsePreviewPreparation(getStoredItem(localStorage,PREVIEW_PREPARATION_KEY));}catch{return parsePreviewPreparation(null);}};
export function usePreviewPreparation(){
 const [mode,setMode]=useState<PreviewPreparation>(read);
 useEffect(()=>{const refresh=()=>setMode(read());window.addEventListener('storage',refresh);window.addEventListener(PREVIEW_PREPARATION_EVENT,refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener(PREVIEW_PREPARATION_EVENT,refresh);};},[]);
 return [mode,(next:PreviewPreparation)=>{setMode(next);try{localStorage.setItem(PREVIEW_PREPARATION_KEY,next);window.dispatchEvent(new Event(PREVIEW_PREPARATION_EVENT));}catch{ /* Keep this session usable when storage is unavailable. */ }}] as const;
}

/** Preview selection is independent; the shared scope retains the existing export preference. */
export function usePlaybackEngine(nativeAvailable:boolean,scope:'shared'|'preview'='shared'){
 const key=scope==='preview'?'dreamcut.preview-source-engine':'dreamcut.playback-engine',event=scope==='preview'?'dreamcut-preview-source-engine':'dreamcut-playback-engine';
 const readEngine=(): 'standard'|'rust'=>{try{const saved=getStoredItem(localStorage,key)??(scope==='preview'?getStoredItem(localStorage,'dreamcut.playback-engine'):null);return nativeAvailable && saved!=='standard'?'rust':'standard';}catch{return nativeAvailable?'rust':'standard';}};
 const [engine,setEngine]=useState<'standard'|'rust'>(readEngine);
 useEffect(()=>{const refresh=()=>setEngine(readEngine());window.addEventListener('storage',refresh);window.addEventListener(event,refresh);return()=>{window.removeEventListener('storage',refresh);window.removeEventListener(event,refresh);};},[nativeAvailable,key,event]);
 const save=useCallback((next:'standard'|'rust')=>{setEngine(next);try{localStorage.setItem(key,next);window.dispatchEvent(new Event(event));}catch{ /* Session-only fallback. */ }},[key,event]);
 return [engine,save] as const;
}

/** One persisted renderer owns both picture preview and final export. */
export function useRendererChoice(nativeAvailable:boolean){
 const read=()=>{try{return readRendererChoice(key=>getStoredItem(localStorage,key),nativeAvailable);}catch{return {renderer:'gpu' as RendererChoice,needsConfirmation:false};}};
 const [choice,setChoice]=useState(read);
 const fellBack=useRef(false);
 useEffect(()=>{const refresh=()=>setChoice(keepVisitFallback(read(),fellBack.current));const onStorage=(event:StorageEvent)=>{if(affectsRendererChoice(event.key))refresh();};window.addEventListener('storage',onStorage);window.addEventListener(RENDERER_EVENT,refresh);return()=>{window.removeEventListener('storage',onStorage);window.removeEventListener(RENDERER_EVENT,refresh);};},[nativeAvailable]);
 const save=useCallback((renderer:RendererChoice)=>{fellBack.current=false;setChoice({renderer,needsConfirmation:false});try{localStorage.setItem(RENDERER_KEY,renderer);localStorage.setItem(RENDERER_CHOSEN_KEY,'1');window.dispatchEvent(new Event(RENDERER_EVENT));}catch{/* Session preference remains usable. */}},[]);
 // The Graphics card could not start here: use Browser for this visit only, so the next load tries it again.
 const fallBack=useCallback(()=>{fellBack.current=true;setChoice({renderer:'standard',needsConfirmation:false});},[]);
 return [choice.renderer,save,choice.needsConfirmation,fallBack] as const;
}
