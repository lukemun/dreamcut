import {canvasKitScaledSourceRect,makeCanvasKitScaledSurface} from './canvaskit-pixel-scale';
import type {CanvasKit,Canvas,Surface,Shader} from 'canvaskit-wasm';
import type {pageTurnVisualPlan} from '../timeline/page-turn-plan';
import type {SurfaceQuad} from '../timeline/surface-track';
import {quadToGpuTransform} from './geometry';
import {canvasKitSourceMatrix} from './canvaskit-geometry';
export type GpuPageTurnBoundary={plan:ReturnType<typeof pageTurnVisualPlan>;width:number;height:number};
export type Face={matrix:number[];back:boolean;width:number;height:number;cropX:number;shade:number;depth:number;clip?:number[][]};
export type CanvasKitPageTurnPlan={faces:Face[];bytes:number;boundary:GpuPageTurnBoundary};
const radians=(v:number)=>v*Math.PI/180;

/** Shared plan supplies hinge/curl positions. Convert each CSS front/back face to
 * a projective composition-space plane; preserve opposite-side content mapping. */
export function canvasKitPageTurnPlan(boundary:GpuPageTurnBoundary):CanvasKitPageTurnPlan{
 const {plan:p,width:w,height:h}=boundary;
 if(![w,h].every(v=>Number.isSafeInteger(v)&&v>0)||!p||!Number.isFinite(p.pageLift))throw Error('Invalid page turn geometry');
 const segments=p.usesSegmentedCurl?p.positionedCurlSegments:[{panelWidth:w-1.25,panelX:0,panelY:0,panelZ:0,rotationDeg:p.pageTurn.rotateYDeg,tiltXDeg:p.pageTurn.rotateXDeg,contentCropX:0,index:0}];
 if(segments.length>36||segments.some(s=>![s.panelWidth,s.panelX,s.panelY,s.panelZ,s.rotationDeg,s.tiltXDeg,s.contentCropX,s.index].every(Number.isFinite)||s.panelWidth<=0))throw Error('Invalid page segments');
 const faces:Face[]=[];
 for(const segment of segments){
  const fw=segment.panelWidth+1.25,rx=radians(segment.tiltXDeg),ry=radians(segment.rotationDeg);
  const originX=p.usesSegmentedCurl?(p.turnsFromBottomRight?p.diagonalBleed*2:p.hingeIsLeft?0:fw):p.pageTurn.transformOrigin.startsWith('right')?w:p.pageTurn.transformOrigin.startsWith('left')?0:w/2;
  const originY=p.usesSegmentedCurl?(p.turnsFromBottomRight?h:h/2):p.pageTurn.transformOrigin.endsWith('bottom')?h:p.pageTurn.transformOrigin.endsWith('top')?0:h/2;
  for(const back of [false,true]){
   // Standard's preserve-3d page faces use local backface visibility. An
   // ancestor perspective may reverse projected winding before the page has
   // turned 90 degrees; that must not reveal the back-only paper/shadow early.
   const facing=Math.cos(rx)*Math.cos(ry)*(back?-1:1);
   if(facing<=1e-10)continue;
   let depth=0;
   const quad=([[0,0],[fw,0],[fw,h],[0,h]] as const).map(([px,py])=>{
    const backX=back&&!p.isVertical?fw-px:px,backY=back&&p.isVertical?h-py:py;
    const x=backX-originX,y=backY-originY,z=back?-.5:.5;
    const x1=x*Math.cos(ry)+z*Math.sin(ry),z1=-x*Math.sin(ry)+z*Math.cos(ry);
    let xx=x1+originX+segment.panelX,yy=y*Math.cos(rx)-z1*Math.sin(rx)+originY+segment.panelY;
    const zz=y*Math.sin(rx)+z1*Math.cos(rx)+segment.panelZ+p.pageLift*(p.usesSegmentedCurl?6:8);
    if(p.usesSegmentedCurl&&p.turnsFromBottomRight){const a=radians(p.pageLift*10),dx=xx-w,dy=yy-h;xx=w+Math.cos(a)*dx-Math.sin(a)*dy;yy=h+Math.sin(a)*dx+Math.cos(a)*dy-p.pageLift*h*.04;}
    const perspective=p.usesSegmentedCurl?4000:760,denominator=1-zz/perspective;
    if(denominator<=0)throw Error('Page crosses perspective plane');depth+=zz/4;
    return [w/2+(xx-w/2)/denominator,h/2+(yy-h/2)/denominator] as [number,number];
   }) as SurfaceQuad;
   const area=quad.reduce((sum,v,i)=>{const n=quad[(i+1)%4];return sum+v[0]*n[1]-v[1]*n[0];},0);
   if(Math.abs(area)<=1e-7)continue;
   const transform=quadToGpuTransform(quad,w,h);if(!transform)throw Error('Degenerate page face');
   const clip=p.usesSegmentedCurl&&p.turnsFromBottomRight?[[0,0],[p.curlSegmentWidth,0],[segment.panelWidth,h],[p.diagonalBleed*2,h]]:undefined;
   faces.push({matrix:canvasKitSourceMatrix(transform,fw,h,w,h),back,width:fw,height:h,cropX:segment.contentCropX,shade:p.usesSegmentedCurl?Math.min(.22,Math.abs(Math.sin(ry))*.16+(segment.index/p.curlSegmentCount)*p.pageTurn.pageShadeOpacity*.06):p.pageTurn.pageShadeOpacity,depth,clip});
  }
 }
 faces.sort((a,b)=>a.depth-b.depth);
 return {boundary,faces,bytes:w*h*8};
}

