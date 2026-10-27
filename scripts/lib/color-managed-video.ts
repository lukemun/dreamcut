import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { probeHasAlphaChannel } from "../../src/lib/media-analysis/alpha-channel";
import { COLOR_MANAGED_ALPHA_VIDEO_RECIPE, COLOR_MANAGED_VIDEO_RECIPE, HDR_CODE_ALPHA_VIDEO_RECIPE, HDR_CODE_VIDEO_RECIPE, LEGACY_COLOR_MANAGED_ALPHA_VIDEO_RECIPES, sourceNeedsSdrRenderAuthority } from "../../src/lib/media-analysis/color-profile";
import os from "node:os";

export { COLOR_MANAGED_VIDEO_RECIPE, HDR_CODE_ALPHA_VIDEO_RECIPE, HDR_CODE_VIDEO_RECIPE, sourceNeedsSdrRenderAuthority } from "../../src/lib/media-analysis/color-profile";

export type VideoProbe = {
  duration_seconds: number;
  codec: string | null;
  width: number | null;
  height: number | null;
  pixel_format: string | null;
  video_alpha_mode?: string | null;
  frame_rate: string | null;
  frame_count: number | null;
  color_range: string | null;
  color_space: string | null;
  color_transfer: string | null;
  color_primaries: string | null;
  display_rotation_degrees: number;
};

/**
 * Limits for a lossy HDR-alpha authority, measured against the cadence-mapped source alpha.
 * A 6.6 s 4K cutout at CRF 18 measured soft-edge mean error 0.87/255 (worst frame 1.29), max 45,
 * and no fully clear or fully opaque pixel moved more than 24 levels; CRF 24 measured 1.06/1.50/35.
 */
export const ALPHA_AUTHORITY_TOLERANCE = {
  /** Mean absolute alpha error over partially transparent source pixels, all frames. */
  edge_mean_abs: 2,
  /** The same mean for the worst single frame. */
  worst_frame_edge_mean_abs: 3,
  /** Largest single-pixel alpha error anywhere. */
  max_abs: 96,
  /** A clear (0) or opaque (255) source pixel that moves further than this counts as a violation. */
  clear_or_opaque_deviation: 24,
  /** Violations allowed, as a fraction of all pixels in all frames. */
  max_violation_fraction: 1e-5,
} as const;

export type AlphaTolerance = { [K in keyof typeof ALPHA_AUTHORITY_TOLERANCE]: number };
export type AlphaDeviation = { frames: number; edge_mean_abs: number; worst_frame_edge_mean_abs: number; max_abs: number; violation_fraction: number };
export type AlphaAuthorityEncoding = "vp9-crf18" | "vp9-lossless";

export type ColorManagedVideoReceipt = {
  schema_version: 1;
  recipe_id: typeof COLOR_MANAGED_VIDEO_RECIPE | typeof COLOR_MANAGED_ALPHA_VIDEO_RECIPE | typeof LEGACY_COLOR_MANAGED_ALPHA_VIDEO_RECIPES[number] | typeof HDR_CODE_VIDEO_RECIPE | typeof HDR_CODE_ALPHA_VIDEO_RECIPE;
  /** Code-value authorities: how the shader decodes the pixels (HDR_CODE_VIDEO_RECIPE, HDR_CODE_ALPHA_VIDEO_RECIPE). */
  source_encoding?: HdrSourceEncoding;
  alpha_preservation?: {
    preview_parity_samples: Array<{source_second:number;ssim_all:number}>;
    /** v2: the encoding kept, and its measured alpha error against the source, within `tolerance`. */
    authority_encoding?: AlphaAuthorityEncoding;
    measured?: AlphaDeviation;
    tolerance?: AlphaTolerance;
    /** v1 receipts: exact cadence-mapped alpha-plane hashes. */
    source_plane_sha256?: string;
    render_plane_sha256?: string;
  };
  source_path: string;
  source_sha256: string;
  source_probe: VideoProbe;
  source_is_hdr: boolean;
  render_authority_path: string;
  render_authority_sha256: string;
  render_authority_probe: VideoProbe;
  preview_proxy_path: string;
  preview_proxy_sha256: string;
  preview_proxy_probe: VideoProbe;
  preview_dimensions: { width: number; height: number };
  duration_delta_seconds: number;
  parity_samples: Array<{ source_second: number; ssim_all: number }>;
  minimum_ssim: number;
  created_at: string;
};

