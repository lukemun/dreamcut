import {recolorMatrix} from '../timeline/recolor';
const identity=recolorMatrix({color:'#ffffff',amount:0,preserveShading:true});
/** Source RGB effects after primary conversion, before geometry/group blur.
 * Matrices operate on unpremultiplied RGB and preserve the source alpha.
 */
export function canvasKitColorMatrices(recolor?:readonly number[],flash=0):number[][]{
 if(!Number.isFinite(flash)||flash<0||flash>1)throw Error('Invalid CanvasKit flash');
 const result:number[][]=[];
 if(recolor){
  if(recolor.length!==20||!recolor.every(Number.isFinite)||
   [3,8,13,15,16,17,19].some(i=>recolor[i]!==0)||recolor[18]!==1)
   throw Error('Invalid CanvasKit alpha-preserving recolor');
  if(recolor.some((v,i)=>v!==identity[i]))result.push([...recolor]);
 }
 if(flash>0)result.push([1-flash,0,0,0,flash,0,1-flash,0,0,flash,0,0,1-flash,0,flash,0,0,0,1,0]);
 return result;
}
