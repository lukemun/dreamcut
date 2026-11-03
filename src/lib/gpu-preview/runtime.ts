import {GpuPreviewRuntime as CoreRuntime} from './runtime-core';
import {GpuTextCache} from './text-cache';
export type {GpuTextResources} from './runtime-core';
/** Browser/export entry keeps its DOM text owner. The worker imports only the
 * DOM-free core and injects its request/response text bridge. */
export class GpuPreviewRuntime extends CoreRuntime {
 constructor(...args:ConstructorParameters<typeof CoreRuntime>){
  args[11]??=new GpuTextCache('session-fonts-v1');
  super(...args);
 }
}
