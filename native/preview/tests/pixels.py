"""Synthetic decode/seek/alpha proof; writes only disposable temporary fixtures."""
import json,struct,subprocess,tempfile,pathlib,time
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
 media=pathlib.Path(tmp)/'frames.nut'
 raw=b''.join(bytes([i*7,10,20])*16*16 for i in range(30))
 subprocess.run(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','16x16','-r','30','-i','pipe:0','-c:v','rawvideo',str(media)],input=raw,check=True)
 worker=subprocess.Popen([str(root/'target/release/dreamcut-native-preview')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 def ask(scene):
  worker.stdin.write((json.dumps(scene)+'\n').encode());worker.stdin.flush();head=worker.stdout.read(5);assert len(head)==5
  status=head[0];size=struct.unpack('<I',head[1:])[0];data=worker.stdout.read(size);assert len(data)==size
  assert status==0,data.decode(errors='replace');return data
 layer=dict(id="first",path=str(media),frame=0,fit='contain',alpha=False,scale=1,x=0,y=0,opacity=1,mask=[0,0,0,0])
 scene=dict(version=1,width=16,height=16,layers=[layer]);samples=[]
 for frame in [0,1,9,9,20,4,29,0]:
  layer['frame']=frame;start=time.monotonic();data=ask(scene);samples.append((frame,round((time.monotonic()-start)*1000,2)))
  assert data[:4]==bytes([frame*7,10,20,255]),(frame,list(data[:4]))
 layer['frame']=5;layer['mask']=[0,.5,0,0];data=ask(scene)
 assert data[:4]==bytes([35,10,20,255]);assert data[15*4:16*4]==bytes([0,0,0,255])
 # Atomic two-layer composition with different source times, including shared source identity.
 other=dict(layer,id="second",frame=10,mask=[0,0,0,0],opacity=.5);scene['layers']=[dict(layer,mask=[0,0,0,0]),other]
 data=ask(scene);assert data[:4]==bytes([53,10,20,255]),list(data[:4])
 # Non-30-fps and variable-frame-rate sources must use presentation timestamps.
 cfr24=pathlib.Path(tmp)/'24fps.nut'
 subprocess.run(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s','16x16','-r','24','-i','pipe:0','-c:v','rawvideo',str(cfr24)],input=raw,check=True)
 scene['layers']=[dict(layer,id='cfr24',path=str(cfr24),mask=[0,0,0,0])]
 for t,expected in [(0.04,0),(0.042,1),(0.084,2),(0.04,0),(0.5,12)]:
  scene['layers'][0].update(time=t,frame=int(t*30));data=ask(scene)
  assert data[:4]==bytes([expected*7,10,20,255]),('24fps',t,list(data[:4]))
 vfr=pathlib.Path(tmp)/'vfr.nut'
 subprocess.run(['ffmpeg','-v','error','-i',str(media),'-vf','select=eq(n\\,0)+eq(n\\,1)+eq(n\\,3)+eq(n\\,6)','-fps_mode','passthrough','-c:v','rawvideo',str(vfr)],check=True)
 scene['layers']=[dict(layer,id='vfr',path=str(vfr),mask=[0,0,0,0])]
 for t,expected in [(0.05,1),(0.11,3),(0.201,6),(0.01,0),(0.099,1)]:
  scene['layers'][0].update(time=t,frame=int(t*30));data=ask(scene)
  assert data[:4]==bytes([expected*7,10,20,255]),('vfr',t,list(data[:4]))
 # Reordered H.264 packets must select presentation order, not decode order.
 h264=pathlib.Path(tmp)/'bframes.mp4'
 subprocess.run(['ffmpeg','-v','error','-i',str(cfr24),'-c:v','libx264rgb','-crf','0','-bf','2',str(h264)],check=True)
 scene['layers']=[dict(layer,id='bframes',path=str(h264),mask=[0,0,0,0])]
 for t,expected in [(0.04,0),(0.25,6),(0.5,12),(0.084,2)]:
  scene['layers'][0].update(time=t,frame=int(t*30));data=ask(scene)
  assert data[:4]==bytes([expected*7,10,20,255]),('h264-presentation',t,list(data[:4]))
 # A reordered VFR tail may contain discard packets that are never displayed.
 # Seeking beyond EOF must hold the last decoded picture, not a phantom packet.
 tail=pathlib.Path(tmp)/'vfr-tail.mp4'
 subprocess.run(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=size=160x160:rate=10:duration=2','-vf','setpts=if(lt(N\\,10)\\,N/10/TB\\,(1+(N-10)/5)/TB)','-fps_mode','vfr','-c:v','libx264','-pix_fmt','yuv420p',str(tail)],check=True)
 decoded=subprocess.check_output(['ffmpeg','-v','error','-i',str(tail),'-pix_fmt','rgba','-fps_mode','passthrough','-f','rawvideo','pipe:1'])
 scene.update(width=160,height=160,layers=[dict(layer,id='vfr-tail',path=str(tail),time=10,mask=[0,0,0,0])])
 data=ask(scene);assert data==decoded[-160*160*4:],'Discard packet incorrectly became the last source frame'
 scene.update(width=16,height=16)
 # Container timestamp origins are not timeline source-in offsets.
 offset=pathlib.Path(tmp)/'offset.mp4'
 subprocess.run(['ffmpeg','-v','error','-i',str(h264),'-c','copy','-output_ts_offset','5',str(offset)],check=True)
 scene['layers']=[dict(layer,id='offset',path=str(offset),mask=[0,0,0,0])]
 for t,expected in [(0,0),(0.25,6),(0.5,12),(0.084,2)]:
  scene['layers'][0].update(time=t,frame=int(t*30));data=ask(scene)
  assert data[:4]==bytes([expected*7,10,20,255]),('nonzero-container-origin',t,list(data[:4]))
 # Host-shared clock positions preserve source identity without worker reprobes.
 for file,points in [(vfr,[(0.0,0,0),(0.1,2,3),(0.033333,1,1)]),(offset,[(0.25,6,6),(0.0,0,0),(0.5,12,12)])]:
  scene['layers']=[dict(layer,id='host-clock',path=str(file),mask=[0,0,0,0])]
  for pts,index,expected in points:
   scene['layers'][0].update(source_index=index,source_pts=pts,time=pts)
   data=ask(scene)
   assert data[:4]==bytes([expected*7,10,20,255]),('host-clock',str(file),pts,list(data[:4]))
 # Color management must retain straight alpha, not flatten transparent sources.
 alpha=pathlib.Path(tmp)/'alpha.webm'
 rgba=bytes([50,100,150,128])*16*16
 subprocess.run(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','rgba','-s','16x16','-r','30','-i','pipe:0','-c:v','libvpx-vp9','-lossless','1','-pix_fmt','yuva420p',str(alpha)],input=rgba,check=True)
 scene.update(transparent=True,layers=[dict(layer,id='alpha-color',path=str(alpha),codec='vp9',frame=0,time=0,mask=[0,0,0,0],alpha=True,color=dict(matrix=6,primaries=6,transfer=6,range=0))])
 data=ask(scene)
 assert all(abs(a-128)<=1 for a in data[3::4]),('color-managed-alpha',list(data[:4]))
 assert min(data[0:3])>20 and max(data[0:3])<230,('color-managed-visible-rgb',list(data[:4]))
 # VP8 and VP9 WebM need their matching alpha-capable decoder, independent of extension.
 for codec,encoder in [('vp8','libvpx'),('vp9','libvpx-vp9')]:
  encoded=pathlib.Path(tmp)/f'{codec}-transparent.mkv'
  subprocess.run(['ffmpeg','-v','error','-f','rawvideo','-pix_fmt','rgba','-s','16x16','-r','30','-i','pipe:0','-c:v',encoder,'-auto-alt-ref','0','-pix_fmt','yuva420p',str(encoded)],input=rgba*3,check=True)
  scene['layers']=[dict(layer,id=codec,path=str(encoded),codec=codec,frame=0,time=0,mask=[0,0,0,0],alpha=True,color=dict(matrix=6,primaries=6,transfer=6,range=0))]
  for t in [0,0.067,0.034,0]:
   scene['layers'][0]['time']=t
   data=ask(scene)
   assert all(abs(a-128)<=2 for a in data[3::4]),(codec,t,list(data[:4]))
   assert min(data[:3])>20 and max(data[:3])<230,(codec,t,list(data[:4]))
 worker.stdin.close();worker.wait(timeout=5)
 print(json.dumps({'passed':True,'sample_ms':samples,'checks':['exact CFR frame identity','forward/repeat/backward seeks','mask clipping','atomic two-layer blend','24fps timestamp selection','VFR timestamp selection','H264 presentation packet ordering','discard packet tail holds last displayed frame','nonzero container timestamp origin','host-shared VFR and nonzero-origin clock positions','color-managed straight alpha','VP8 and VP9 alpha across seeks without WebM extension']}))
