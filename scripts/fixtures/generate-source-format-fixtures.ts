/**
 * Generates short synthetic clips for every source-format class that has a fixture, so media
 * features can be checked against phone-like footage without committing creator media.
 * Usage: pnpm fixtures:source-formats [--out <dir>]. Writes <dir>/manifest.json.
 * Policy: docs/standards/source-format-coverage.md.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SOURCE_FORMAT_CLASSES, sourceFormatTraits, type SourceFormatClassId } from "../../src/lib/media-analysis/source-format-coverage";

const outIndex = process.argv.indexOf("--out");
const outDir = path.resolve(outIndex > 0 ? process.argv[outIndex + 1]! : path.join(os.tmpdir(), "dreamcut-source-format-fixtures"));
fs.mkdirSync(outDir, { recursive: true });

const SOURCE = ["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2"];
const AUDIO = ["-c:a", "aac", "-b:a", "128k", "-shortest"];
const BT709 = ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"];
// Converts the SDR pattern into BT.2020 code values with the named HDR transfer.
const toHdr = (transfer: "arib-std-b67" | "smpte2084") => ["-vf", `setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv,zscale=t=linear:npl=203,format=gbrpf32le,zscale=p=bt2020,zscale=t=${transfer}:m=bt2020nc:r=limited:npl=203,format=yuv420p10le`];
const MASTERING = "master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)L(10000000,1):max-cll=1000,400";

type Fixture = { file: string; args: string[]; remux?: string[] };
const FIXTURES: Partial<Record<SourceFormatClassId, Fixture>> = {
  "sdr-h264-709": { file: "sdr-h264-709.mp4", args: [...SOURCE, "-c:v", "libx264", "-pix_fmt", "yuv420p", ...BT709, ...AUDIO] },
  "sdr-hevc-709": { file: "sdr-hevc-709.mov", args: [...SOURCE, "-c:v", "libx265", "-x265-params", "log-level=error", "-pix_fmt", "yuv420p", "-tag:v", "hvc1", ...BT709, ...AUDIO] },
  "sdr-601-sd": { file: "sdr-601-sd.mp4", args: [...SOURCE, "-vf", "scale=720:480,setsar=8/9", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-color_primaries", "smpte170m", "-color_trc", "smpte170m", "-colorspace", "smpte170m", ...AUDIO] },
  "sdr-full-range": { file: "sdr-full-range.mp4", args: [...SOURCE, "-vf", "scale=in_range=tv:out_range=pc", "-c:v", "libx264", "-pix_fmt", "yuvj420p", "-color_range", "pc", ...BT709, ...AUDIO] },
  "hlg-hevc-10bit": { file: "hlg-hevc-10bit.mov", args: [...SOURCE, ...toHdr("arib-std-b67"), "-c:v", "libx265", "-x265-params", "log-level=error:colorprim=bt2020:transfer=arib-std-b67:colormatrix=bt2020nc", "-tag:v", "hvc1", "-color_primaries", "bt2020", "-color_trc", "arib-std-b67", "-colorspace", "bt2020nc", ...AUDIO] },
  "pq-hevc-10bit": { file: "pq-hevc-10bit.mov", args: [...SOURCE, ...toHdr("smpte2084"), "-c:v", "libx265", "-x265-params", `log-level=error:hdr10=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:${MASTERING}`, "-tag:v", "hvc1", "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc", ...AUDIO] },
  // 30 fps for the first second, then 24 fps: the cadence change phones produce in low light.
  "variable-frame-rate": { file: "variable-frame-rate.mp4", args: [...SOURCE, "-vf", "select='lt(n\\,30)+not(mod(n\\,5))',setpts='if(lt(N\\,30)\\,N/30\\,1+(N-30)/24)/TB'", "-fps_mode", "vfr", "-c:v", "libx264", "-pix_fmt", "yuv420p", ...BT709, ...AUDIO] },
  "rotation-metadata": { file: "rotation-metadata-base.mp4", args: [...SOURCE, "-c:v", "libx264", "-pix_fmt", "yuv420p", ...BT709, ...AUDIO], remux: ["-display_rotation", "90"] },
  "still-srgb": { file: "still-srgb.png", args: ["-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=1:duration=1", "-frames:v", "1"] },
};

function probe(file: string) {
  const out = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_streams", "-show_entries", "stream_side_data", "-of", "json", file], { encoding: "utf8" }));
  const stream = out.streams?.[0] ?? {};
  const rotation = stream.side_data_list?.find((entry: { rotation?: number }) => entry.rotation != null)?.rotation ?? null;
  const rate = (value: string | undefined) => { const [n, d] = String(value ?? "0/1").split("/").map(Number); return d ? n! / d : 0; };
  return {
    codec_name: stream.codec_name ?? null,
    pixel_format: stream.pix_fmt ?? null,
    color_transfer: stream.color_transfer ?? null,
    color_primaries: stream.color_primaries ?? null,
    color_range: stream.color_range ?? null,
    height: stream.height ?? null,
    rotation_degrees: rotation,
    variable_frame_rate: Math.abs(rate(stream.r_frame_rate) - rate(stream.avg_frame_rate)) > 0.01,
    hdr10_plus: execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-read_intervals", "%+#1", "-show_frames", "-show_entries", "frame_side_data=side_data_type", "-of", "csv=p=0", file], { encoding: "utf8" }).includes("2094-40"),
  };
}

const manifest: Array<{ class: SourceFormatClassId; file: string | null; status: "ready" | "unavailable"; reason?: string; traits?: SourceFormatClassId[] }> = [];
for (const formatClass of SOURCE_FORMAT_CLASSES) {
  const fixture = FIXTURES[formatClass.id];
  if (!fixture) { manifest.push({ class: formatClass.id, file: null, status: "unavailable", reason: "No synthetic fixture; check with a real device file." }); continue; }
  const target = path.join(outDir, fixture.remux ? fixture.file.replace("-base", "") : fixture.file);
  const encoded = path.join(outDir, fixture.file);
  try {
    execFileSync("ffmpeg", ["-v", "error", "-y", ...fixture.args, encoded], { stdio: "pipe" });
    if (fixture.remux) { execFileSync("ffmpeg", ["-v", "error", "-y", ...fixture.remux, "-i", encoded, "-c", "copy", target], { stdio: "pipe" }); fs.rmSync(encoded); }
    const traits = sourceFormatTraits(probe(target));
    if (!traits.includes(formatClass.id) && !formatClass.id.startsWith("still-")) throw new Error(`probed as ${traits.join(", ")}`);
    manifest.push({ class: formatClass.id, file: path.basename(target), status: "ready", traits });
  } catch (error) {
    const reason = error instanceof Error ? (("stderr" in error && String(error.stderr).trim()) || error.message).split("\n")[0]! : String(error);
    manifest.push({ class: formatClass.id, file: null, status: "unavailable", reason });
  }
}

fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify({ generated_at: new Date().toISOString(), ffmpeg: execFileSync("ffmpeg", ["-hide_banner", "-version"], { encoding: "utf8" }).split("\n")[0], fixtures: manifest }, null, 2)}\n`);
for (const row of manifest) console.log(`${row.status === "ready" ? "ok  " : "skip"} ${row.class}${row.file ? ` → ${row.file}` : ` (${row.reason})`}`);
console.log(`Fixtures in ${outDir}`);
