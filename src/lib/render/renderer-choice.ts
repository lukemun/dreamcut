export type RendererChoice='standard'|'rust'|'gpu';
export const RENDERER_KEY='dreamcut.renderer';
export const RENDERER_EVENT='dreamcut-renderer';
/** Set when a person picks a renderer. Without it a saved Browser was the old automatic fallback and is
 *  ignored, so the editor tries the Graphics card again: renderer choice is automatic unless someone chose. */
export const RENDERER_CHOSEN_KEY='dreamcut.renderer-chosen';
export function readRendererChoice(get:(key:string)=>string|null,nativeAvailable:boolean){
 const valid=(value:string|null):value is RendererChoice=>value==='standard'||value==='rust'||value==='gpu';
 const saved=get(RENDERER_KEY);
 if(valid(saved)&&(saved!=='standard'||get(RENDERER_CHOSEN_KEY)==='1'))return {renderer:saved,needsConfirmation:saved==='rust'&&!nativeAvailable};
 if(saved==='standard')return {renderer:'gpu' as RendererChoice,needsConfirmation:false};
 const oldExport=get('dreamcut.playback-engine');
 const oldPreview=get('dreamcut.preview-source-engine')??oldExport;
 const preview=get('dreamcut.preview-preparation')==='gpu'?'gpu':valid(oldPreview)?oldPreview:nativeAvailable?'rust':'standard';
 const hasLegacy=oldExport!==null||oldPreview!==null||get('dreamcut.preview-preparation')!==null;
 return {renderer:hasLegacy?preview:'gpu' as RendererChoice,needsConfirmation:hasLegacy&&(preview!==oldExport||preview==='rust'&&!nativeAvailable)};
}
const RENDERER_INPUTS=['renderer','renderer-chosen','playback-engine','preview-source-engine','preview-preparation'];
/** Whether a storage change can alter the renderer choice; a null key means storage was cleared. */
export function affectsRendererChoice(key:string|null){return key===null||RENDERER_INPUTS.some(name=>key===`dreamcut.${name}`||key===`openedit.${name}`);}
/** After the Graphics card failed this visit, a re-read keeps Browser until a person here picks a renderer. */
export function keepVisitFallback(choice:{renderer:RendererChoice;needsConfirmation:boolean},fellBack:boolean){return fellBack&&choice.renderer==='gpu'?{renderer:'standard' as RendererChoice,needsConfirmation:false}:choice;}
