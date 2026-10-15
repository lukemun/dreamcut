import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { writeJsonFileAtomic } from '../local-store/atomic-json';
import { publishMediaContextDataset, readMediaContextIndex } from '../local-store/media-context';
import { mediaAnalysisContentDir, projectDir, projectMediaDir } from '../local-store/paths';
import { stableJson } from './stage-cache';
import type { ProjectionRect, SourceProjection } from '../timeline/source-projection';
import type { MediaContextDatasetRevision } from './schema';

export const ALPHA_FOOTPRINT_RECIPE_VERSION = 'binary-alpha-footprint-v1';
export const ALPHA_THRESHOLD = 1;

export type AlphaFrameFootprint = {
  time_seconds: number;
  /** Per source row, alternating inclusive start / exclusive end X coordinates. */
  rows: number[][];
  occupied_pixels: number;
  bounds: { x: number; y: number; width: number; height: number } | null;
  centroid: { x: number; y: number } | null;
};

export type AlphaFootprintArtifact = {
  schema_version: 1;
  recipe_version: typeof ALPHA_FOOTPRINT_RECIPE_VERSION;
  source_fingerprint_sha256: string;
  width: number;
  height: number;
  alpha_threshold: number;
  frame_rate: string | null;
  duration_seconds: number | null;
  frames: AlphaFrameFootprint[];
};

export type ProjectAlphaFootprintEntry = {
  relative_path: string;
  source_fingerprint_sha256: string;
  revision_id: string;
  artifact_path: string;
  width: number;
  height: number;
  frame_count: number;
  observed_times_seconds: number[];
  created_at: string;
};

export type ProjectAlphaFootprintIndex = {
  schema_version: 1;
  recipe_version: typeof ALPHA_FOOTPRINT_RECIPE_VERSION;
  updated_at: string;
  entries: ProjectAlphaFootprintEntry[];
};

export type AlphaFootprintEvidence = { revision_id: string; artifact: AlphaFootprintArtifact };
export type RasterizedAlphaFootprint = {
  mask: Uint8Array;
  subject_mask: Uint8Array;
  width: number;
  height: number;
  occupied_pixels: number;
  subject_pixels: number;
  bounds: ProjectionRect | null;
  centroid: { x: number; y: number } | null;
  frame_time_seconds: number;
  evidence_revision: string;
  includes_sticker_outline: boolean;
};

const round = (value: number) => Number(value.toFixed(6));
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const indexPath = (projectId: string) => path.join(projectDir(projectId), 'instruments', 'media-index', 'alpha-footprints.json');
const artifactDir = (projectId: string) => path.join(projectDir(projectId), 'instruments', 'alpha-footprints');

export function analyzeAlphaRgbaFrame(bytes: Buffer, width: number, height: number, timeSeconds: number,
  threshold = ALPHA_THRESHOLD): AlphaFrameFootprint {
  if (bytes.length !== width * height * 4) throw new Error('RGBA frame byte length does not match its dimensions');
  const rows: number[][] = Array.from({ length: height }, () => []);
  let occupied = 0;
  let minX = width; let minY = height; let maxX = -1; let maxY = -1;
  let sumX = 0; let sumY = 0;
  for (let y = 0; y < height; y++) {
    const runs = rows[y]!;
    let runStart = -1;
    for (let x = 0; x < width; x++) {
      const visible = bytes[(y * width + x) * 4 + 3]! >= threshold;
      if (visible && runStart < 0) runStart = x;
      if ((!visible || x === width - 1) && runStart >= 0) {
        const end = visible && x === width - 1 ? x + 1 : x;
        runs.push(runStart, end);
        for (let px = runStart; px < end; px++) { occupied++; sumX += px + 0.5; sumY += y + 0.5; }
        minX = Math.min(minX, runStart); maxX = Math.max(maxX, end - 1); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        runStart = -1;
      }
    }
  }
  return {
    time_seconds: round(timeSeconds), rows, occupied_pixels: occupied,
    bounds: occupied ? { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 } : null,
    centroid: occupied ? { x: round(sumX / occupied), y: round(sumY / occupied) } : null,
  };
}

