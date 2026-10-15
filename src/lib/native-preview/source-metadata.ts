import {nativeSourceColor,type NativeColor} from './source-color';
import {execFile} from 'node:child_process';import {promisify} from 'node:util';
const run=promisify(execFile),cache=new Map<string,{width:number;height:number;duration:number;codec?:'vp8'|'vp9';color:NativeColor}>();
export async function nativeSourceDimensions(file:string,identity:string){
 const key=`${file}:${identity}`,hit=cache.get(key);if(hit){cache.delete(key);cache.set(key,hit);return hit;}
 const {stdout}=await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,duration,pix_fmt,color_space,color_primaries,color_transfer,color_range:stream_side_data=rotation:format=duration,start_time','-of','json',file],{timeout:10000,maxBuffer:1048576});
 const probe=JSON.parse(stdout),stream=probe.streams?.[0];let width=Number(stream?.width),height=Number(stream?.height);
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1)throw Error('Invalid native source dimensions');
 const rotation=Number(stream.side_data_list?.find((s:{rotation?:number})=>s.rotation!==undefined)?.rotation??0);
 if(Math.abs(rotation)%180===90)[width,height]=[height,width];const duration=Number(stream.duration)||Math.max(0,Number(probe.format?.duration)-Number(probe.format?.start_time??0));const codec: 'vp8'|'vp9'|undefined=stream.codec_name==='vp8'||stream.codec_name==='vp9'?stream.codec_name:undefined;const result={width,height,duration,codec,color:nativeSourceColor(stream)};
 cache.set(key,result);while(cache.size>64)cache.delete(cache.keys().next().value!);return result;
}
