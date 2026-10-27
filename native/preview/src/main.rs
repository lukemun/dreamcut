//! Experimental framed-stdio compositor. The host resolves paths; no timeline writes.
use serde::Deserialize;
use std::{collections::HashMap, io::{self, BufRead, Read, Write}, process::{Child, ChildStdout, Command, Stdio}};
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Scene { version:u32, width:usize, height:usize, #[serde(default)] transparent:bool, #[serde(default)] retain_decoders:bool, #[serde(default)] retain_ids:Option<Vec<String>>, layers:Vec<Layer> }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Layer { source_index:Option<u32>, source_pts:Option<f64>, codec:Option<Codec>, color:Option<Color>, id:String, path:String, frame:u32, time:Option<f64>, fit:String, alpha:bool, scale:f64, x:f64, y:f64, opacity:f64, mask:[f64;4] }
#[derive(Deserialize,Debug)]
#[serde(rename_all="lowercase")]
enum Codec { Vp8, Vp9 }
#[derive(Deserialize,Debug)]
#[serde(deny_unknown_fields)]
struct Color {matrix:u8,primaries:u8,transfer:u8,range:u8}
struct Decoder { owner:String, child:Child, stdout:ChildStdout, next:u32, last:Option<(u32,Vec<u8>)> }
impl Drop for Decoder { fn drop(&mut self) {let _=self.child.kill();let _=self.child.wait();} }
impl Decoder {
 fn open(layer:&Layer,w:usize,h:usize,target:u32,seconds:f64)->Result<Self,String>{
  let mut cmd=Command::new("ffmpeg");cmd.args(["-hide_banner","-loglevel","error","-nostdin","-threads","1"]);
  if layer.alpha {
   match layer.codec {
    Some(Codec::Vp8)=>{cmd.args(["-c:v","libvpx"]);},
    Some(Codec::Vp9)=>{cmd.args(["-c:v","libvpx-vp9"]);},
    None=>{},
   }
  }
  cmd.args(["-ss",&format!("{:.9}",(seconds-0.000001).max(0.0)),"-i",&layer.path,"-an","-sn","-dn"]);
  let sizing=if layer.fit=="cover" {format!("scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},format=rgba")}
   else {format!("scale={w}:{h}:force_original_aspect_ratio=decrease,format=rgba,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black@0")};
  let filter=if let Some(c)=&layer.color {
   format!("zscale=matrixin={}:primariesin={}:transferin={}:rangein={}:matrix=0:primaries=1:transfer=13:range=1,format=gbrap,{}",c.matrix,c.primaries,c.transfer,c.range,sizing)
  } else {sizing};
  cmd.args(["-vf",&filter,"-filter_threads","1","-pix_fmt","rgba","-fps_mode","passthrough","-f","rawvideo","pipe:1"]);
  let mut child=cmd.stdout(Stdio::piped()).stderr(Stdio::inherit()).spawn().map_err(|e|e.to_string())?;
  let stdout=child.stdout.take().ok_or("No decoder output")?;
  Ok(Self{owner:layer.id.clone(),child,stdout,next:target,last:None})
 }
 fn frame(&mut self,target:u32,bytes:usize)->Result<&[u8],String>{
  if self.last.as_ref().map(|v|v.0)!=Some(target){
   while self.next<=target {
    let mut frame=vec![0u8;bytes];self.stdout.read_exact(&mut frame).map_err(|e|format!("Decoder ended before frame {target}: {e}"))?;
    self.last=Some((self.next,frame));self.next+=1;
   }
  }
  self.last.as_ref().filter(|v|v.0==target).map(|v|v.1.as_slice()).ok_or_else(||"Frame is not cached".into())
 }
}
fn validate(s:&Scene)->Result<(),String>{
 if s.version!=1 || s.width==0 || s.height==0 || s.width>4096 || s.height>4096 || s.layers.len()>8 {return Err("Unsupported scene bounds".into());}
 for l in &s.layers {
  match (l.source_index,l.source_pts) {
   (None,None)=>{},
   (Some(index),Some(pts)) if index<=1_080_000 && pts.is_finite() && (-36000.0..=36000.0).contains(&pts)=>{},
   _=>return Err("Invalid source clock position".into()),
  }
  if let Some(c)=&l.color {if ![0,1,4,5,6,7,8,9,10].contains(&c.matrix)||![1,4,5,6,7,8,9,10,11,12,22].contains(&c.primaries)||![1,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18].contains(&c.transfer)||c.range>1{return Err("Invalid color metadata".into());}}

  if l.path.is_empty() || !std::path::Path::new(&l.path).is_absolute() || l.frame>1_080_000 || l.time.is_some_and(|t|!t.is_finite()||t<0.0||t>36000.0) || !["contain","cover"].contains(&l.fit.as_str()) || !l.scale.is_finite() || l.scale<=0.0 || l.scale>10.0 || !l.x.is_finite() || !l.y.is_finite() || !l.opacity.is_finite() || !(0.0..=1.0).contains(&l.opacity) || l.mask.iter().any(|v|!v.is_finite() || !(0.0..=1.0).contains(v)){return Err("Invalid layer".into());}
 } Ok(())
}
fn blend(out:&mut [u8],src:&[u8],w:usize,h:usize,l:&Layer){
 for y in 0..h {for x in 0..w {
  if (x as f64)<l.mask[3]*w as f64 || (x as f64)>=(1.0-l.mask[1])*w as f64 || (y as f64)<l.mask[0]*h as f64 || (y as f64)>=(1.0-l.mask[2])*h as f64 {continue;}
  let sx=((x as f64+0.5-w as f64/2.0-l.x*w as f64/2.0)/l.scale+w as f64/2.0).floor();
  let sy=((y as f64+0.5-h as f64/2.0-l.y*h as f64/2.0)/l.scale+h as f64/2.0).floor();
  if sx<0.0 || sy<0.0 || sx>=w as f64 || sy>=h as f64 {continue;}
  let si=(sy as usize*w+sx as usize)*4;let di=(y*w+x)*4;let a=src[si+3] as f64/255.0*l.opacity;
  let da=out[di+3] as f64/255.0;let oa=a+da*(1.0-a);
  for c in 0..3 {out[di+c]=if oa>0.0 {((src[si+c] as f64*a+out[di+c] as f64*da*(1.0-a))/oa).round() as u8} else {0};}
  out[di+3]=(oa*255.0).round() as u8;
 }}
}
fn timestamp_origin(data:&serde_json::Value)->f64{
 data["format"]["start_time"].as_str().and_then(|t|t.parse::<f64>().ok()).filter(|t|t.is_finite()).unwrap_or(0.0)
}
fn timestamps(path:&str)->Result<Vec<f64>,String>{
 // Presentation packets avoid decoding an entire high-resolution source just
 // to build its clock. Unknown codecs or ambiguous packet clocks keep the
 // decoded-frame oracle rather than guessing.
 let output=Command::new("ffprobe").args(["-v","error","-select_streams","v:0","-show_entries","packet=pts_time,flags:stream=codec_name,nb_frames:format=start_time","-of","json",path]).output().map_err(|e|e.to_string())?;
 if output.status.success(){
  if let Ok(data)=serde_json::from_slice::<serde_json::Value>(&output.stdout){
   let origin=timestamp_origin(&data);
   let codec=data["streams"][0]["codec_name"].as_str().unwrap_or("");
   if ["h264","hevc","vp8","vp9","rawvideo","png","mjpeg"].contains(&codec){
    if let Some(packets)=data["packets"].as_array(){
     let times:Option<Vec<f64>>=packets.iter().map(|p|p["pts_time"].as_str()?.parse::<f64>().ok().filter(|t|t.is_finite()).map(|t|t-origin)).collect();
     if let Some(mut times)=times {
      times.sort_by(|a,b|a.total_cmp(b));
      let count=data["streams"][0]["nb_frames"].as_str().and_then(|n|n.parse::<usize>().ok());
      if !packets.iter().any(|p|p["flags"].as_str().unwrap_or("").contains('D')) && !times.is_empty() && count.is_none_or(|n|n==times.len()) && times.windows(2).all(|w|w[1]>w[0]) {return Ok(times);}
     }
    }
   }
  }
 }
 let output=Command::new("ffprobe").args(["-v","error","-select_streams","v:0","-show_entries","frame=best_effort_timestamp_time:format=start_time","-of","json",path]).output().map_err(|e|e.to_string())?;
 if !output.status.success(){return Err("Cannot inspect source timestamps".into());}
 let data:serde_json::Value=serde_json::from_slice(&output.stdout).map_err(|e|e.to_string())?;
 let origin=timestamp_origin(&data);
 let frames=data["frames"].as_array().ok_or("Missing source timestamps")?;
 let mut times=Vec::with_capacity(frames.len());
 for frame in frames {let t=frame["best_effort_timestamp_time"].as_str().and_then(|t|t.parse::<f64>().ok()).ok_or("Invalid source timestamp")?;if !t.is_finite(){return Err("Nonfinite source timestamp".into());}times.push(t-origin);}
 if times.is_empty() || times.windows(2).any(|w|w[1]<w[0]){return Err("Unordered or empty source timestamps".into());}
 Ok(times)
}
fn source_index(times:&[f64],time:f64)->usize{times.partition_point(|t|*t<=time+0.000001).saturating_sub(1)}
// Source-only batches already have their target size/fit from FFmpeg. Avoid
// per-pixel floating-point geometry and blending when no compositing is requested.
fn identity_source(l:&Layer)->bool {
 l.scale==1.0 && l.x==0.0 && l.y==0.0 && l.opacity==1.0 && l.mask==[0.0;4]
}
fn copy_source(source:&[u8])->Vec<u8>{
 let mut out=source.to_vec();
 // Match the compositor's canonical zero RGB for fully transparent pixels.
 for p in out.chunks_exact_mut(4){if p[3]==0 {p[0]=0;p[1]=0;p[2]=0;}}
 out
}
fn render(s:&Scene,cache:&mut HashMap<String,Decoder>,clocks:&mut HashMap<String,Vec<f64>>)->Result<Vec<u8>,String>{
 validate(s)?;let bytes=s.width*s.height*4;let mut out=vec![0;bytes];if !s.transparent {for p in out.chunks_exact_mut(4){p[3]=255;}}
 let key=|l:&Layer|format!("{}|{}|{}|{}|{}|{}",l.id,l.path,s.width,s.height,l.fit,format!("{}:{:?}:{:?}",l.alpha,l.color,l.codec));
 let active:Vec<_>=s.layers.iter().map(key).collect();if let Some(ids)=&s.retain_ids {if ids.len()>8{return Err("Too many retained sources".into());}cache.retain(|_,d|ids.contains(&d.owner));clocks.retain(|k,_|cache.contains_key(k));}
 if !s.retain_decoders {cache.retain(|k,_|active.contains(k));clocks.retain(|k,_|active.contains(k));}
 // Bound retained native frame sources across successive batch requests.
 if s.retain_decoders {while cache.len()+active.iter().filter(|k|!cache.contains_key(*k)).count()>8 {
  if let Some(old)=cache.keys().find(|k|!active.contains(k)).cloned(){clocks.remove(&old);cache.remove(&old);}else{break;}
 }}
 for l in &s.layers {
  let k=key(l);
  let (target,pts)=if let (Some(index),Some(pts))=(l.source_index,l.source_pts){(index,pts)}else{
   if !clocks.contains_key(&k){clocks.insert(k.clone(),timestamps(&l.path)?);}
   let times=&clocks[&k];let index=source_index(times,l.time.unwrap_or(l.frame as f64/30.0));(index as u32,times[index])
  };
  let reset=cache.get(&k).map(|d|target<d.next.saturating_sub(1) || target>d.next+90).unwrap_or(true);
  if reset {cache.remove(&k);cache.insert(k.clone(),Decoder::open(l,s.width,s.height,target,pts)?);}
  let source=cache.get_mut(&k).unwrap().frame(target,bytes)?;
  if s.transparent && s.layers.len()==1 && identity_source(l){return Ok(copy_source(source));}
  blend(&mut out,source,s.width,s.height,l);
 } Ok(out)
}
fn main(){
 let input=io::stdin();let mut output=io::stdout().lock();let mut cache=HashMap::new();let mut clocks=HashMap::new();
 for line in input.lock().lines(){
  let result=line.map_err(|e|e.to_string()).and_then(|s|{if s.len()>1_048_576{return Err("Scene too large".into());}serde_json::from_str::<Scene>(&s).map_err(|e|e.to_string())}).and_then(|s|render(&s,&mut cache,&mut clocks));
  let (status,bytes)=match result {Ok(bytes)=>(0u8,bytes),Err(e)=>{cache.clear();clocks.clear();(1u8,e.into_bytes())}};
  if output.write_all(&[status]).and_then(|_|output.write_all(&(bytes.len() as u32).to_le_bytes())).and_then(|_|output.write_all(&bytes)).and_then(|_|output.flush()).is_err(){break;}
 }
}
#[cfg(test)]mod tests{
 use super::*;
 fn layer()->Layer{Layer{source_index:None,source_pts:None,codec:None,color:None,id:"fixture".into(),path:"/fixture".into(),frame:0,time:None,fit:"contain".into(),alpha:true,scale:1.0,x:0.0,y:0.0,opacity:1.0,mask:[0.0;4]}}
 #[test]fn alpha_and_mask(){let mut l=layer();let src=[255,0,0,128,255,0,0,255];let mut out=[0,0,0,255,0,0,0,255];l.mask[1]=0.5;blend(&mut out,&src,2,1,&l);assert_eq!(out,[128,0,0,255,0,0,0,255]);}
 #[test]fn source_copy_matches_compositor_for_every_alpha(){
  let l=layer();let mut source=Vec::new();
  for alpha in 0..=255u8 {source.extend_from_slice(&[alpha.wrapping_mul(3),73,201,alpha]);}
  let mut expected=vec![0u8;source.len()];blend(&mut expected,&source,256,1,&l);
  assert_eq!(copy_source(&source),expected);
  assert!(identity_source(&l));
  let mut changed=layer();changed.opacity=0.9;assert!(!identity_source(&changed));
  changed=layer();changed.scale=1.01;assert!(!identity_source(&changed));
  changed=layer();changed.x=0.01;assert!(!identity_source(&changed));
  changed=layer();changed.y=0.01;assert!(!identity_source(&changed));
  changed=layer();changed.mask[0]=0.01;assert!(!identity_source(&changed));
 }
 #[test]fn timestamp_selection(){assert_eq!(source_index(&[0.0,0.04,0.1,0.2],0.099),1);assert_eq!(source_index(&[0.0,0.04,0.1,0.2],0.1),2);}
 #[test]fn preserves_straight_alpha(){let l=layer();let mut out=[0,0,0,0];blend(&mut out,&[200,80,10,128],1,1,&l);assert_eq!(out,[200,80,10,128]);}
 #[test]fn invalid_bounds(){assert!(validate(&Scene{version:1,transparent:false,retain_decoders:false,retain_ids:None,width:4097,height:1080,layers:vec![]}).is_err());let mut l=layer();l.scale=f64::NAN;assert!(validate(&Scene{version:1,transparent:false,retain_decoders:false,retain_ids:None,width:2,height:2,layers:vec![l]}).is_err());}
 #[test]fn transparent_preserves_background(){let l=layer();let mut out=[3,4,5,255];blend(&mut out,&[255,0,0,0],1,1,&l);assert_eq!(out,[3,4,5,255]);}
}
