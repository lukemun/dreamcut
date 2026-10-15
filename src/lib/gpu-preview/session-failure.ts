/** A GPU failure is terminal for its session. Dispose work before reporting the
 * first useful error; late device/decode callbacks cannot replace it. */
export class GpuSessionFailure {
 private terminal=false;
 private disposed=false;
 get failed(){return this.terminal;}
 constructor(private readonly cancelled:()=>boolean,private readonly dispose:()=>void,
  private readonly report:(reason:string)=>void){}
 private disposeOnce(){if(this.disposed)return;this.disposed=true;this.dispose();}
 /** Unmount is terminal too: callbacks cannot dispose a replacement or report late errors. */
 close(){this.terminal=true;this.disposeOnce();}
 /** Synchronous scene updates share the same failure boundary as decoder promises. */
 guard(action:()=>void){if(this.failed||this.cancelled())return false;try{action();return true;}catch(error){this.fail(error);return false;}}
 fail(error:unknown){
  if(this.failed||this.cancelled())return;
  this.terminal=true;
  const reason=error instanceof Error?error.message:String(error);
  try{this.disposeOnce();}catch(cleanup){
   this.report(`${reason} Cleanup failed: ${cleanup instanceof Error?cleanup.message:String(cleanup)}`);return;
  }
  this.report(reason);
 }
}
