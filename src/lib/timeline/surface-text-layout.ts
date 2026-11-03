import type {CSSProperties} from 'react';
import {captionRemotionFontFamily,captionTypographyCSS,type CaptionElementProps} from './captions';

/** Shared DOM layout authority for tracked text and its cached GPU texture. */
export function surfaceTextLayout(width:number,height:number,text:CaptionElementProps):{plane:CSSProperties;text:CSSProperties}{
 return {
  plane:{position:'absolute',left:0,top:0,width,height,transformOrigin:'0 0',overflow:'hidden',pointerEvents:'none',display:'flex',alignItems:'center',justifyContent:'center'},
  text:{width:`${text.maxWidth*100}%`,maxHeight:'84%',overflow:'hidden',whiteSpace:text.singleLine?'nowrap':'pre-wrap',overflowWrap:'anywhere',
   fontFamily:captionRemotionFontFamily(text.fontPreset),...captionTypographyCSS(text.fontPreset),fontSize:text.fontSizePx,lineHeight:1.12,textAlign:text.textAlign,color:text.textColor??'#171717',opacity:text.surfaceOpacity},
 };
}
