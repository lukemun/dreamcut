import {gpuWorkerBundle} from '@/lib/render/gpu-worker-bundle';
export const runtime='nodejs';
export async function GET(){
 try{return new Response(await gpuWorkerBundle(),{headers:{'Content-Type':'application/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
 catch(error){console.error('GPU worker build failed',error);return new Response('GPU worker unavailable',{status:503});}
}
