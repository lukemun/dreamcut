import type {PreviewPreparation} from './preview-preparation';
export type PreviewRendererSelection='standard'|'rust'|'gpu';
/** What each renderer is called wherever a person picks or sees it, in picker order. */
export const PREVIEW_RENDERER_LABELS:Record<PreviewRendererSelection,string>={rust:'Rust · experimental',gpu:'Graphics card · fastest',standard:'Browser · works everywhere'};
export function selectedPreviewRenderer(engine:'standard'|'rust',preparation:PreviewPreparation):PreviewRendererSelection {
 return preparation==='gpu'?'gpu':engine;
}
/** Compatibility adapter for existing saved viewing preferences. */
export function previewRendererChange(renderer:PreviewRendererSelection,engine:'standard'|'rust',preparation:PreviewPreparation,previous:Exclude<PreviewPreparation,'gpu'>='prepared'){
 return renderer==='gpu'?{engine,preparation:'gpu' as const}:{engine:renderer,preparation:preparation==='gpu'?previous:preparation};
}
/** Shown once when this computer cannot start the Graphics card renderer and DreamCut moves preview and export to Browser together. */
export const NO_GPU_DEVICE_MESSAGE="This computer can't run the Graphics card renderer, so preview and export use Browser.";

export function previewFallbackMessage(renderer:PreviewRendererSelection,reason:string|null){
 if(!reason)return null;
 const detail=renderer==='gpu'&&/CanvasKit GPU context lost|^GPU preview stopped:/.test(reason)
  ? 'The graphics connection was interrupted. In Preview settings, choose Browser, then Graphics card to try again.'
  : reason;
 return `${renderer==='gpu'?'Graphics card':'Rust'} preview unavailable. Displaying with Browser. ${detail}`;
}
