/** Shared browser-compatible fallback for untagged YUV source metadata. */
export function sourceColorFallback(width:number,height:number):'bt709'|'smpte170m'{return width>=1280||height>576?'bt709':'smpte170m';}
export type NativeColor={matrix:number;primaries:number;transfer:number;range:number};
/** Resolve decoder metadata into explicit YUV/RGB → sRGB conversion parameters. */
export function nativeSourceColor(stream:Record<string,unknown>):NativeColor {
 const rgb=/^(?:gbr|rgb|bgr)/.test(String(stream.pix_fmt??''));
 // Untagged SD video is identified as SMPTE170M by the browser decoder.
 const fallback=rgb?1:(sourceColorFallback(Number(stream.width),Number(stream.height))==='bt709'?1:6);
 const matrix:Record<string,number>={gbr:0,rgb:0,bt709:1,fcc:4,bt470bg:5,smpte170m:6,smpte240m:7,ycgco:8,bt2020nc:9,bt2020c:10};
 const primaries:Record<string,number>={bt709:1,bt470m:4,bt470bg:5,smpte170m:6,smpte240m:7,film:8,bt2020:9,smpte428:10,smpte431:11,smpte432:12,ebu3213:22};
 const transfer:Record<string,number>={bt709:1,gamma22:4,gamma28:5,smpte170m:6,smpte240m:7,linear:8,log:9,log_sqrt:10,'iec61966-2-4':11,bt1361e:12,'iec61966-2-1':13,'bt2020-10':14,'bt2020-12':15,smpte2084:16,smpte428:17,'arib-std-b67':18};
 const read=(key:string,values:Record<string,number>,defaultValue:number)=>{
  const value=stream[key];if(value==null||value==='unknown'||value==='unspecified')return defaultValue;
  if(!(String(value) in values))throw Error(`Unsupported native ${key}: ${value}`);return values[String(value)];
 };
 // Match Chromium ColorSpace::GetTransferFunction's SDR display interpretation.
 // BT.709, SMPTE170M and BT.2020 SDR use sRGB there; applying their normative
 // transfer here changes the look before the shared compositor can grade it.
 // https://chromium.googlesource.com/chromium/src/+/lkgr/ui/gfx/color_space.cc
 const declaredTransfer=read('color_transfer',transfer,rgb?13:fallback);
 const displayTransfer=[1,6,14,15].includes(declaredTransfer)?13:declaredTransfer;
 return {matrix:read('color_space',matrix,rgb?0:fallback),primaries:read('color_primaries',primaries,fallback),transfer:displayTransfer,range:stream.color_range==='pc'?1:stream.color_range==='tv'?0:rgb?1:0};
}
