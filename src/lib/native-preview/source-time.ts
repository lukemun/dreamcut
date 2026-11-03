import {originalMediaSampleUs} from '@/lib/timeline/source-sampling';
import {COMPOSITION_FPS} from '@/lib/timeline/frame-quantization';
/** Match the media component's looping source window, including natural EOF. */
export function nativeLoopTime(time:number,duration:number,loop?:{start:number;end?:number}):number {
 if(!loop)return time;
 const end=Math.min(loop.end??Infinity,duration),span=end-loop.start;
 if(!Number.isFinite(span)||span<=0)throw Error('Invalid native loop window');
 return loop.start+Math.max(0,time-loop.start)%span;
}

/** Native decoding reads the original, so it samples where the 30 fps preview proxy's frame
 * came from (timeline/source-sampling.ts). One microsecond early: nativeClockPosition adds it
 * back, and a source frame starting exactly on the slot midpoint stays in the next slot. */
export function nativeSampleTime(time:number,end:number,fps=COMPOSITION_FPS,proxyFps:number|null=COMPOSITION_FPS):number {
 if(proxyFps!==fps)return time;
 return Math.min(end-.00001,Math.max(0,originalMediaSampleUs(time,fps,proxyFps)-1)/1_000_000);
}
