/** Reclaim only idle decoders; never interrupt a frame already being prepared. */
export function idleNativeSession<T extends {pending:unknown;lastUsed:number}>(workers:Map<string,T>,now:number,minimumIdleMs=1000):string|undefined {
  return [...workers].filter(([,worker])=>!worker.pending&&now-worker.lastUsed>=minimumIdleMs)
    .sort((a,b)=>a[1].lastUsed-b[1].lastUsed)[0]?.[0];
}
