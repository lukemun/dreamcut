/** Keep the popover inside its viewer when supplied, and inside the window otherwise. */
export function previewSettingsPlacement(anchor:{top:number;bottom:number;right:number},viewport:{width:number;height:number},contentHeight:number,bounds?:{left:number;right:number;top:number;bottom:number}){
 const margin=12,gap=8,leftEdge=Math.max(0,bounds?.left??0),rightEdge=Math.min(viewport.width,bounds?.right??viewport.width);
 const topEdge=Math.max(0,bounds?.top??0),bottomEdge=Math.min(viewport.height,bounds?.bottom??viewport.height);
 const width=Math.min(340,Math.max(0,rightEdge-leftEdge-margin*2));
 const above=Math.max(0,anchor.top-gap-topEdge-margin),below=Math.max(0,bottomEdge-margin-anchor.bottom-gap);
 const useAbove=above>=contentHeight||above>=below;
 const maxHeight=useAbove?above:below,height=Math.min(contentHeight,maxHeight);
 const top=useAbove?anchor.top-gap-height:anchor.bottom+gap;
 return {left:Math.max(leftEdge+margin,Math.min(anchor.right-width,rightEdge-width-margin)),top:Math.max(topEdge+margin,top),maxHeight,width};
}
