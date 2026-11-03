/** Detached local worker. This module is bundled into an immutable runtime generation. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {PreparedPreviewJobs} from '../local-store/prepared-preview-jobs';
import {projectDir} from '../local-store/paths';
import {resolveRenderAsset,createRenderAssetHasher} from '../local-store/render-assets';
import {streamFileResponse} from '../local-store/stream-file';
import {MEDIA_CONTENT_TYPES} from '../local-store/media';
import {renderPreparedSections,assemblePreparedSections} from './prepared-sections';
import {renderBrowserVideo,VideoRenderSession} from './browser-renderer';
import {preparedPlaybackSources,preparedAudioSources,preparedRangeHasAudio} from './prepared-sources';
import {preparedRasterScale} from '../timeline/prepared-preview';
import {setNativeBinary} from '../native-preview/worker';
import {preparedBackendOptions} from './prepared-backend';
import {handleNativeFrames,releaseNativeFrames} from '../native-preview/frame-handler';
const directory=process.argv[2],token=process.argv[3];
if (!directory || !token) throw new Error('Worker requires a runtime directory and control token');
setNativeBinary(path.join(directory,'native-preview'));
const lease=path.join(directory,'worker.pid');
try {
  const pid=Number(fs.readFileSync(lease,'utf8'));
  try {process.kill(pid,0);throw new Error('Preparation worker is already running');}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH')throw error;fs.rmSync(lease);}
} catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
fs.writeFileSync(lease,String(process.pid),{flag:'wx'});
process.on('exit',()=>{try{if(fs.readFileSync(lease,'utf8')===String(process.pid))fs.rmSync(lease);}catch{}});
const version=JSON.parse(fs.readFileSync(path.join(directory,'runtime.json'),'utf8')).version;
/** Identifies the installed Chrome so restarted workers reuse jobs from the same browser. A
 * random fallback would make every job stale after a restart (it did on Linux CI). */
