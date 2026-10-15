import {resolveMediaShadow} from './media-shadow';
import {resolveMediaTransformAtTime} from './media-transform';
import {resolveCompositionTransformLayout} from './source-projection';

export type TransitionViewportRect={x:number;y:number;width:number;height:number};

const finite=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:null;

/**
 * `transition_clip_to_media_bounds`: a carousel card opts into a fixed, media-sized
 * viewport. The media keeps its native contained aspect ratio, while animation and
 * transition motion is clipped to the card's resting bounds (the contained source rect
 * under the media transform at `timeSeconds`) instead of leaking across the composition.
 * Both renderers consume this owner: Standard's FixedTransitionViewport and CanvasKit's
 * actor viewport clip. Null when the switch is off or the source size is unknown.
 */
export function resolveTransitionViewportRect(props:Record<string,unknown>|null|undefined,timeSeconds:number,compositionWidth:number,compositionHeight:number):TransitionViewportRect|null{
 if(props?.transition_clip_to_media_bounds!==true)return null;
 const sourceWidth=finite(props.source_width),sourceHeight=finite(props.source_height);
 if(!sourceWidth||!sourceHeight||sourceWidth<=0||sourceHeight<=0)return null;
 const transform=resolveMediaTransformAtTime(props,timeSeconds);
 const layout=resolveCompositionTransformLayout({composition_width:compositionWidth,composition_height:compositionHeight,
  media_scale:transform.scale,media_offset_x:transform.offsetX,media_offset_y:transform.offsetY});
 const containScale=Math.min(compositionWidth/sourceWidth,compositionHeight/sourceHeight);
 const width=sourceWidth*containScale*layout.scale,height=sourceHeight*containScale*layout.scale;
 return {x:(compositionWidth-width)/2+layout.translate_x,y:(compositionHeight-height)/2+layout.translate_y,width,height};
}

/**
 * The fixed viewport carries the media shadow as a CSS `box-shadow` on the clip box (the
 * picture's own drop-shadow is clipped inside it). A box-shadow is painted only outside the
 * border box, is not under media scale/orientation, and its blur radius is twice the
 * Gaussian sigma (CSS Backgrounds: the shadow approximates a blur of half the radius).
 */
export function transitionViewportBoxShadow(props:Record<string,unknown>|null|undefined){
 const shadow=resolveMediaShadow(props);
 return shadow&&shadow.opacity>0?{dx:shadow.offsetX,dy:shadow.offsetY,sigma:shadow.blur/2,opacity:shadow.opacity}:undefined;
}
