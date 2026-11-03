import type {CanvasKit,Canvas} from 'canvaskit-wasm';
export type GpuBoundaryWash={opacity:number;background:string};
export type CanvasKitBoundaryPlan={
 clip?:readonly[number,number,number,number];
 wash?:{opacity:number;colors:readonly string[];positions:readonly number[];start:readonly[number,number];end:readonly[number,number]};
};
/** Only known source-free CSS color forms are accepted. No browser DOM, remote
 * images, mutable CSS resolution, or silent fallback enters a complete packet. */
export function canvasKitBoundaryPlan(layer:{boundaryClip?:readonly[number,number,number,number];boundaryWash?:GpuBoundaryWash},width:number,height:number):CanvasKitBoundaryPlan{
 if(![width,height].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid boundary canvas dimensions');
 const clip=layer.boundaryClip;
 if(clip&&(clip.length!==4||!clip.every(Number.isFinite)||clip[2]<clip[0]||clip[3]<clip[1]))throw Error('Invalid boundary clip');
 const wash=layer.boundaryWash;if(!wash)return {clip};
 if(!Number.isFinite(wash.opacity)||wash.opacity<0||wash.opacity>1)throw Error('Invalid boundary wash opacity');
 if(/^#[0-9a-f]{6}$/i.test(wash.background))return {clip,wash:{opacity:wash.opacity,colors:[wash.background],positions:[0],start:[0,0],end:[width,0]}};
 const gradient=/^linear-gradient\((-?\d+(?:\.\d+)?)deg, (.+)\)$/.exec(wash.background);
 if(!gradient)throw Error('Unsupported boundary wash background');
 const angle=Number(gradient[1])*Math.PI/180;
 const stops=gradient[2].split(', ').map(stop=>{
  const match=/^(#[0-9a-f]{6}) (\d+(?:\.\d+)?)%$/i.exec(stop);
  if(!match)throw Error('Unsupported boundary gradient stop');
  return {color:match[1],position:Number(match[2])/100};
 });
 if(stops.length<2||stops.some((stop,i)=>stop.position<0||stop.position>1||(i>0&&stop.position<stops[i-1].position)))throw Error('Invalid boundary gradient positions');
 const dx=Math.sin(angle),dy=-Math.cos(angle),length=Math.abs(width*dx)+Math.abs(height*dy);
 return {clip,wash:{opacity:wash.opacity,colors:stops.map(stop=>stop.color),positions:stops.map(stop=>stop.position),start:[width/2-dx*length/2,height/2-dy*length/2],end:[width/2+dx*length/2,height/2+dy*length/2]}};
}

/** Apply before any actor transform. Pair caller save/restore around this clip. */
export function canvasKitClipBoundary(kit:CanvasKit,canvas:Canvas,plan:CanvasKitBoundaryPlan){
 if(plan.clip)canvas.clipRect(kit.LTRBRect(...plan.clip),kit.ClipOp.Intersect,true);
}
/** Draw after actor state is completely restored. Wash covers the composition,
 * independent of incoming source opacity/alpha/clip and before higher lanes. */
export function canvasKitDrawBoundaryWash(kit:CanvasKit,canvas:Canvas,plan:CanvasKitBoundaryPlan,width:number,height:number){
 const wash=plan.wash;if(!wash||wash.opacity===0)return;
 const paint=new kit.Paint();let shader:ReturnType<CanvasKit['Shader']['MakeLinearGradient']>|null=null;
 try{
  paint.setAlphaf(wash.opacity);
  const colors=wash.colors.map(color=>kit.Color(parseInt(color.slice(1,3),16),parseInt(color.slice(3,5),16),parseInt(color.slice(5,7),16),1));
  if(colors.length===1){paint.setColor(colors[0]);paint.setAlphaf(wash.opacity);}
  else{shader=kit.Shader.MakeLinearGradient([...wash.start],[...wash.end],colors,[...wash.positions],kit.TileMode.Clamp);if(!shader)throw Error('Boundary gradient allocation failed');paint.setShader(shader);}
  canvas.drawRect(kit.LTRBRect(0,0,width,height),paint);
 }finally{shader?.delete();paint.delete();}
}
