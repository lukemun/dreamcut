import test from 'node:test';
import assert from 'node:assert/strict';
import CanvasKitInit from 'canvaskit-wasm';
import {CanvasKitColorShaderCache,makeCanvasKitLutShader,canvasKitGradeTableBytes,canvasKitLutAtlas,makeCanvasKitChromaShader,makeCanvasKitGradeShader} from '../gpu-preview/canvaskit-grade';
import {buildColorGradeFilterDescriptor,readColorGradeProps} from '../timeline/color-grade';
import {gpuGradeTransferTables} from '../gpu-preview/color-grade';
import {parseCubeLut} from '../timeline/cube-lut';
const kit=CanvasKitInit();
const grade=(props:Record<string,unknown>)=>buildColorGradeFilterDescriptor(readColorGradeProps({color_grade_model:"linear-srgb-v1",...props}),{includeIdentity:true})!;
test('CanvasKit grade table uses the shared byte transfer values for every channel and stage',()=>{
 const g=grade({grade_exposure_ev:1.2,grade_contrast:1.3}),shared=gpuGradeTransferTables(g),bytes=canvasKitGradeTableBytes(g);
 assert.equal(bytes.length,256*13*4);
 for(let i=0;i<256*13;i++)assert.deepEqual([...bytes.slice(i*4,i*4+4)],[Math.round(shared[i]*255),Math.round(shared[i]*255),Math.round(shared[i]*255),255]);
});
test('CanvasKit compiles and executes grade and chroma shaders, preserving source alpha',async()=>{
 const k=await kit;const surface=k.MakeSurface(3,1)!;
 const image=k.MakeImage({width:3,height:1,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB},new Uint8Array([0,255,0,255,180,20,20,128,0,0,0,0]),12)!;
 const source=image.makeShaderOptions(k.TileMode.Clamp,k.TileMode.Clamp,k.FilterMode.Nearest,k.MipmapMode.None),paint=new k.Paint();
 try{
  const keyed=makeCanvasKitChromaShader(k,source,{color:'#00ff00',tolerance:.18,softness:.08,spill:.25});
  paint.setShader(keyed.shader);surface.getCanvas().drawPaint(paint);surface.flush();
  const info={width:3,height:1,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB};
  const pixels=surface.getCanvas().readPixels(0,0,info)!;
  assert.equal(pixels[3],0);assert.equal(pixels[7],128);assert.equal(pixels[11],0);
  keyed.delete();keyed.delete();
  const grading=makeCanvasKitGradeShader(k,source,grade({grade_exposure_ev:1}));
  surface.getCanvas().clear(k.TRANSPARENT);paint.setShader(grading.shader);surface.getCanvas().drawPaint(paint);surface.flush();
  const graded=surface.getCanvas().readPixels(0,0,info)!;
  assert.equal(graded[7],128);assert.equal(graded[11],0);assert.ok(graded[4]>180);
  grading.delete();grading.delete();
 }finally{paint.delete();source.delete();image.delete();surface.delete();}
});
test('LUT upload atlas preserves red-fastest RGB cube order and domains',()=>{
 const parsed=parseCubeLut('LUT_3D_SIZE 2\nDOMAIN_MIN -1 -2 -3\nDOMAIN_MAX 1 2 3\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1');
 const atlas=canvasKitLutAtlas(parsed);assert.equal(atlas.width,2);assert.equal(atlas.height,4);
 assert.deepEqual([...atlas.bytes.slice(4,8)],[255,0,0,255]);assert.deepEqual([...atlas.bytes.slice(16,20)],[0,0,255,255]);assert.deepEqual(atlas.domainMin,[-1,-2,-3]);
});