export function nearestAlphaFrame(artifact: AlphaFootprintArtifact, sourceTime: number) {
  let best = artifact.frames[0]!;
  let distance = Math.abs(best.time_seconds - sourceTime);
  for (const frame of artifact.frames.slice(1)) {
    const next = Math.abs(frame.time_seconds - sourceTime);
    if (next < distance) { best = frame; distance = next; }
  }
  return best;
}

function maskFacts(mask: Uint8Array, width: number, height: number) {
  let occupied = 0; let minX = width; let minY = height; let maxX = -1; let maxY = -1; let sumX = 0; let sumY = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x]) {
    occupied++; minX = Math.min(minX,x); minY = Math.min(minY,y); maxX = Math.max(maxX,x); maxY = Math.max(maxY,y); sumX += x + 0.5; sumY += y + 0.5;
  }
  return { occupied,
    bounds: occupied ? { x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1 } : null,
    centroid: occupied ? { x:round(sumX/occupied),y:round(sumY/occupied) } : null };
}

/** Rasterizes decoded binary alpha with the same ordered eight-pass sticker support model.
 * Anti-aliased opacity is thresholded; geometry is exact on output-pixel centers for this recipe. */
export function rasterizeAlphaFootprint(input: {
  evidence: AlphaFootprintEvidence;
  projection: SourceProjection;
  canvas: { width: number; height: number };
  source_time_seconds: number;
  sticker_outline_width?: number;
  media_scale?: number;
}): RasterizedAlphaFootprint {
  const { artifact } = input.evidence;
  const frame = nearestAlphaFrame(artifact,input.source_time_seconds);
  const { width,height } = input.canvas;
  const subject = new Uint8Array(width*height);
  const rect = input.projection.transformed_rect;
  const clip = input.projection.visible_rect;
  const minY = Math.max(0,Math.ceil(Math.max(rect.y,clip.y)-0.5));
  const maxY = Math.min(height,Math.ceil(Math.min(rect.y+rect.height,clip.y+clip.height)-0.5));
  const minClipX = Math.max(0,Math.ceil(clip.x-0.5));
  const maxClipX = Math.min(width,Math.ceil(clip.x+clip.width-0.5));
  for (let y=minY;y<maxY;y++) {
    const sy=Math.floor(((y+0.5-rect.y)/rect.height)*artifact.height);
    if (sy<0||sy>=artifact.height) continue;
    const runs=frame.rows[sy]??[];
    for (let i=0;i+1<runs.length;i+=2) {
      const start=Math.max(minClipX,Math.ceil(rect.x+(runs[i]!/artifact.width)*rect.width-0.5));
      const end=Math.min(maxClipX,Math.ceil(rect.x+(runs[i+1]!/artifact.width)*rect.width-0.5));
      if (end>start) subject.fill(1,y*width+start,y*width+end);
    }
  }
  const occupied=subject.slice();
  const outlineWidth=Math.max(0,Math.round((input.sticker_outline_width??0)*(input.media_scale??1)));
  if (outlineWidth>0) for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]] as const) {
    const previous=occupied.slice();
    const shiftX=dx*outlineWidth,shiftY=dy*outlineWidth;
    for (let y=0;y<height;y++) {
      const targetY=y+shiftY; if (targetY<0||targetY>=height) continue;
      for (let x=0;x<width;x++) if (previous[y*width+x]) {
        const targetX=x+shiftX; if (targetX>=0&&targetX<width) occupied[targetY*width+targetX]=1;
      }
    }
  }
  const subjectFacts=maskFacts(subject,width,height); const facts=maskFacts(occupied,width,height);
  return { mask:occupied,subject_mask:subject,width,height,occupied_pixels:facts.occupied,subject_pixels:subjectFacts.occupied,
    bounds:facts.bounds,centroid:facts.centroid,frame_time_seconds:frame.time_seconds,evidence_revision:input.evidence.revision_id,
    includes_sticker_outline:outlineWidth>0 };
}

