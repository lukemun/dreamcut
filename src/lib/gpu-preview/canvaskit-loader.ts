import type {CanvasKit,CanvasKitInitOptions} from 'canvaskit-wasm';

type Init=(options?:CanvasKitInitOptions)=>Promise<CanvasKit>;
let pending:Promise<CanvasKit>|undefined;
/** One pinned Wasm module per browser, with contexts owned by each compositor.
 * A failed load is retryable. Closing a player never destroys another's module.
 */
export function loadCanvasKit():Promise<CanvasKit>{
 if(pending)return pending;
 pending=(async()=>{
  const global=window as unknown as {CanvasKitInit?:Init};
  if(!global.CanvasKitInit)await new Promise<void>((resolve,reject)=>{
   const script=document.createElement('script');
   const timeout=setTimeout(()=>finish(Error('GPU rendering library load timed out')),20000);
   const finish=(error?:Error)=>{clearTimeout(timeout);script.onload=null;script.onerror=null;if(error){script.remove();reject(error);}else resolve();};
   script.src='/api/preview-runtime/canvaskit?asset=js';script.async=true;
   script.onload=()=>finish();script.onerror=()=>finish(Error('GPU rendering library could not load'));
   document.head.append(script);
  });
  if(!global.CanvasKitInit)throw Error('GPU rendering library did not initialize');
  return global.CanvasKitInit({locateFile:()=>'/api/preview-runtime/canvaskit?asset=wasm'});
 })().catch(error=>{pending=undefined;throw error;});
 return pending;
}
