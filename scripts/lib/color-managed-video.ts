import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { probeHasAlphaChannel } from "../../src/lib/media-analysis/alpha-channel";
import { COLOR_MANAGED_ALPHA_VIDEO_RECIPE, COLOR_MANAGED_VIDEO_RECIPE, sourceNeedsSdrRenderAuthority } from "../../src/lib/media-analysis/color-profile";

export { COLOR_MANAGED_VIDEO_RECIPE, sourceNeedsSdrRenderAuthority } from "../../src/lib/media-analysis/color-profile";

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

export type ColorManagedVideoReceipt = {
  schema_version: 1;
  recipe_id: typeof COLOR_MANAGED_VIDEO_RECIPE | typeof COLOR_MANAGED_ALPHA_VIDEO_RECIPE;
  alpha_preservation?: { source_plane_sha256: string; render_plane_sha256: string; preview_parity_samples: Array<{source_second:number;ssim_all:number}> };
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

export function createAppleColorStage(sourcePath: string, colorStagePath: string) {
  if (process.platform !== "darwin" || !fs.existsSync("/usr/bin/avconvert")) throw new Error("HDR preparation requires macOS avconvert");
  ensureDirectory(colorStagePath);
  execFileSync("/usr/bin/avconvert", ["--source", sourcePath, "--preset", "PresetHighestQuality", "--output", colorStagePath, "--replace", "--disableSpatialConversion"], { stdio: "inherit" });
}

function createAppleSdrAuthority(sourcePath: string, outputPath: string, preparedColorStage?: string, fps = 30) {
  ensureDirectory(outputPath);
  const colorStagePath = preparedColorStage ?? `${outputPath}.avfoundation-stage.mov`;
  try {
    if (!preparedColorStage) createAppleColorStage(sourcePath, colorStagePath);
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-v",
        "error",
        "-i",
        colorStagePath,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        `fps=${fps},setsar=1,format=yuv420p`,
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "12",
        "-g",
        "30",
        "-keyint_min",
        "30",
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
        "192k",
        "-movflags",
        "+faststart",
        outputPath,
      ],
      { stdio: "inherit" },
    );
  } finally {
    if (!preparedColorStage && fs.existsSync(colorStagePath)) fs.unlinkSync(colorStagePath);
  }
}

/** AVFoundation cannot ingest VP9 alpha. Convert straight RGB through its existing
 * color path, then restore alpha from the unchanged source at the same CFR clock. */
function createAlphaSdrAuthority(sourcePath:string,outputPath:string,sourceProbe:VideoProbe,fps:number){
  ensureDirectory(outputPath);
  const work=fs.mkdtempSync(path.join(path.dirname(outputPath),'.alpha-color-'));
  const decode=sourceProbe.codec==='vp9'?['-c:v','libvpx-vp9']:[];
  const bridge=path.join(work,'opaque-hdr.mov'),color=path.join(work,'sdr.mov');
  try{
    execFileSync('ffmpeg',['-v','error','-nostdin',...decode,'-i',sourcePath,'-map','0:v:0','-an',
      '-vf','setsar=1,format=yuv422p10le','-c:v','prores_ks','-profile:v','3',
      '-color_range',sourceProbe.color_range??'tv','-color_primaries',sourceProbe.color_primaries??'bt709',
      '-color_trc',sourceProbe.color_transfer??'bt709','-colorspace',sourceProbe.color_space??'bt709',bridge],{stdio:'pipe'});
    createAppleSdrAuthority(bridge,color);
    execFileSync('ffmpeg',['-v','error','-nostdin','-i',color,...decode,'-i',sourcePath,
      '-filter_complex',`[0:v]fps=${fps},setpts=PTS-STARTPTS,format=yuv420p[rgb];[1:v]fps=${fps},setpts=PTS-STARTPTS,alphaextract[alpha];[rgb][alpha]alphamerge=shortest=1:repeatlast=0,format=yuva420p[out]`,
      '-map','[out]','-map','1:a:0?','-c:a','libopus','-b:a','192k','-c:v','libvpx-vp9','-lossless','1','-auto-alt-ref','0','-row-mt','1','-cpu-used','4',
      '-r',String(fps),'-fps_mode','cfr','-g',String(fps),'-color_range','tv','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709',outputPath],{stdio:'pipe'});
  }finally{fs.rmSync(work,{recursive:true,force:true});}
}

function alphaPlaneHash(file:string,probe:VideoProbe,fps:number){
  const result=execFileSync('ffmpeg',['-v','error','-nostdin',...(probe.codec==='vp9'?['-c:v','libvpx-vp9']:[]),'-i',file,
    '-vf',`fps=${fps},alphaextract,format=gray`,'-an','-f','hash','-hash','sha256','-'],{encoding:'utf8',maxBuffer:1024*1024});
  const digest=/SHA256=([a-f0-9]{64})/.exec(result)?.[1];
  if(!digest)throw Error('Alpha plane hashing failed');return digest;
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
}): ColorManagedVideoReceipt {
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
  if(alpha){
    if(/p(?:9|10|12|14|16)(?:le|be)?|(?:rgba|bgra)64/.test(sourceProbe.pixel_format??''))throw Error('HDR alpha conversion requires an 8-bit alpha source; higher-precision alpha needs a preserving authority recipe');
    if(fps!==30)throw Error('HDR alpha authority currently requires the shared 30 fps clock');
    if(options.preparedColorStage)throw Error('HDR alpha requires its own verified opaque color bridge');
    if(![options.renderAuthorityPath,options.previewProxyPath].every(file=>path.extname(file)==='.webm'))throw Error('HDR alpha authority and proxy must use WebM containers');
    createAlphaSdrAuthority(options.sourcePath,options.renderAuthorityPath,sourceProbe,fps);
  }else createAppleSdrAuthority(options.sourcePath, options.renderAuthorityPath, options.preparedColorStage, fps);
  const renderAuthorityProbe = probeVideo(options.renderAuthorityPath,{countFrames:alpha});
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

  let alphaPreservation:ColorManagedVideoReceipt['alpha_preservation'];
  if(alpha){
    if(!probeHasAlphaChannel(renderAuthorityProbe)||!probeHasAlphaChannel(previewProxyProbe))throw Error('Color-managed pair lost transparency');
    const sourceHash=alphaPlaneHash(options.sourcePath,sourceProbe,fps),renderHash=alphaPlaneHash(options.renderAuthorityPath,renderAuthorityProbe,fps);
    if(sourceHash!==renderHash)throw Error('Color conversion changed the cadence-mapped alpha plane');
    const samples=sampleSeconds.map(second=>({source_second:Number(second.toFixed(3)),ssim_all:ssimSample(options.renderAuthorityPath,options.previewProxyPath,second,options.previewWidth,options.previewHeight,fps,true,true)}));
    if(samples.some(sample=>sample.ssim_all<minimumSsim))throw Error('Preview alpha parity failed');
    alphaPreservation={source_plane_sha256:sourceHash,render_plane_sha256:renderHash,preview_parity_samples:samples};
  }

  return {
    schema_version: 1,
    recipe_id: alpha?COLOR_MANAGED_ALPHA_VIDEO_RECIPE:COLOR_MANAGED_VIDEO_RECIPE,
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