export function intersectRasterizedAlpha(a: RasterizedAlphaFootprint,b: RasterizedAlphaFootprint) {
  if (a.width!==b.width||a.height!==b.height) throw new Error('Alpha masks use different canvases');
  let pixels=0,minX=a.width,minY=a.height,maxX=-1,maxY=-1,sumX=0,sumY=0;
  let subjectPixels=0,borderPixels=0;
  for (let i=0;i<a.mask.length;i++) if (a.mask[i]&&b.mask[i]) {
    const x=i%a.width,y=Math.floor(i/a.width); pixels++; sumX+=x+0.5;sumY+=y+0.5;
    minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
    if (a.subject_mask[i]&&b.subject_mask[i]) subjectPixels++; else borderPixels++;
  }
  return { pixels,subject_pixels:subjectPixels,border_involved_pixels:borderPixels,
    bounds:pixels?{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}:null,
    centroid:pixels?{x:round(sumX/pixels),y:round(sumY/pixels)}:null };
}

export function touchingRasterizedAlpha(a:RasterizedAlphaFootprint,b:RasterizedAlphaFootprint) {
  if(a.width!==b.width||a.height!==b.height) throw new Error('Alpha masks use different canvases');
  let touches=0,minX=a.width,minY=a.height,maxX=-1,maxY=-1,sumX=0,sumY=0;
  for(let y=0;y<a.height;y++) for(let x=0;x<a.width;x++) if(a.mask[y*a.width+x]) {
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
      if(dx===0&&dy===0) continue; const bx=x+dx,by=y+dy;
      if(bx<0||bx>=a.width||by<0||by>=a.height||!b.mask[by*a.width+bx]) continue;
      touches++; const cx=(x+bx+1)/2,cy=(y+by+1)/2;sumX+=cx;sumY+=cy;
      minX=Math.min(minX,Math.floor(cx));minY=Math.min(minY,Math.floor(cy));maxX=Math.max(maxX,Math.floor(cx));maxY=Math.max(maxY,Math.floor(cy));
    }
  }
  return {touching_pixel_pairs:touches,bounds:touches?{x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1}:null,
    centroid:touches?{x:round(sumX/touches),y:round(sumY/touches)}:null};
}

function probe(file: string) {
  const result = spawnSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries',
    'stream=width,height,r_frame_rate,duration,codec_name:stream_tags=alpha_mode:format=duration','-of','json',file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `ffprobe failed for ${file}`);
  const parsed = JSON.parse(result.stdout) as { streams?: Array<Record<string, unknown>>; format?: Record<string, unknown> };
  const stream = parsed.streams?.[0];
  const width = Number(stream?.width); const height = Number(stream?.height);
  if (!(width > 0 && height > 0)) throw new Error(`Video dimensions unavailable for ${file}`);
  const duration = Number(stream?.duration ?? parsed.format?.duration);
  return { width, height, frameRate: typeof stream?.r_frame_rate === 'string' ? stream.r_frame_rate : null,
    duration: Number.isFinite(duration) ? duration : null, codec: String(stream?.codec_name ?? ''),
    alphaMode: String((stream?.tags as Record<string, unknown> | undefined)?.ALPHA_MODE ?? (stream?.tags as Record<string, unknown> | undefined)?.alpha_mode ?? '') };
}

function frameTimes(file: string, isImage: boolean, frameRate: string | null, duration: number | null) {
  if (isImage) return [0];
  const result = spawnSync('ffprobe', ['-v','error','-select_streams','v:0','-show_frames','-show_entries',
    'frame=best_effort_timestamp_time','-of','json',file], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status === 0) {
    const parsed = JSON.parse(result.stdout) as { frames?: Array<{ best_effort_timestamp_time?: string }> };
    const values = (parsed.frames ?? []).map(frame => Number(frame.best_effort_timestamp_time)).filter(Number.isFinite);
    if (values.length) return values.map(round);
  }
  const [num, den] = (frameRate ?? '30/1').split('/').map(Number);
  const fps = num! > 0 && den! > 0 ? num! / den! : 30;
  return Array.from({ length: Math.max(1, Math.ceil((duration ?? 0) * fps)) }, (_, index) => round(index / fps));
}

