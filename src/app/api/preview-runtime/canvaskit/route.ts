import {readFile} from 'node:fs/promises';
import path from 'node:path';

export const runtime='nodejs';
/** Fixed installed assets only: no user paths, network downloads or project data. */
export async function GET(request:Request){
 const asset=new URL(request.url).searchParams.get('asset');
 if(asset!=='js'&&asset!=='wasm')return new Response('Unknown runtime asset',{status:404});
 try{
  // Read as an installed asset, not a JS/Wasm import: the latter asks the
  // application bundler to relink Emscripten's private import table.
  const data=await readFile(path.join(process.cwd(),'node_modules','canvaskit-wasm','bin',`canvaskit.${asset==='js'?'js':'wasm'}`));
  return new Response(new Uint8Array(data),{headers:{
   'Content-Type':asset==='js'?'application/javascript':'application/wasm',
   'Cache-Control':'private, max-age=0, must-revalidate',
   'X-Content-Type-Options':'nosniff',
  }});
 }catch{return new Response('GPU rendering library is not installed',{status:503});}
}
