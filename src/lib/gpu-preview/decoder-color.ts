import {sourceColorFallback} from '../native-preview/source-color';
import type {InputVideoTrack} from 'mediabunny';

/** Match the existing native/browser SD-vs-HD fallback rather than the demuxer's
 * unconditional BT.709 defaults. Declared metadata always wins. */
export function completeDecoderColor(config:VideoDecoderConfig,alpha=false):VideoDecoderConfig{
 const fallback=sourceColorFallback(config.codedWidth??0,config.codedHeight??0);
 const color=config.colorSpace;
 return {...config,colorSpace:{primaries:color?.primaries??(alpha?'bt709':fallback),transfer:color?.transfer??fallback,
  matrix:color?.matrix??fallback,fullRange:color?.fullRange??false}};
}
/** Mediabunny's public sink options do not expose color overrides. Adapt only its
 * public decoder-config method; bind all other methods to the original track.
 * This keeps the pinned dependency unmodified and preserves private ownership. */
export function colorNormalizedTrack(track:InputVideoTrack,alpha=false):InputVideoTrack{
 return new Proxy(track,{get(target,key){
  if(key==='getDecoderConfig')return async()=>{const config=await target.getDecoderConfig();return config?completeDecoderColor(config,alpha):null;};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
