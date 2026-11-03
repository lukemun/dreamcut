"use client";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { Mic, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type VoiceBridge = { status():Promise<{ready:boolean}>; begin():Promise<void>; transcribe(audio:Uint8Array):Promise<string>; preview?(audio:Uint8Array):Promise<string>; cancel():Promise<void> };
export type VoiceState = 'idle'|'starting'|'recording'|'transcribing';
/** `finish` ends the recording and returns its text to the caller instead of `onText`; null when nothing was heard. */
export type VoiceHandle = { finish():Promise<string|null> };
const LIMIT_SECONDS=120, PREVIEW_EVERY_MS=900, BARS=14;
// PCM WAV is the narrow native boundary; no renderer-supplied paths or commands.
async function speechWav(chunks:Float32Array[],rate:number) {
  const total=chunks.reduce((sum,chunk)=>sum+chunk.length,0);
  const length=Math.min(16000*LIMIT_SECONDS,Math.max(1,Math.ceil(total/rate*16000)));
  const offline=new OfflineAudioContext(1,length,16000);
  const recorded=offline.createBuffer(1,Math.max(1,total),rate),channel=recorded.getChannelData(0);
  let offset=0;for(const chunk of chunks){channel.set(chunk,offset);offset+=chunk.length;}
  const source=offline.createBufferSource();source.buffer=recorded;source.connect(offline.destination);source.start();
  const samples=(await offline.startRendering()).getChannelData(0);
  const bytes=new Uint8Array(44+samples.length*2),view=new DataView(bytes.buffer);
  const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i++) bytes[offset+i]=value.charCodeAt(i);};
  text(0,'RIFF');view.setUint32(4,bytes.length-8,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);text(36,'data');view.setUint32(40,samples.length*2,true);
  samples.forEach((sample,i)=>view.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,sample))*32767),true));return bytes;
}
/** A scrolling row of level bars: the newest loudness enters on the right. */
function VoiceLevel({analyser}:{analyser:AnalyserNode}) {
  const bars=useRef<(HTMLSpanElement|null)[]>([]);
  useEffect(()=>{
    const samples=new Uint8Array(analyser.fftSize),levels=new Array<number>(BARS).fill(0);let frame=0,tick=0;
    const draw=()=>{
      frame=requestAnimationFrame(draw);if(++tick%3)return;
      analyser.getByteTimeDomainData(samples);
      let energy=0;for(const value of samples) energy+=((value-128)/128)**2;
      levels.shift();levels.push(Math.min(1,Math.sqrt(energy/samples.length)*5));
      levels.forEach((level,i)=>{const bar=bars.current[i];if(bar)bar.style.transform=`scaleY(${0.12+level*0.88})`;});
    };
    draw();return ()=>cancelAnimationFrame(frame);
  },[analyser]);
  return <span className="voice-level" aria-hidden>{Array.from({length:BARS},(_,i)=><span key={i} ref={node=>{bars.current[i]=node;}}/>)}</span>;
}
export function VoiceInput({projectId,disabled,onText,onPreview,onStateChange,handle,label='Dictate message'}:{projectId:string;disabled:boolean;onText:(text:string)=>void;onPreview?:(text:string)=>void;onStateChange?:(state:VoiceState)=>void;handle?:React.Ref<VoiceHandle>;label?:string}) {
  const [available,setAvailable]=useState(false),[ready,setReady]=useState(false);
  const [state,setStateValue]=useState<VoiceState>('idle');
  const [analyser,setAnalyser]=useState<AnalyserNode|null>(null);
  const [error,setError]=useState('');
  const active=useRef(false),stream=useRef<MediaStream|null>(null),audio=useRef<AudioContext|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null),epoch=useRef(0);
  const stopRef=useRef<(()=>void)|null>(null),finishing=useRef<((text:string|null)=>void)|null>(null);
  const callbacks=useRef({onText,onPreview,onStateChange});callbacks.current={onText,onPreview,onStateChange};
  const setState=(next:VoiceState)=>{setStateValue(next);callbacks.current.onStateChange?.(next);};
  const settle=(text:string|null)=>{const resolve=finishing.current;finishing.current=null;resolve?.(text);return Boolean(resolve);};
  const release=()=>{if(timer.current) clearTimeout(timer.current);timer.current=null;stopRef.current=null;stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;void audio.current?.close().catch(()=>{});audio.current=null;setAnalyser(null);};
  const cancel=()=>{epoch.current++;release();if(active.current)void window.dreamcutDesktop?.voice?.cancel().catch(()=>{});active.current=false;settle(null);callbacks.current.onPreview?.('');setState('idle');};
  useEffect(()=>{
    const current=++epoch.current;const bridge=window.dreamcutDesktop?.voice;setAvailable(Boolean(bridge));setReady(false);setStateValue('idle');setError('');
    void bridge?.status().then(value=>{if(epoch.current===current)setReady(value.ready);}).catch(()=>{});
    return ()=>{epoch.current++;release();if(active.current)void bridge?.cancel().catch(()=>{});active.current=false;settle(null);callbacks.current.onStateChange?.('idle');};
  },[projectId]);
  useImperativeHandle(handle,()=>({finish:()=>new Promise<string|null>(resolve=>{
    if(!active.current)return resolve(null);
    finishing.current?.(null);finishing.current=resolve;stopRef.current?.();
  })}),[]);
  const start=async()=>{
    const bridge=window.dreamcutDesktop?.voice;if(!bridge)return;
    const current=++epoch.current;active.current=true;setError('');setState('starting');
    try {
      await bridge.begin();if(epoch.current!==current)return;
      const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
      if(epoch.current!==current){media.getTracks().forEach(track=>track.stop());return;}
      stream.current=media;const context=new AudioContext();audio.current=context;
      const source=context.createMediaStreamSource(media),meter=context.createAnalyser();meter.fftSize=512;source.connect(meter);
      // Raw samples feed both the live preview and the final pass, so neither waits on a container decode.
      const capture=context.createScriptProcessor(4096,1,1),chunks:Float32Array[]=[],rate=context.sampleRate;let captured=0,recording=true;
      capture.onaudioprocess=event=>{if(!recording)return;const chunk=new Float32Array(event.inputBuffer.getChannelData(0));chunks.push(chunk);captured+=chunk.length;if(captured>=rate*LIMIT_SECONDS)stopRef.current?.();};
      source.connect(capture);capture.connect(context.destination);
      const stop=async()=>{
        if(!recording||epoch.current!==current)return;recording=false;release();setState('transcribing');
        try {
          const text=await bridge.transcribe(await speechWav(chunks,rate));if(epoch.current!==current)return;
          if(!settle(text))callbacks.current.onText(text);
        } catch(cause){if(epoch.current===current){settle(null);setError(cause instanceof Error?cause.message.replace(/^Error invoking remote method '[^']+':\s*(?:\w*Error:\s*)?/,''):'Could not transcribe this recording.');}}
        finally{if(epoch.current===current){active.current=false;callbacks.current.onPreview?.('');setState('idle');}}
      };
      stopRef.current=()=>void stop();
      const previewing=async()=>{
        while(recording&&epoch.current===current){
          await new Promise(resolve=>setTimeout(resolve,PREVIEW_EVERY_MS));
          if(!recording||epoch.current!==current||!bridge.preview||captured<rate*0.8)continue;
          const text=await bridge.preview(await speechWav(chunks,rate)).catch(()=>'');
          if(recording&&epoch.current===current&&text)callbacks.current.onPreview?.(text);
        }
      };
      if(context.state==='suspended')await context.resume();
      setAnalyser(meter);setState('recording');void previewing();
      timer.current=setTimeout(()=>stopRef.current?.(),LIMIT_SECONDS*1000+500);
    } catch {if(epoch.current===current){cancel();setError('Could not start dictation. Check microphone permission and the local voice bundle.');}}
  };
  if(!available)return null;
  const recording=state==='recording';
  return <div className={`flex min-w-0 items-center gap-1${state==='idle'?'':' shrink-0'}`}>
    <Button type="button" variant="ghost" size="icon-sm" aria-label={recording?'Stop dictation':label} title={ready?(recording?'Stop and insert text':'Dictate locally · English'):'Local voice bundle unavailable; prepare or reinstall it'} disabled={disabled||!ready||state==='starting'||state==='transcribing'} onClick={()=>recording?stopRef.current?.():void start()}>{recording?<Square size={14}/>:<Mic size={16}/>}</Button>
    {recording&&analyser&&<VoiceLevel analyser={analyser}/>}
    {state!=='idle'&&<>{!recording&&<span role="status" className="text-xs">{state==='starting'?'Opening mic…':'Transcribing…'}</span>}{recording&&<span role="status" className="sr-only">Listening</span>}<Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel dictation" onClick={cancel}><X size={14}/></Button></>}
    {error&&<span role="alert" className="text-xs break-words">{error}</span>}
  </div>;
}
