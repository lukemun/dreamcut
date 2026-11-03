/** Convert the shared column-major clip-space quad into CanvasKit's row-major
 * projective matrix. Source coordinates are pixels, with Y pointing down.
 * Keep homogeneous W: tracked surfaces must not be flattened to bounding boxes.
 */
export function canvasKitSourceMatrix(
 transform:readonly number[],sourceWidth:number,sourceHeight:number,width:number,height:number,
):number[]{
 if(transform.length!==16||!transform.every(Number.isFinite)||
  ![sourceWidth,sourceHeight,width,height].every(v=>Number.isFinite(v)&&v>0))
  throw Error('Invalid CanvasKit source transform');
 // Source pixels -> local [-1,1], Y up -> homogeneous clip -> output pixels.
 const row=(i:number)=>[2*transform[i]/sourceWidth,-2*transform[4+i]/sourceHeight,
  -transform[i]+transform[4+i]+transform[12+i]];
 const x=row(0),y=row(1),w=row(3);
 return [...x.map((v,i)=>(v+w[i])*width/2),
  ...y.map((v,i)=>(w[i]-v)*height/2),...w];
}