/** Parse only internal page-plan gradients, never arbitrary browser CSS/assets. */
function gradient(kit:CanvasKit,background:string,w:number,h:number):Shader{
 const angle=/^linear-gradient\((\d+)deg,/.exec(background);if(!angle)throw Error('Invalid page gradient');
 const stops=[...background.matchAll(/(rgba\([^)]*\)|#[0-9a-f]{6}|transparent) (\d+)%/gi)];
 if(stops.length<2)throw Error('Invalid page gradient stops');
 const colors=stops.map(m=>{if(m[1]==='transparent')return kit.Color(0,0,0,0);if(m[1][0]==='#')return kit.Color(parseInt(m[1].slice(1,3),16),parseInt(m[1].slice(3,5),16),parseInt(m[1].slice(5,7),16),1);const v=m[1].slice(5,-1).split(',').map(Number);return kit.Color(v[0],v[1],v[2],v[3]);});
 const a=radians(Number(angle[1])),dx=Math.sin(a),dy=-Math.cos(a),length=Math.abs(w*dx)+Math.abs(h*dy);
 const shader=kit.Shader.MakeLinearGradient([w/2-dx*length/2,h/2-dy*length/2],[w/2+dx*length/2,h/2+dy*length/2],colors,stops.map(m=>Number(m[2])/100),kit.TileMode.Clamp);
 if(!shader)throw Error('Page gradient unavailable');return shader;
}

/** Incoming head must already be drawn. The callback produces the source-tail
 * actor including its own effects; source resolution/timing remain runtime-owned.
 * Ordinary outgoing remains underneath incoming for transparent scene regions. */
export function canvasKitDrawPageTurn(kit:CanvasKit,parent:Surface,output:Canvas,plan:CanvasKitPageTurnPlan,drawActor:(canvas:Canvas,context?:{matrix:number[];isolated:boolean})=>void,perFace=false,scale=1){
 const {boundary:{plan:p,width:w,height:h}}=plan;
 const surface=makeCanvasKitScaledSurface(kit,parent,w,h,scale);
 if(!surface)throw Error('Page source surface unavailable');
 const owned:Array<{delete():void}>=[surface];const saved=output.getSaveCount();
 try{
  const actor=surface.getCanvas();
  const render=(context?:{matrix:number[];isolated:boolean})=>{actor.clear(kit.TRANSPARENT);drawActor(actor,context);surface.flush();const image=surface.makeImageSnapshot();if(!image)throw Error('Page source snapshot unavailable');return image;};
  const shared=perFace?null:render();if(shared)owned.push(shared);
  const paint=()=>{const value=new kit.Paint();owned.push(value);return value;};
  const shade=(background:string,opacity:number,width=w,height=h)=>{const shader=gradient(kit,background,width,height);owned.push(shader);const brush=paint();brush.setShader(shader);brush.setAlphaf(opacity);output.drawRect(kit.LTRBRect(0,0,width,height),brush);};
  shade(p.castShadow,p.pageTurn.shadowOpacity);
  for(const face of plan.faces){
   const faceImage=perFace&&(!face.back||p.usesSegmentedCurl)?render(canvasKitPageBackdropContext(face)):shared;
   try{
   output.save();output.concat(face.matrix);
   if(face.back&&!p.usesSegmentedCurl&&p.pageTurn.shadowOpacity>0){const shadow=paint();shadow.setColor(kit.Color(0,0,0,p.pageTurn.shadowOpacity));const blur=kit.MaskFilter.MakeBlur(kit.BlurStyle.Normal,32,true);owned.push(blur);shadow.setMaskFilter(blur);output.drawRect(kit.LTRBRect(0,0,face.width,face.height),shadow);}
   output.clipRect(kit.LTRBRect(0,0,face.width,face.height),kit.ClipOp.Intersect,true);
   if(face.clip){const builder=new kit.PathBuilder();owned.push(builder);builder.addPolygon(face.clip.flat(),true);const path=builder.detach();owned.push(path);output.clipPath(path,kit.ClipOp.Intersect,true);}
   if(face.back&&!p.usesSegmentedCurl){shade(p.backShade,1,face.width,face.height);}
   else{
    const brush=paint();
    if(face.back){const base=paint();base.setColor(kit.Color(232,225,215,1));output.drawRect(kit.LTRBRect(0,0,face.width,face.height),base);brush.setAlphaf(.76);
     const s=.72,b=.82,r=.2126,g=.7152,bl=.0722;const filter=kit.ColorFilter.MakeMatrix([b*(r*(1-s)+s),b*g*(1-s),b*bl*(1-s),0,0,b*r*(1-s),b*(g*(1-s)+s),b*bl*(1-s),0,0,b*r*(1-s),b*g*(1-s),b*(bl*(1-s)+s),0,0,0,0,0,1,0]);owned.push(filter);brush.setColorFilter(filter);}
    output.drawImageRectOptions(faceImage!,canvasKitScaledSourceRect(kit,w,h,scale),kit.LTRBRect(-face.cropX,0,w-face.cropX,h),kit.FilterMode.Linear,kit.MipmapMode.None,brush);
    if(face.back){const tint=paint();tint.setColor(kit.Color(232,225,215,.34));output.drawRect(kit.LTRBRect(0,0,face.width,face.height),tint);}
    else if(p.usesSegmentedCurl){const black=paint();black.setColor(kit.Color(0,0,0,face.shade));output.drawRect(kit.LTRBRect(0,0,face.width,face.height),black);}
    else shade(p.frontShade,face.shade,face.width,face.height);
   }
   output.restore();
   }finally{if(perFace)faceImage?.delete();}
  }
 }finally{output.restoreToCount(saved);for(const resource of owned.reverse())resource.delete();}
}

/** Source actor coordinates map through the face's content crop BEFORE its
 * homography. Clipped fronts and filtered translucent backs are local roots. */
export function canvasKitPageBackdropContext(face:Face){
 const m=face.matrix;
 return {matrix:[m[0],m[1],m[2]-m[0]*face.cropX,m[3],m[4],m[5]-m[3]*face.cropX,m[6],m[7],m[8]-m[6]*face.cropX],isolated:face.back||!!face.clip};
}