test('CanvasKit LUT shader executes continuous grade and intensity with alpha preserved',async()=>{
 const k=await kit,surface=k.MakeSurface(1,1)!,paint=new k.Paint();
 const image=k.MakeImage({width:1,height:1,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB},new Uint8Array([100,180,30,128]),4)!;
 const source=image.makeShaderOptions(k.TileMode.Clamp,k.TileMode.Clamp,k.FilterMode.Nearest,k.MipmapMode.None);
 const cube=parseCubeLut('LUT_3D_SIZE 2\n'+Array(8).fill('1 0 0').join('\n'));
 try{
  for(const intensity of [0,1]){
   const lease=makeCanvasKitLutShader(k,source,grade({}),cube,intensity);
   surface.getCanvas().clear(k.TRANSPARENT);paint.setShader(lease.shader);surface.getCanvas().drawPaint(paint);surface.flush();
   const pixels=surface.getCanvas().readPixels(0,0,{width:1,height:1,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
   assert.equal(pixels[3],128);
   if(intensity===1)assert.deepEqual([...pixels],[255,0,0,128]);else assert.ok(Math.abs(pixels[1]-180)<=2);
   lease.delete();lease.delete();
  }
 }finally{paint.delete();source.delete();image.delete();surface.delete();}
});

test('session color cache compiles once, reuses uploads and retains pinned resources until release',async()=>{
 const k=await kit;let compiles=0,uploads=0;
 const instrumented=Object.create(k) as typeof k;
 Object.defineProperty(instrumented,'RuntimeEffect',{value:{...k.RuntimeEffect,Make:(...args:Parameters<typeof k.RuntimeEffect.Make>)=>{compiles++;return k.RuntimeEffect.Make(...args);}}});
 instrumented.MakeImage=(...args:Parameters<typeof k.MakeImage>)=>{uploads++;return k.MakeImage(...args);};
 const image=k.MakeImage({width:1,height:1,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB},new Uint8Array([100,100,100,255]),4)!;
 const source=image.makeShaderOptions(k.TileMode.Clamp,k.TileMode.Clamp,k.FilterMode.Nearest,k.MipmapMode.None);
 const cache=new CanvasKitColorShaderCache(instrumented,256*13*4);
 try{
  const first=cache.grade(source,grade({grade_exposure_ev:1}));
  const same=cache.grade(source,grade({grade_exposure_ev:1,grade_saturation:0}));
  assert.equal(compiles,1);assert.equal(uploads,1);assert.equal(cache.bytes,256*13*4);
  assert.throws(()=>cache.grade(source,grade({grade_exposure_ev:2})),/budget/);
  first.delete();same.delete();
  const changed=cache.grade(source,grade({grade_exposure_ev:2}));assert.equal(compiles,1);assert.equal(uploads,2);
  cache.close();assert.equal(cache.bytes,256*13*4);assert.throws(()=>cache.grade(source,grade({})),/closed/);
  changed.delete();assert.equal(cache.bytes,0);cache.close();
 }finally{cache.close();source.delete();image.delete();}
});
test('LUT cache reuses immutable cube uploads across changing grade and intensity',async()=>{
 const k=await kit;let uploads=0;
 const instrumented=Object.create(k) as typeof k;
 instrumented.MakeImage=(...args:Parameters<typeof k.MakeImage>)=>{uploads++;return k.MakeImage(...args);};
 const image=k.MakeImage({width:1,height:1,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB},new Uint8Array([100,100,100,255]),4)!;
 const source=image.makeShaderOptions(k.TileMode.Clamp,k.TileMode.Clamp,k.FilterMode.Nearest,k.MipmapMode.None);
 const cache=new CanvasKitColorShaderCache(instrumented,32),cube=parseCubeLut('LUT_3D_SIZE 2\n'+Array(8).fill('1 0 0').join('\n'));
 const surface=k.MakeSurface(1,1)!,paint=new k.Paint();
 try{
  for(const intensity of [0,1,0]){
   const lease=cache.lut(source,grade({grade_exposure_ev:intensity}),cube,intensity);
   surface.getCanvas().clear(k.TRANSPARENT);paint.setShader(lease.shader);surface.getCanvas().drawPaint(paint);surface.flush();
   const result=surface.getCanvas().readPixels(0,0,{width:1,height:1,colorType:k.ColorType.RGBA_8888,alphaType:k.AlphaType.Unpremul,colorSpace:k.ColorSpace.SRGB})!;
   if(intensity===1)assert.deepEqual([...result],[255,0,0,255]);else assert.ok(Math.abs(result[0]-100)<=1);
   lease.delete();
  }
  assert.equal(uploads,1);assert.equal(cache.bytes,32);cache.close();assert.equal(cache.bytes,0);
 }finally{paint.delete();surface.delete();cache.close();source.delete();image.delete();}
});
