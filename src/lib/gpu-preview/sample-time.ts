/** Match integer cache timestamps to the decoder's fractional-second clock.
 * Select inside the upper edge of the rounding bucket, without crossing into
 * the next microsecond. This handles 30fps boundaries such as 2.933333333s.
 */
export function decoderSampleTime(timeUs:number){return (timeUs+.499)/1_000_000;}
export function decodedSampleInterval(timestamp:number,duration:number){
 const timestampUs=Math.round(timestamp*1_000_000);
 return {timestampUs,durationUs:Math.round((timestamp+duration)*1_000_000)-timestampUs};
}
