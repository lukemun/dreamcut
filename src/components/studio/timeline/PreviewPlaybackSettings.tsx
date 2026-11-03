'use client';
import {OptionSelect} from '@/components/ui/select';
import {SettingField} from '@/components/ui/setting-field';
import {parsePreviewPreparation,type PreviewPreparation} from '@/lib/preview-preparation';
import {PREVIEW_RENDERER_LABELS,previewFallbackMessage,type PreviewRendererSelection} from '@/lib/preview-renderer-selection';
import {PreviewQualitySettings} from './PreviewQualitySettings';
/**
 * The viewer's gear panel. Video shape leads, then proxy quality because it is the setting people
 * change while editing; the renderer follows as its own section, and preparation sits under Advanced.
 */
/** The renderer choices, in display order; Rust appears only when the native renderer is available. */
export function rendererOptions(nativeAvailable:boolean){
 return (Object.keys(PREVIEW_RENDERER_LABELS) as PreviewRendererSelection[]).filter(value=>value!=='rust'||nativeAvailable).map(value=>({value,label:PREVIEW_RENDERER_LABELS[value]}));
}

export function PreviewPlaybackSettings({shape,accessory,projectId,nativeAvailable,renderer,needsConfirmation,preparation,onPreparationChange,onRendererChange,reason}:{
 shape?:React.ReactNode;accessory?:React.ReactNode;projectId:string;nativeAvailable:boolean;renderer:PreviewRendererSelection;needsConfirmation?:boolean;
 onRendererChange:(renderer:PreviewRendererSelection)=>void;preparation:PreviewPreparation;onPreparationChange:(mode:PreviewPreparation)=>void;reason:string|null;
}){
 return <div className="preview-settings">
  <h2 className="preview-settings-title">Preview settings</h2>
  {/* The video's shape is the project's output; it leads because it reshapes the whole preview. */}
  {shape}
  <PreviewQualitySettings projectId={projectId} compact />
  {accessory}
  <SettingField label="Renderer" htmlFor="preview-renderer" status={needsConfirmation?'Choose a renderer before exporting.':null}>
   <OptionSelect label="Renderer for preview and export" value={needsConfirmation?'':renderer} placeholder="Choose a renderer"
    options={rendererOptions(nativeAvailable)}
    onValueChange={value=>onRendererChange(value as PreviewRendererSelection)} />
  </SettingField>
  {/* Preparation is rarely changed; it opens by itself when the renderer fell back. */}
  {preparation==='gpu'?null:<details className="space-y-3" open={!!reason||undefined} aria-label="Advanced playback">
   <summary className="preview-settings-heading cursor-pointer">Advanced</summary>
   <SettingField label="Preparation" htmlFor="preview-preparation">
    <OptionSelect label="Preview preparation" value={preparation}
     options={[{value:'prepared',label:'Prepare before playing'},{value:'live',label:'Play directly'},{value:'rolling',label:'Rolling cache · Test'},{value:'selective',label:'Smart cache · Test'}]}
     onValueChange={value=>onPreparationChange(parsePreviewPreparation(value))} />
   </SettingField>
  </details>}
  {reason&&<p role="status" className="text-xs text-muted-foreground">{`${previewFallbackMessage(renderer,reason)} Export blocked — choose a working renderer.`}</p>}
 </div>;
}
