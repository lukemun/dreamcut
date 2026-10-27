/** Keep protocol/decoder work bounded without imposing a scene-wide layer cap.
 * The caller publishes only after this returns, so a failed later batch cannot
 * expose partially updated source surfaces. One session owns all serial batches.
 */
export async function collectNativeSourceBatches<T,R>(sources:readonly T[],request:(batch:readonly T[])=>Promise<readonly R[]>):Promise<R[]> {
 const results:R[]=[];
 for(let offset=0;offset<sources.length;offset+=8){
  const batch=sources.slice(offset,offset+8),decoded=await request(batch);
  if(decoded.length!==batch.length)throw Error('Incomplete native source batch');
  results.push(...decoded);
 }
 return results;
}
