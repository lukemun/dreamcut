/** Temporary decoder ownership for optional overflow thumbnails. Playback can
 * use its live hold frame while this background capture is unavailable. */
export async function capturePreviewHold(source:string,time:number,signal:AbortSignal):Promise<string> {
 signal.throwIfAborted();
 const video=document.createElement('video');
 video.crossOrigin='anonymous';video.preload='auto';video.muted=true;video.playsInline=true;
 const wait=(event:string,begin:()=>void)=>new Promise<void>((resolve,reject)=>{
  const clear=()=>{clearTimeout(timeout);video.removeEventListener(event,done);video.removeEventListener('error',error);signal.removeEventListener('abort',abort);};
  const done=()=>{clear();resolve();},error=()=>{clear();reject(Error('Hold-frame media failed'));},abort=()=>{clear();reject(signal.reason);};
  const timeout=setTimeout(()=>{clear();reject(Error('Hold-frame capture timed out'));},10000);
  video.addEventListener(event,done,{once:true});video.addEventListener('error',error,{once:true});signal.addEventListener('abort',abort,{once:true});
  try{signal.throwIfAborted();begin();}catch(cause){clear();reject(cause);}
 });
 let canvas:HTMLCanvasElement|undefined;
 try{
  await wait('loadeddata',()=>{video.src=source;video.load();});
  const duration=Number.isFinite(video.duration)&&video.duration>0?video.duration:time;
  const target=Math.min(Math.max(0,time),Math.max(0,duration-.001));
  if(Math.abs(video.currentTime-target)>1e-6)await wait('seeked',()=>{video.currentTime=target;});
  signal.throwIfAborted();
  if(video.videoWidth<=0||video.videoHeight<=0)throw Error('Hold-frame dimensions unavailable');
  canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
  const context=canvas.getContext('2d');if(!context)throw Error('Hold-frame canvas unavailable');
  context.drawImage(video,0,0,canvas.width,canvas.height);
  // PNG encoding runs asynchronously instead of blocking Play with toDataURL.
  const blob=await new Promise<Blob>((resolve,reject)=>canvas!.toBlob(value=>value?resolve(value):reject(Error('Hold-frame encoding failed')),'image/png'));
  signal.throwIfAborted();
  return await new Promise<string>((resolve,reject)=>{
   const reader=new FileReader();
   const abort=()=>{reader.abort();reject(signal.reason);};
   const clear=()=>signal.removeEventListener('abort',abort);
   reader.onload=()=>{clear();resolve(String(reader.result));};reader.onerror=()=>{clear();reject(reader.error);};reader.onabort=clear;
   signal.addEventListener('abort',abort,{once:true});
   try{signal.throwIfAborted();reader.readAsDataURL(blob);}catch(cause){clear();reject(cause);}
  });
 }finally{
  video.pause();video.removeAttribute('src');video.load();
  if(canvas){canvas.width=1;canvas.height=1;}
 }
}
