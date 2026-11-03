/// <reference types="@webgpu/types" />

export type GpuTargetSpec = Readonly<{key:string;width:number;height:number;format?:'rgba8unorm'|'bgra8unorm'|'rgba16float'|'r16float'}>;
export type GpuTarget = Readonly<GpuTargetSpec & {texture:GPUTexture;bytes:number}>;
export const GPU_TARGET_BUDGET_BYTES=128*1024*1024;

/** Own retained RGBA8 upload and RGBA16F filter targets. Plans are validated in full before
 * changing resources; obsolete targets retire before replacements are allocated.
 * Never encode a frame until prepare returns its complete target map. */
export class GpuIntermediateTargets {
  private targets=new Map<string,GpuTarget>();
  private closed=false;
  constructor(private readonly device:Pick<GPUDevice,'createTexture'|'limits'>,
    private readonly budget=GPU_TARGET_BUDGET_BYTES){
    if(!Number.isSafeInteger(budget)||budget<4)throw Error('Invalid GPU target budget');
  }
  get bytes(){return [...this.targets.values()].reduce((sum,target)=>sum+target.bytes,0);}
  prepare(specs:readonly GpuTargetSpec[]):ReadonlyMap<string,GpuTarget>{
    if(this.closed)throw Error('GPU targets closed');
    if(specs.length>256)throw Error('Too many GPU pass targets');
    let bytes=0;
    const plan=new Map<string,GpuTargetSpec>();
    for(const spec of specs){
      if(!spec.key||plan.has(spec.key))throw Error('Duplicate or empty GPU target identity');
      if(!Number.isSafeInteger(spec.width)||!Number.isSafeInteger(spec.height)
        ||spec.width<1||spec.height<1||spec.width>this.device.limits.maxTextureDimension2D
        ||spec.height>this.device.limits.maxTextureDimension2D)throw Error('Invalid GPU target dimensions');
      if(spec.format&&!['rgba8unorm','bgra8unorm','rgba16float','r16float'].includes(spec.format))throw Error('Invalid GPU target format');
      bytes+=spec.width*spec.height*(spec.format==='rgba16float'?8:spec.format==='r16float'?2:4);
      if(!Number.isSafeInteger(bytes)||bytes>this.budget)throw Error('GPU target budget exceeded');
      // Copy specifications so callers cannot mutate the validated plan.
      plan.set(spec.key,{...spec});
    }
    for(const [key,target] of this.targets){
      const next=plan.get(key);
      if(!next||next.width!==target.width||next.height!==target.height||next.format!==target.format){
        target.texture.destroy();this.targets.delete(key);
      }
    }
    const allocated:string[]=[];
    try {
      for(const [key,spec] of plan){
        if(this.targets.has(key))continue;
        const texture=this.device.createTexture({label:`DreamCut ${key}`,size:[spec.width,spec.height],
          format:spec.format??'rgba8unorm',usage:GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT});
        this.targets.set(key,{...spec,texture,bytes:spec.width*spec.height*(spec.format==='rgba16float'?8:spec.format==='r16float'?2:4)});allocated.push(key);
      }
    }catch(error){
      // A failed plan cannot publish a partial frame or leak its new allocations.
      // Compatible old targets can be retried without duplicating their memory.
      for(const key of allocated){this.targets.get(key)!.texture.destroy();this.targets.delete(key);}
      throw error;
    }
    return new Map(this.targets);
  }
  close(){
    if(this.closed)return;this.closed=true;
    for(const target of this.targets.values())target.texture.destroy();
    this.targets.clear();
  }
}