function installedBrowserVersion():string{
  try {return createHash('sha256').update(fs.readFileSync('/Applications/Google Chrome.app/Contents/Info.plist')).digest('hex');}
  catch {/* Not macOS: identify the executable instead. */}
  for(const executable of ['/opt/google/chrome/chrome','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']){
    try {const stat=fs.statSync(executable);return createHash('sha256').update(`${executable}:${stat.size}:${stat.mtimeMs}`).digest('hex');}
    catch {/* Try the next install location. */}
  }
  return token!;
}
const browserVersion=installedBrowserVersion();
const fingerprint=createRenderAssetHasher(version+browserVersion);
let jobs:PreparedPreviewJobs;
let origin='';
let lastRequest=Date.now();
const remap=(value:unknown,from:string):any=>{
  if(Array.isArray(value))return value.map(v=>remap(v,from));
  if(value && typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remap(v,from)]));
  if(typeof value==='string' && /^(https?:|\/)/.test(value)) {
    const url=new URL(value,from);if(url.origin===new URL(from).origin)return origin+url.pathname;
  }
  return value;
};
const server=http.createServer(async(request,response)=>{
  try {
    lastRequest=Date.now();
    const url=new URL(request.url!,origin);
    if(url.pathname==='/control') {
      if(request.headers.authorization!==`Bearer ${token}`) {response.writeHead(403).end();return;}
      let body='';for await(const chunk of request){body+=chunk;if(body.length>2_000_000)throw new Error('Request too large');}
      const command=JSON.parse(body);let result;
      if(command.action==='ping')result={pid:process.pid,version};
      else if(command.action==='start')result=jobs.start(command.project,command.owner,command.input,command.origin,command.sequence);
      else if(command.action==='status')result=jobs.status(command.project,command.id);
      else if(command.action==='file')result=jobs.file(command.project,command.id);
      else if(command.action==='cancel'){jobs.cancel(command.project,command.id);result={ok:true};}
      else throw new Error('Unknown worker command');
      response.setHeader('Content-Type','application/json');response.end(JSON.stringify(result));return;
    }
    const nativePath=url.pathname.match(/^\/api\/projects\/([^/]+)\/native-frames$/);
    if(nativePath && ['POST','DELETE'].includes(request.method??'')) {
      let body='';for await(const chunk of request){body+=chunk;if(body.length>65536)throw new Error('Request too large');}
      const headers=new Headers();for(const [key,value] of Object.entries(request.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
      const input=new Request(url,{method:request.method,headers,body});
      const handler=request.method==='POST'?handleNativeFrames:releaseNativeFrames;
      const result=await handler(input,{params:Promise.resolve({projectId:decodeURIComponent(nativePath[1])})});
      response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));return;
    }
    // No arbitrary remote proxy or general filesystem endpoint.
    if(!['GET','HEAD'].includes(request.method??'')) {response.writeHead(405).end();return;}
    let file:string;
    if(url.pathname==='/render-frame')file=path.join(directory,'index.html');
    else if(url.pathname==='/renderer.js' || url.pathname==='/renderer.css')file=path.join(directory,path.basename(url.pathname));
    else if(url.pathname.startsWith('/fonts/'))file=resolveRenderAsset(url.pathname,origin,directory);
    else file=resolveRenderAsset(url.pathname,origin);
    const extension=path.extname(file).toLowerCase();
    const contentType=({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff'} as Record<string,string>)[extension]??MEDIA_CONTENT_TYPES[extension]??'application/octet-stream';
    const headers=new Headers();for(const [key,value] of Object.entries(request.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
    const result=streamFileResponse(file,new Request(url,{headers}),{contentType});
    response.writeHead(result.status,Object.fromEntries(result.headers));
    if(request.method==='HEAD'){await result.body?.cancel();response.end();}
    else if(result.body)Readable.fromWeb(result.body as any).pipe(response);else response.end();
  } catch(error) {response.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:error instanceof Error?error.message:String(error)}));}
});
server.listen(0,'127.0.0.1',()=>{
  origin=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  jobs=new PreparedPreviewJobs({journal:path.join(directory,'jobs.json'),fingerprint:(input,base)=>fingerprint(input.inputProps,base),
    directory:project=>path.join(projectDir(project),'instruments','.prepared-playback',version),
    render:async(input,base,output,signal,onProgress,onComplete,project)=>{
      const previewInput=preparedPlaybackSources(input), audioInput=preparedAudioSources(input);
      const sessions=Array.from({length:2},()=>({capture:new VideoRenderSession(),leased:false}));
      const withSession=async(work:(capture:VideoRenderSession)=>Promise<void>)=>{
        const slot=sessions.find(slot=>!slot.leased);if(!slot)throw Error('Preparation capture capacity exceeded');
        slot.leased=true;try{await work(slot.capture);}finally{slot.leased=false;}
      };
      const render=async(frameRange:[number,number],outputLocation:string,pcmOutputLocation:string|undefined,progress:(p:number)=>void,audioOnly=false,session?:VideoRenderSession)=> {
        if(audioOnly && !preparedRangeHasAudio(audioInput,frameRange)) {
          fs.writeFileSync(outputLocation,Buffer.alloc(Math.round((frameRange[1]-frameRange[0]+1)*48000/input.fps)*8));
          progress(1);return;
        }
        await renderBrowserVideo({session,pictureOnly:!audioOnly,...input,...preparedBackendOptions(input,project,audioOnly),inputProps:remap(audioOnly ? audioInput.inputProps : previewInput.inputProps,base),baseUrl:origin,outputLocation,pcmOutputLocation,frameRange,signal,onProgress:progress,audioOnly,concurrency:1,pixelScale:preparedRasterScale(input)});
      };
      try { await renderPreparedSections(input,output,signal,onProgress,{
        concurrency:2,
        fingerprint:scoped=>fingerprint(scoped.inputProps,base),
        render:(range,video,pcm,progress)=>withSession(async session=>{
          // Picture proxies are silent. Never let their selection change audio.
          await render(range,video,undefined,p=>progress(p*.5),false,session);
          await render(range,pcm!,undefined,p=>progress(.5+p*.5),true,session);
        }),
        renderAudio:(range,pcm,progress)=>withSession(session=>render(range,pcm,undefined,progress,true,session)),
        assemble:(files,file)=>assemblePreparedSections(files,file,((input.frameRange?input.frameRange[1]-input.frameRange[0]+1:input.durationInFrames)/input.fps),signal),
      });onComplete(); } finally { await Promise.all(sessions.map(slot=>slot.capture.close())); }
    },
  });
  const file=path.join(directory,'process.json');fs.writeFileSync(file+'.tmp',JSON.stringify({origin,pid:process.pid,token,version}));fs.renameSync(file+'.tmp',file);
});

// Reconnect from the journal on demand after ten idle minutes.
setInterval(()=>{if(jobs && !jobs.isBusy() && Date.now()-lastRequest>600_000)server.close(()=>process.exit(0));},30_000).unref();
