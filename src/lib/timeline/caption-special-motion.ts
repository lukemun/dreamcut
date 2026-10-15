/** Shared legacy caption branch geometry. Times are caption-local frames. */
export function captionTickerProgress(frame:number,durationInFrames:number){
 return durationInFrames>1?Math.min(1,Math.max(0,frame/(durationInFrames-1))):1;
}
/**
 * The crawl offset snaps to whole composition pixels in both renderers (CSS `round()` ties
 * toward +infinity, as Math.round does), so each frame paints the glyphs once at an integer
 * offset instead of Standard repainting them at a fractional translation while Browser GPU
 * resamples one raster there. The ticker's left edge (the canvas width) is an integer.
 */
export function captionTickerTranslation(progress:number,canvasWidth:number,layoutWidth:number){
 return Math.round(canvasWidth-progress*(layoutWidth+canvasWidth));
}
export function captionTickerCss(progress:number,canvasWidth:number){
 return `translateX(round(calc(${-progress*100}% - ${progress*canvasWidth}px), 1px))`;
}
export function captionScanLine(raw:Record<string,unknown>|null|undefined,inProgress:number,renderScale=1){
 const start=typeof raw?.scan_reveal_start_y==='number'?Math.min(1,Math.max(0,raw.scan_reveal_start_y)):0;
 const end=typeof raw?.scan_reveal_end_y==='number'?Math.min(1,Math.max(start,raw.scan_reveal_end_y)):1;
 return {
  y:start+(end-start)*Math.min(1,Math.max(0,inProgress)),
  height:(typeof raw?.scan_reveal_line_height_px==='number'?Math.max(1,raw.scan_reveal_line_height_px):3)*renderScale,
  width:typeof raw?.scan_reveal_line_width==='number'?Math.min(1,Math.max(.05,raw.scan_reveal_line_width)):1,
 };
}