async function fingerprintFile(file: string) {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const input = fs.createReadStream(file); input.on('data', chunk => hash.update(chunk)); input.on('error', reject); input.on('end', resolve);
  });
  return hash.digest('hex');
}

export async function extractAlphaFootprint(file: string): Promise<AlphaFootprintArtifact> {
  const info = probe(file);
  const isImage = /\.(png|webp|avif)$/i.test(file);
  const times = frameTimes(file, isImage, info.frameRate, info.duration);
  const fingerprint = await fingerprintFile(file);
  const frameBytes = info.width * info.height * 4;
  const frames: AlphaFrameFootprint[] = [];
  await new Promise<void>((resolve, reject) => {
    const args = ['-v','error'];
    if (!isImage && info.codec === 'vp9' && info.alphaMode === '1') args.push('-c:v','libvpx-vp9');
    args.push('-i',file,'-vsync','0','-f','rawvideo','-pix_fmt','rgba','pipe:1');
    const child = spawn('ffmpeg', args, { stdio: ['ignore','pipe','pipe'] });
    let pending = Buffer.alloc(0); let error = '';
    child.stderr.on('data', chunk => { error = (error + String(chunk)).slice(-4000); });
    child.stdout.on('data', chunk => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
      while (pending.length >= frameBytes) {
        const index = frames.length;
        frames.push(analyzeAlphaRgbaFrame(pending.subarray(0, frameBytes), info.width, info.height, times[index] ?? index / 30));
        pending = pending.subarray(frameBytes);
      }
    });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg alpha decode failed (${code}): ${error}`)));
  });
  if (!frames.length) throw new Error(`No decoded frames for ${file}`);
  return { schema_version: 1, recipe_version: ALPHA_FOOTPRINT_RECIPE_VERSION, source_fingerprint_sha256: fingerprint,
    width: info.width, height: info.height, alpha_threshold: ALPHA_THRESHOLD, frame_rate: info.frameRate,
    duration_seconds: info.duration, frames };
}

export function readProjectAlphaFootprintIndex(projectId: string): ProjectAlphaFootprintIndex {
  const file = indexPath(projectId);
  if (!fs.existsSync(file)) return { schema_version: 1, recipe_version: ALPHA_FOOTPRINT_RECIPE_VERSION, updated_at: new Date(0).toISOString(), entries: [] };
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as ProjectAlphaFootprintIndex;
  if (value.schema_version !== 1 || value.recipe_version !== ALPHA_FOOTPRINT_RECIPE_VERSION || !Array.isArray(value.entries)) throw new Error('Invalid alpha-footprint index');
  return value;
}

export function readAlphaFootprintArtifact(file: string): AlphaFootprintArtifact {
  const value = JSON.parse(gunzipSync(fs.readFileSync(file)).toString()) as AlphaFootprintArtifact;
  if (value.schema_version !== 1 || value.recipe_version !== ALPHA_FOOTPRINT_RECIPE_VERSION || !Array.isArray(value.frames)) throw new Error('Invalid alpha-footprint artifact');
  return value;
}

export async function preprocessProjectAlphaFootprints(projectId: string, relativePaths: string[]) {
  const previous = readProjectAlphaFootprintIndex(projectId);
  const byPath = new Map(previous.entries.map(entry => [entry.relative_path, entry]));
  fs.mkdirSync(artifactDir(projectId), { recursive: true });
  for (const relativePath of [...new Set(relativePaths)]) {
    if (path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes('..')) throw new Error(`Invalid media path: ${relativePath}`);
    const file = path.resolve(projectMediaDir(projectId), relativePath);
    if (!file.startsWith(`${path.resolve(projectMediaDir(projectId))}${path.sep}`)) throw new Error(`Media path escapes project: ${relativePath}`);
    const artifact = await extractAlphaFootprint(file);
    const recipe = stableJson({ recipe: ALPHA_FOOTPRINT_RECIPE_VERSION, fingerprint: artifact.source_fingerprint_sha256,
      alpha_threshold: artifact.alpha_threshold, ffmpeg_pixel_format: 'rgba' });
    const revisionId = sha256(recipe);
    const compressed = gzipSync(Buffer.from(JSON.stringify(artifact)), { level: 9 });
    const localRelative = path.join('instruments','alpha-footprints',`${artifact.source_fingerprint_sha256}.${revisionId}.json.gz`);
    const localFile = path.join(projectDir(projectId), localRelative);
    fs.writeFileSync(`${localFile}.tmp`, compressed); fs.renameSync(`${localFile}.tmp`, localFile);
    const sharedRelative = path.join('alpha-footprints',`${revisionId}.json.gz`);
    const sharedFile = path.join(mediaAnalysisContentDir(artifact.source_fingerprint_sha256), sharedRelative);
    fs.mkdirSync(path.dirname(sharedFile), { recursive: true });
    if (!fs.existsSync(sharedFile)) fs.copyFileSync(localFile, sharedFile);
    const context = readMediaContextIndex(artifact.source_fingerprint_sha256);
    const revision:MediaContextDatasetRevision = {
      dataset_id: 'alpha_footprint', revision_id: revisionId, kind: 'binary-alpha-footprint', evidence_level: 'L1',
      producer: { name: 'dreamcut-alpha-footprint', version: '1', recipe_version: ALPHA_FOOTPRINT_RECIPE_VERSION }, input_revision_ids: [],
      coverage: { observation_kind: 'discrete_frames', observed_times_seconds: artifact.frames.map(frame => frame.time_seconds), timebase: 'source_seconds', status: 'partial',
        ranges: artifact.frames.map(frame => [frame.time_seconds, frame.time_seconds]), gaps: [] },
      coordinate_space: { system: 'display_source_pixels', width: artifact.width, height: artifact.height, display_rotation_degrees: 0 },
      summary: { width: artifact.width, height: artifact.height, frames: artifact.frames.length, alpha_threshold: artifact.alpha_threshold,
        occupied_fraction_range: [Math.min(...artifact.frames.map(frame => frame.occupied_pixels / (artifact.width * artifact.height))), Math.max(...artifact.frames.map(frame => frame.occupied_pixels / (artifact.width * artifact.height)))] },
      artifact: { relative_path: sharedRelative, sha256: sha256(compressed), media_type: 'application/gzip' },
      supersedes_revision_id: context.datasets.alpha_footprint?.active_revision_id ?? null, created_at: new Date().toISOString(),
    };
    if (!context.datasets.alpha_footprint?.revisions.some(item => item.revision_id === revisionId)) {
      publishMediaContextDataset(artifact.source_fingerprint_sha256, revision);
    }
    byPath.set(relativePath, { relative_path: relativePath, source_fingerprint_sha256: artifact.source_fingerprint_sha256,
      revision_id: revisionId, artifact_path: localRelative, width: artifact.width, height: artifact.height,
      frame_count: artifact.frames.length, observed_times_seconds: artifact.frames.map(frame => frame.time_seconds), created_at: new Date().toISOString() });
  }
  const next: ProjectAlphaFootprintIndex = { schema_version: 1, recipe_version: ALPHA_FOOTPRINT_RECIPE_VERSION,
    updated_at: new Date().toISOString(), entries: [...byPath.values()].sort((a,b) => a.relative_path.localeCompare(b.relative_path)) };
  writeJsonFileAtomic(indexPath(projectId), next);
  return next;
}

export function loadProjectAlphaFootprints(projectId: string) {
  const index = readProjectAlphaFootprintIndex(projectId);
  return new Map(index.entries.map(entry => [entry.relative_path, {
    revision_id: entry.revision_id,
    artifact: readAlphaFootprintArtifact(path.join(projectDir(projectId), entry.artifact_path)),
  }]));
}
