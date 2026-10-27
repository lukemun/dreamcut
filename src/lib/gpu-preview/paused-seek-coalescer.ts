/** Paused seeks (scrubbing) prepare one exact picture at a time. A seek that arrives
 * while one is in flight replaces the single deferred target instead of cancelling
 * the in-flight decode, so every finished picture can be shown while dragging and
 * the latest target is always prepared last. Playing requests are never deferred
 * and discard any deferred paused target. Owns no clock, pictures or decoders. */
export class PausedSeekCoalescer<T> {
 private serial=0;
 private active=0;
 private deferred:{target:T}|null=null;
 /** Returns a token when the caller should prepare `target` now, or null when deferred. */
 offer(target:T,paused:boolean):number|null{
  if(paused&&this.active){this.deferred={target};return null;}
  this.deferred=null;
  const token=++this.serial;
  this.active=paused?token:0;
  return token;
 }
 /** Call when a prepared request settles. Returns the latest deferred target to prepare next. */
 settle(token:number):T|undefined{
  if(token!==this.active)return undefined;
  this.active=0;
  const next=this.deferred;this.deferred=null;
  return next?.target;
 }
}

/** A deferred scrub target a short way ahead of the last request is reached faster by
 * letting the producer's sequential decoders continue than by cancelling them, which
 * restarts each source at its previous keyframe. Bounded to half a second. */
export function isForwardScrubStep(priorFrame:number,frame:number,fps:number){
 return frame>priorFrame&&frame-priorFrame<=Math.ceil(fps/2);
}
