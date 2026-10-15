import { surfaceTrackSchema } from "../timeline/surface-track";
import { resolveLocalMediaSource,mediaFileSha256 } from "./audio-effects";
/** Validate immutable source identity on attachment writes; never from playback. */
export function validateSurfaceTrackSource(projectId:string,value:unknown) {
  const track=surfaceTrackSchema.parse(value);
  const source=resolveLocalMediaSource(projectId,track.sourceUrl);
  if(!source||mediaFileSha256(source.absolutePath)!==track.sourceSha256)throw Object.assign(Error("The tracked source is missing or changed. Track the current video again."),{status:400});
  return track;
}