type FfprobePayload = {
  streams?: Array<Record<string, unknown>>;
  format?: Record<string, unknown>;
};

function ensureDirectory(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

export function sha256File(file: string): string {
  const hash = createHash("sha256");
  const handle = fs.openSync(file, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(handle, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(handle);
  }
  return hash.digest("hex");
}

export function probeVideo(file: string, options: {countFrames?:boolean} = {}): VideoProbe {
  const payload = JSON.parse(
    execFileSync("ffprobe", ["-v", "error", ...(options.countFrames?["-count_frames"]:[]), "-show_format", "-show_streams", "-of", "json", file], {
      encoding: "utf8",
    }),
  ) as FfprobePayload;
  const video = payload.streams?.find((stream) => stream.codec_type === "video") ?? {};
  const sideData = Array.isArray(video.side_data_list) ? video.side_data_list as Array<Record<string, unknown>> : [];
  const duration = Number(video.duration ?? payload.format?.duration ?? 0);
  return {
    duration_seconds: Number.isFinite(duration) ? duration : 0,
    codec: typeof video.codec_name === "string" ? video.codec_name : null,
    width: typeof video.width === "number" ? video.width : null,
    height: typeof video.height === "number" ? video.height : null,
    pixel_format: typeof video.pix_fmt === "string" ? video.pix_fmt : null,
    video_alpha_mode: Object.entries((video.tags ?? {}) as Record<string, unknown>)
      .find(([key]) => key.toLowerCase() === "alpha_mode")?.[1]?.toString() ?? null,
    frame_rate: typeof video.avg_frame_rate === "string" ? video.avg_frame_rate : null,
    frame_count: Number.isFinite(Number(video.nb_frames??video.nb_read_frames)) ? Number(video.nb_frames??video.nb_read_frames) : null,
    color_range: typeof video.color_range === "string" ? video.color_range : null,
    color_space: typeof video.color_space === "string" ? video.color_space : null,
    color_transfer: typeof video.color_transfer === "string" ? video.color_transfer : null,
    color_primaries: typeof video.color_primaries === "string" ? video.color_primaries : null,
    display_rotation_degrees: Number(
      sideData.find((item) => typeof item.rotation === "number")?.rotation
        ?? (typeof video.tags === "object" && video.tags && "rotate" in video.tags
          ? (video.tags as Record<string, unknown>).rotate
          : 0),
    ) || 0,
  };
}

function assertBt709Sdr(probe: VideoProbe, label: string) {
  const fields = [probe.color_space, probe.color_transfer, probe.color_primaries];
  if (fields.some((field) => field !== "bt709")) {
    throw new Error(`${label} is not explicitly tagged BT.709 SDR: ${JSON.stringify(probe)}`);
  }
  if (probe.pixel_format !== "yuv420p") {
    throw new Error(`${label} must be browser-safe yuv420p; received ${probe.pixel_format ?? "unknown"}`);
  }
}

export type HdrSourceEncoding = { transfer: "hlg" | "pq"; primaries: "rec2020" | "rec709" | "displayP3"; max_cll_nits: number | null };

/** How an HDR source's code values are to be read, plus its MaxCLL when it declares one. */
export function hdrSourceEncoding(file: string, probe: VideoProbe): HdrSourceEncoding {
  const transfer = probe.color_transfer === "smpte2084" ? "pq" : "hlg";
  const primaries = probe.color_primaries === "bt709" ? "rec709" : probe.color_primaries === "smpte432" ? "displayP3" : "rec2020";
  let maxCll: number | null = null;
  try {
    const out = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-read_intervals", "%+#1", "-show_frames", "-show_entries", "frame_side_data=max_content", "-of", "json", file], { encoding: "utf8" }));
    const value = Number(out.frames?.[0]?.side_data_list?.find((entry: { max_content?: number }) => entry.max_content != null)?.max_content);
    if (Number.isFinite(value) && value > 0) maxCll = value;
  } catch { /* MaxCLL is optional */ }
  return { transfer, primaries, max_cll_nits: maxCll };
}

/** swscale matrix name for a probed colour space. */
function swsMatrix(colorSpace: string | null) {
  return colorSpace === "bt2020nc" || colorSpace === "bt2020c" ? "bt2020" : colorSpace === "smpte170m" || colorSpace === "bt470bg" ? "smpte170m" : "bt709";
}


/** HDR → browser-safe code-value video: only the YUV matrix changes, so HLG/PQ values survive exactly. */
function createHdrCodeAuthority(sourcePath: string, outputPath: string, probe: VideoProbe, fps: number) {
  ensureDirectory(outputPath);
  const range = probe.color_range === "pc" ? "pc" : "tv";
  execFileSync("ffmpeg", [
    "-y", "-v", "error", "-i", sourcePath, "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", `fps=${fps},setsar=1,scale=in_color_matrix=${swsMatrix(probe.color_space)}:in_range=${range}:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-g", "30", "-keyint_min", "30", "-sc_threshold", "0",
    // Deliberately tagged BT.709: browsers must pass the HDR code values through unconverted.
    "-color_range", "tv", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
    "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", outputPath,
  ], { stdio: "inherit" });
}

/**
 * HDR alpha (a cutout cut straight from HDR phone footage) → VP9-alpha code-value authority. It takes the
 * same matrix-only conversion as opaque HDR (createHdrCodeAuthority), so a cutout's subject decodes in the
 * grade shader exactly like the footage it was cut from; the alpha plane passes through. The CRF 18
 * candidate is kept when `acceptLossy` approves it; otherwise the same conversion is encoded losslessly.
 * Returns the encoding kept.
 */
function createHdrCodeAlphaAuthority(sourcePath:string,outputPath:string,sourceProbe:VideoProbe,fps:number,acceptLossy:(candidate:string)=>boolean):AlphaAuthorityEncoding{
  ensureDirectory(outputPath);
  const work=fs.mkdtempSync(path.join(path.dirname(outputPath),'.alpha-color-'));
  const decode=sourceProbe.codec==='vp9'?['-c:v','libvpx-vp9']:[];
  const range=sourceProbe.color_range==='pc'?'pc':'tv';
  try{
    // The matte bypasses swscale, which would round alpha by a level, and is merged back unchanged. It is
    // tagged BT.709 first: alphamerge otherwise negotiates the source's BT.2020 matrix for its output and
    // FFmpeg silently converts the converted picture back, shifting every colour by a few levels.
    const graph=`[0:v:0]fps=${fps},setsar=1,format=yuva420p,split[c][m];[m]alphaextract,setparams=colorspace=bt709:range=tv[a];[c]scale=in_color_matrix=${swsMatrix(sourceProbe.color_space)}:in_range=${range}:out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p[rgb];[rgb][a]alphamerge,format=yuva420p,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv[out]`;
    const encode=(encoding:AlphaAuthorityEncoding,file:string)=>execFileSync('ffmpeg',['-v','error','-nostdin',...decode,'-i',sourcePath,'-filter_complex',graph,'-map','[out]','-map','0:a:0?',
      '-c:a','libopus','-b:a','192k','-c:v','libvpx-vp9',
      ...(encoding==='vp9-lossless'?['-lossless','1']:['-b:v','0','-crf','18','-deadline','good']),'-auto-alt-ref','0','-row-mt','1','-cpu-used','4',
      // Deliberately tagged BT.709, as the opaque authority: browsers must pass the HDR code values through.
      '-r',String(fps),'-fps_mode','cfr','-g',String(fps),'-color_range','tv','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',file],{stdio:'pipe'});
    const lossy=path.join(work,'authority-crf18.webm');
    encode('vp9-crf18',lossy);
    if(acceptLossy(lossy)){fs.renameSync(lossy,outputPath);return 'vp9-crf18';}
    const lossless=path.join(work,'authority-lossless.webm');
    encode('vp9-lossless',lossless);
    fs.renameSync(lossless,outputPath);
    return 'vp9-lossless';
  }finally{fs.rmSync(work,{recursive:true,force:true});}
}

/** Alpha error of every cadence-mapped render frame against the source, measured in one ffmpeg pass. */
export function measureAlphaDeviation(sourcePath:string,sourceProbe:VideoProbe,renderPath:string,renderProbe:VideoProbe,fps:number):AlphaDeviation{
  const work=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-deviation-'));
  const stat=(name:string)=>path.join(work,name).replace(/\\/g,'/').replace(/:/g,'\\:');
  const t=ALPHA_AUTHORITY_TOLERANCE.clear_or_opaque_deviation;
  try{
    const graph=[
      `[0:v]fps=${fps},alphaextract,format=gray,split=4[s1][s2][s3][s4]`,
      `[1:v]fps=${fps},alphaextract,format=gray,split=3[r1][r2][r3]`,
      `[s1][r1]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YMAX:file=${stat('max')},nullsink`,
      `[s2][r2]lut2=c0='if(gt(x\\,0)*lt(x\\,255)\\,abs(x-y)\\,0)',signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${stat('edge')},nullsink`,
      `[s3]lut=c0='if(gt(val\\,0)*lt(val\\,255)\\,255\\,0)',signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${stat('soft')},nullsink`,
      `[s4][r3]lut2=c0='if(eq(x\\,0)*gt(y\\,${t})+eq(x\\,255)*lt(y\\,${255-t})\\,255\\,0)',signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${stat('violations')}[out]`,
    ].join(';');
    const decode=(probe:VideoProbe)=>probe.codec==='vp9'?['-c:v','libvpx-vp9']:[];
    execFileSync('ffmpeg',['-v','error','-nostdin',...decode(sourceProbe),'-i',sourcePath,...decode(renderProbe),'-i',renderPath,'-filter_complex',graph,'-map','[out]','-f','null','-'],{stdio:'pipe'});
    const read=(name:string)=>[...fs.readFileSync(path.join(work,name),'utf8').matchAll(/=([0-9.]+)\s*$/gm)].map(match=>Number(match[1]));
    const max=read('max'),edge=read('edge'),soft=read('soft'),violations=read('violations');
    const frames=max.length;
    if(!frames||[edge,soft,violations].some(values=>values.length!==frames))throw Error('Alpha deviation measurement did not cover every frame');
    const softTotal=soft.reduce((sum,value)=>sum+value,0);
    return {
      frames,
      edge_mean_abs:softTotal?edge.reduce((sum,value)=>sum+value,0)/(softTotal/255):0,
      worst_frame_edge_mean_abs:Math.max(...edge.map((value,i)=>soft[i]?value/(soft[i]/255):0)),
      max_abs:Math.max(...max),
      violation_fraction:violations.reduce((sum,value)=>sum+value,0)/255/frames,
    };
  }finally{fs.rmSync(work,{recursive:true,force:true});}
}

export function alphaDeviationWithinTolerance(measured:AlphaDeviation,limit:AlphaTolerance=ALPHA_AUTHORITY_TOLERANCE){
  return measured.edge_mean_abs<=limit.edge_mean_abs&&measured.worst_frame_edge_mean_abs<=limit.worst_frame_edge_mean_abs
    &&measured.max_abs<=limit.max_abs&&measured.violation_fraction<=limit.max_violation_fraction;
}

function createPreviewProxy(inputPath: string, outputPath: string, width: number, height: number, fps: number, alpha=false) {
  ensureDirectory(outputPath);
  if(alpha){
    execFileSync("ffmpeg",["-v","error","-nostdin","-c:v","libvpx-vp9","-i",inputPath,"-map","0:v:0","-an","-vf",`fps=${fps}:eof_action=pass,scale=${width}:${height}:flags=area,setsar=1,format=yuva420p`,"-c:v","libvpx-vp9","-auto-alt-ref","0","-b:v","0","-crf","32","-deadline","realtime","-cpu-used","6","-r",String(fps),"-fps_mode","cfr","-g",String(fps),"-color_range","tv","-color_primaries","bt709","-color_trc","bt709","-colorspace","bt709",outputPath],{stdio:"pipe"});
    return;
  }
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-vf",
      `scale=${width}:${height}:flags=area,setsar=1,format=yuv420p`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "18",
      "-g",
      String(fps),
      "-keyint_min",
      String(fps),
      "-sc_threshold",
      "0",
      "-color_range",
      "tv",
      "-color_primaries",
      "bt709",
      "-color_trc",
      "bt709",
      "-colorspace",
      "bt709",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { stdio: "inherit" },
  );
}

function ssimSample(authorityPath: string, proxyPath: string, second: number, width: number, height: number, fps: number, alpha=false, alphaOnly=false): number {
  const result = spawnSync(
    "ffmpeg",
    [
      "-v",
      "info",
      "-ss",
      second.toFixed(3),
      ...(alpha?["-c:v","libvpx-vp9"]:[]),
      "-i",
      authorityPath,
      "-ss",
      second.toFixed(3),
      ...(alpha?["-c:v","libvpx-vp9"]:[]),
      "-i",
      proxyPath,
      "-t",
      "0.2",
      "-filter_complex",
      `[0:v]${alphaOnly?"alphaextract,":""}scale=${width}:${height}:flags=area,fps=${fps},format=${alphaOnly?"gray":"yuv420p"}[reference];[1:v]${alphaOnly?"alphaextract,":""}fps=${fps},format=${alphaOnly?"gray":"yuv420p"}[candidate];[reference][candidate]ssim`,
      "-an",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const match = /All:([\d.]+)/.exec(result.stderr ?? "");
  if (result.status === 0 && match) return Number(match[1]);
  throw new Error(`FFmpeg SSIM comparison failed: ${result.stderr ?? result.error?.message ?? "unknown error"}`);
}

export function createColorManagedVideoPair(options: {
  sourcePath: string;
  renderAuthorityPath: string;
  previewProxyPath: string;
  previewWidth: number;
  previewHeight: number;
  fps?: number;
  minimumSsim?: number;
  preparedColorStage?: string;
  /** Alpha limits for the lossy authority; tests pass stricter ones to exercise the lossless fallback. */
  alphaTolerance?: AlphaTolerance;
  /**
   * The opaque footage an HDR cutout was cut from. Cutout files drop the MaxCLL side data, so the
   * cutout reads it from here and its PQ values decode with the same peak as the footage's.
   */
  encodingReferencePath?: string;
}): ColorManagedVideoReceipt {
  const alphaTolerance = options.alphaTolerance ?? ALPHA_AUTHORITY_TOLERANCE;
  const fps = options.fps ?? 30;
  const minimumSsim = options.minimumSsim ?? 0.97;
  if (path.resolve(options.sourcePath) === path.resolve(options.renderAuthorityPath)) {
    throw new Error("Render authority output must not overwrite the preserved source");
  }
  if (path.resolve(options.sourcePath) === path.resolve(options.previewProxyPath)) {
    throw new Error("Preview proxy output must not overwrite the preserved source");
  }
  const sourceProbe = probeVideo(options.sourcePath);
  const sourceIsHdr = sourceNeedsSdrRenderAuthority(sourceProbe);
  if (!sourceIsHdr) {
    throw new Error("This recipe currently requires an HDR/HLG/PQ source; SDR sources should remain their own render authority");
  }

  const alpha=probeHasAlphaChannel(sourceProbe);
  let alphaEncoding:AlphaAuthorityEncoding|undefined;
  let alphaDeviation:AlphaDeviation|undefined;
  if(alpha){
    if(/p(?:9|10|12|14|16)(?:le|be)?|(?:rgba|bgra)64/.test(sourceProbe.pixel_format??''))throw Error('HDR alpha conversion requires an 8-bit alpha source; higher-precision alpha needs a preserving authority recipe');
    if(fps!==30)throw Error('HDR alpha authority currently requires the shared 30 fps clock');
    if(![options.renderAuthorityPath,options.previewProxyPath].every(file=>path.extname(file)==='.webm'))throw Error('HDR alpha authority and proxy must use WebM containers');
    // CRF 18 keeps the authority about 14 times smaller than lossless. A source whose alpha it
    // cannot hold within the measured limits gets the lossless authority instead.
    alphaEncoding=createHdrCodeAlphaAuthority(options.sourcePath,options.renderAuthorityPath,sourceProbe,fps,candidate=>{
      alphaDeviation=measureAlphaDeviation(options.sourcePath,sourceProbe,candidate,probeVideo(candidate,{countFrames:true}),fps);
      return alphaDeviationWithinTolerance(alphaDeviation,alphaTolerance);
    });
  }else createHdrCodeAuthority(options.sourcePath, options.renderAuthorityPath, sourceProbe, fps);
  const renderAuthorityProbe = probeVideo(options.renderAuthorityPath,{countFrames:alpha});
  // The lossless fallback is measured where it now lives, so the receipt describes the kept file.
  if(alpha&&alphaEncoding==='vp9-lossless')alphaDeviation=measureAlphaDeviation(options.sourcePath,sourceProbe,options.renderAuthorityPath,renderAuthorityProbe,fps);
  assertBt709Sdr(renderAuthorityProbe, "Render authority");
  if(alpha){
    const rotated=Math.abs(sourceProbe.display_rotation_degrees)%180===90;
    if(renderAuthorityProbe.width!==(rotated?sourceProbe.height:sourceProbe.width)||renderAuthorityProbe.height!==(rotated?sourceProbe.width:sourceProbe.height))throw Error('HDR alpha render authority lost source dimensions');
    if(!Number.isSafeInteger(renderAuthorityProbe.frame_count)||!renderAuthorityProbe.frame_count)throw Error('HDR alpha authority frame count is unverified');
  }
  createPreviewProxy(
    options.renderAuthorityPath,
    options.previewProxyPath,
    options.previewWidth,
    options.previewHeight,
    fps,alpha,
  );
  const previewProxyProbe = probeVideo(options.previewProxyPath,{countFrames:alpha});
  assertBt709Sdr(previewProxyProbe, "Preview proxy");
  if (previewProxyProbe.width !== options.previewWidth || previewProxyProbe.height !== options.previewHeight) {
    throw new Error(`Preview proxy dimensions are ${previewProxyProbe.width}x${previewProxyProbe.height}, expected ${options.previewWidth}x${options.previewHeight}`);
  }
  const durationDelta = previewProxyProbe.duration_seconds - renderAuthorityProbe.duration_seconds;
  if (Math.abs(durationDelta) > 1 / fps + 0.001) {
    throw new Error(`Preview/render-authority duration mismatch: ${durationDelta.toFixed(6)} seconds`);
  }
  if (renderAuthorityProbe.frame_count != null && previewProxyProbe.frame_count != null
    && renderAuthorityProbe.frame_count !== previewProxyProbe.frame_count) {
    throw new Error(`Preview/render-authority frame-count mismatch: ${previewProxyProbe.frame_count} vs ${renderAuthorityProbe.frame_count}`);
  }
  const sampleSeconds = [0.2, 0.5, 0.8]
    .map((fraction) => Math.max(0, Math.min(renderAuthorityProbe.duration_seconds - 0.25, renderAuthorityProbe.duration_seconds * fraction)));
  const paritySamples = sampleSeconds.map((second) => ({
    source_second: Number(second.toFixed(3)),
    ssim_all: ssimSample(
      options.renderAuthorityPath,
      options.previewProxyPath,
      second,
      options.previewWidth,
      options.previewHeight,
      fps,alpha,
    ),
  }));
  if (paritySamples.some((sample) => sample.ssim_all < minimumSsim)) {
    throw new Error(`Preview/render-authority parity failed: ${JSON.stringify(paritySamples)}`);
  }

  // Opaque and alpha authorities alike hold code values; the cutout keeps its own transfer and primaries.
  const sourceEncoding = hdrSourceEncoding(options.sourcePath, sourceProbe);
  if (sourceEncoding.max_cll_nits == null && options.encodingReferencePath && fs.existsSync(options.encodingReferencePath)) {
    const reference = probeVideo(options.encodingReferencePath);
    if (reference.color_transfer === sourceProbe.color_transfer) sourceEncoding.max_cll_nits = hdrSourceEncoding(options.encodingReferencePath, reference).max_cll_nits;
  }
  let alphaPreservation:ColorManagedVideoReceipt['alpha_preservation'];
  if(alpha){
    if(!probeHasAlphaChannel(renderAuthorityProbe)||!probeHasAlphaChannel(previewProxyProbe))throw Error('Color-managed pair lost transparency');
    if(!alphaDeviation||!alphaDeviationWithinTolerance(alphaDeviation,alphaTolerance))throw Error(`Color conversion changed the cadence-mapped alpha plane beyond tolerance: ${JSON.stringify(alphaDeviation)}`);
    if(alphaDeviation.frames!==renderAuthorityProbe.frame_count)throw Error(`Alpha check covered ${alphaDeviation.frames} frames; the authority has ${renderAuthorityProbe.frame_count}`);
    const samples=sampleSeconds.map(second=>({source_second:Number(second.toFixed(3)),ssim_all:ssimSample(options.renderAuthorityPath,options.previewProxyPath,second,options.previewWidth,options.previewHeight,fps,true,true)}));
    if(samples.some(sample=>sample.ssim_all<minimumSsim))throw Error('Preview alpha parity failed');
    alphaPreservation={authority_encoding:alphaEncoding,measured:alphaDeviation,tolerance:alphaTolerance,preview_parity_samples:samples};
  }

  return {
    schema_version: 1,
    recipe_id: alpha?HDR_CODE_ALPHA_VIDEO_RECIPE:HDR_CODE_VIDEO_RECIPE,
    source_encoding: sourceEncoding,
    ...(alphaPreservation?{alpha_preservation:alphaPreservation}:{}),
    source_path: options.sourcePath,
    source_sha256: sha256File(options.sourcePath),
    source_probe: sourceProbe,
    source_is_hdr: sourceIsHdr,
    render_authority_path: options.renderAuthorityPath,
    render_authority_sha256: sha256File(options.renderAuthorityPath),
    render_authority_probe: renderAuthorityProbe,
    preview_proxy_path: options.previewProxyPath,
    preview_proxy_sha256: sha256File(options.previewProxyPath),
    preview_proxy_probe: previewProxyProbe,
    preview_dimensions: { width: options.previewWidth, height: options.previewHeight },
    duration_delta_seconds: durationDelta,
    parity_samples: paritySamples,
    minimum_ssim: minimumSsim,
    created_at: new Date().toISOString(),
  };
}
