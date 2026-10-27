/** Account for the RGBA upload canvas and retained GPU texture; driver overhead is separate. */
export type CopySurface = Readonly<{width:number;height:number}>;
export const GPU_COPY_BUDGET_BYTES=128*1024*1024;
export function validateGpuCopyBudget(surfaces:readonly (CopySurface|null)[],budget=GPU_COPY_BUDGET_BYTES){
 if(surfaces.length>64)throw Error('GPU preview supports at most 64 simultaneous layers.');
 let bytes=0;
 for(const surface of surfaces){
  if(!surface)continue;
  if(!Number.isSafeInteger(surface.width)||!Number.isSafeInteger(surface.height)||surface.width<1||surface.height<1)throw Error('Invalid GPU copy dimensions');
  bytes+=surface.width*surface.height*8;
  if(!Number.isSafeInteger(bytes)||bytes>budget)throw Error('GPU preview copied-surface budget exceeded.');
 }
 return bytes;
}
/** Retire old allocations before replacements, including slots switching to external video. */
export function pruneGpuCopies<T extends CopySurface>(slots:Array<T|undefined>,surfaces:readonly (CopySurface|null)[],release:(slot:T)=>void){
 for(let i=0;i<slots.length;i++){
  const old=slots[i],next=surfaces[i];
  if(old&&(!next||old.width!==next.width||old.height!==next.height)){release(old);slots[i]=undefined;}
 }
 slots.length=surfaces.length;
}
