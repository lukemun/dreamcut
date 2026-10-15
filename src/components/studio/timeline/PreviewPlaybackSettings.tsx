'use client';
import {NativeSelect} from '@/components/ui/native-select';
import {parsePreviewPreparation,type PreviewPreparation} from '@/lib/preview-preparation';
import {previewFallbackMessage,type PreviewRendererSelection} from '@/lib/preview-renderer-selection';
import {PreviewQualitySettings} from './PreviewQualitySettings';
/**
 * The viewer's gear panel. Video shape leads, then proxy quality because it is the setting people
 * change while editing; the renderer and preparation engine follow as their own section.
 */
export function PreviewPlaybackSettings({shape,accessory,projectId,nativeAvailable,renderer,needsConfirmation,preparation,onPreparationChange,onRendererChange,reason}:{
 shape?:React.ReactNode;accessory?:React.ReactNode;projectId:string;nativeAvailable:boolean;renderer:PreviewRendererSelection;needsConfirmation?:boolean;
 onRendererChange:(renderer:PreviewRendererSelection)=>void;preparation:PreviewPreparation;onPreparationChange:(mode:PreviewPreparation)=>void;reason:string|null;
}){
 return <div className="preview-settings">
  <h2 className="preview-settings-title">Preview settings</h2>
  {/* The video's shape is the project's output; it leads because it reshapes the whole preview. */}
  {shape}
  <PreviewQualitySettings projectId={projectId} compact />
  {accessory&&<div className="preview-settings-section">{accessory}</div>}
  {/* Engine choices are rarely changed; they open by themselves when export needs a decision. */}
  <details className="preview-settings-section space-y-3" open={needsConfirmation||!!reason||undefined} aria-label="Advanced playback">
   <summary className="preview-settings-heading cursor-pointer">Advanced</summary>
   <div className="space-y-1.5"><label className="block text-sm font-medium">Renderer
    <NativeSelect aria-label="Renderer for preview and export" value={needsConfirmation?'':renderer} onChange={e=>onRendererChange(e.target.value as PreviewRendererSelection)}>
     <option value="" disabled>Choose a renderer</option><option value="standard">Standard · works everywhere</option>{nativeAvailable&&<option value="rust">Native · experimental</option>}<option value="gpu">Graphics card · fastest</option>
    </NativeSelect></label>
   </div>
   {needsConfirmation&&<p role="status" className="text-xs text-muted-foreground">Choose a renderer before exporting.</p>}
   {preparation==='gpu'?null:
   <div className="space-y-1.5"><label className="block text-sm font-medium">Preparation
    <NativeSelect aria-label="Preview preparation" value={preparation} onChange={e=>onPreparationChange(parsePreviewPreparation(e.target.value))}>
     <option value="prepared">Prepare before playing</option><option value="live">Play directly</option><option value="rolling">Rolling cache · Test</option><option value="selective">Smart cache · Test</option>
    </NativeSelect></label>
   </div>}
  </details>
  {reason&&<p role="status" className="text-xs text-muted-foreground">{`${previewFallbackMessage(renderer,reason)} Export blocked — choose a working renderer.`}</p>}
 </div>;
}
