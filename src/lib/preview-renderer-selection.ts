import type {PreviewPreparation} from './preview-preparation';
export type PreviewRendererSelection='standard'|'rust'|'gpu';
export function selectedPreviewRenderer(engine:'standard'|'rust',preparation:PreviewPreparation):PreviewRendererSelection {
 return preparation==='gpu'?'gpu':engine;
}
/** Compatibility adapter for existing saved viewing preferences. */
export function previewRendererChange(renderer:PreviewRendererSelection,engine:'standard'|'rust',preparation:PreviewPreparation,previous:Exclude<PreviewPreparation,'gpu'>='prepared'){
 return renderer==='gpu'?{engine,preparation:'gpu' as const}:{engine:renderer,preparation:preparation==='gpu'?previous:preparation};
}
export function previewFallbackMessage(renderer:PreviewRendererSelection,reason:string|null){
 if(!reason)return null;
 const detail=renderer==='gpu'&&/CanvasKit GPU context lost|^GPU preview stopped:/.test(reason)
  ? 'The graphics connection was interrupted. In Preview settings, open Advanced, choose Standard, then Graphics card to try again.'
  : reason;
 return `${renderer==='gpu'?'GPU':'Rust'} preview unavailable. Displaying with Standard. ${detail}`;
}
