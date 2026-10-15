export type RendererChoice='standard'|'rust'|'gpu';
export const RENDERER_KEY='dreamcut.renderer';
export const RENDERER_EVENT='dreamcut-renderer';
export function readRendererChoice(get:(key:string)=>string|null,nativeAvailable:boolean){
 const valid=(value:string|null):value is RendererChoice=>value==='standard'||value==='rust'||value==='gpu';
 const saved=get(RENDERER_KEY);
 if(valid(saved))return {renderer:saved,needsConfirmation:saved==='rust'&&!nativeAvailable};
 const oldExport=get('dreamcut.playback-engine');
 const oldPreview=get('dreamcut.preview-source-engine')??oldExport;
 const preview=get('dreamcut.preview-preparation')==='gpu'?'gpu':valid(oldPreview)?oldPreview:nativeAvailable?'rust':'standard';
 const hasLegacy=oldExport!==null||oldPreview!==null||get('dreamcut.preview-preparation')!==null;
 return {renderer:hasLegacy?preview:'gpu' as RendererChoice,needsConfirmation:hasLegacy&&(preview!==oldExport||preview==='rust'&&!nativeAvailable)};
}
