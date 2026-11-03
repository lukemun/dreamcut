import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const input = args[0];
const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
if (!input) throw new Error("usage: pnpm transcribe <audio> [--script known.txt] [--out transcript.json] [--model ggml.bin] [--vad-model silero.bin] [--words]");
// --words: one whisper segment per word, so the result carries approximate word timings.
const words = args.includes("--words");
const output = value("--out") ?? `${input}.transcript.json`;
const model = value("--model") ?? process.env.WHISPER_MODEL ?? path.join(os.homedir(), ".cache/whisper-models/ggml-small.bin");
const vadModel = value("--vad-model") ?? process.env.WHISPER_VAD_MODEL ?? path.join(os.homedir(), ".cache/whisper-models/ggml-silero-v6.2.0.bin");
if (!existsSync(model)) throw new Error(`Whisper model missing: ${model}. Run \`pnpm setup:speech\`.`);
if (!existsSync(vadModel)) throw new Error(`Silero VAD model missing: ${vadModel}. Run \`pnpm setup:speech\`, or set WHISPER_VAD_MODEL.`);
const work = path.join(path.dirname(output), ".transcribe");
mkdirSync(work, { recursive: true });
const wav = path.join(work, "input.wav");
const prefix = path.join(work, "whisper");
execFileSync("ffmpeg", ["-y", "-v", "error", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav], { stdio: "inherit" });
try {
  execFileSync("whisper-cli", ["--vad", "--vad-model", vadModel, "--model", model, "--language", "en", "--output-json", ...(words ? ["--max-len", "1", "--split-on-word"] : []), "--output-file", prefix, wav], { stdio: "inherit" });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("whisper-cli is not installed. `pnpm setup:check` names the command that installs it.");
  throw error;
}
const raw = JSON.parse(readFileSync(`${prefix}.json`, "utf8"));
type Segment = { text?: string; offsets?: { from: number; to: number } };
const timed = words ? (raw.transcription ?? []).flatMap((segment: Segment) => {
  const text = (segment.text ?? "").trim();
  return text && segment.offsets ? [{ text, start: segment.offsets.from / 1000, end: segment.offsets.to / 1000 }] : [];
}) : undefined;
const asrText = timed ? timed.map((word: { text: string }) => word.text).join(" ") : (raw.transcription ?? []).map((segment: Segment) => segment.text ?? "").join(" ").trim();
const scriptPath = value("--script");
const text = scriptPath ? readFileSync(scriptPath, "utf8").trim() : asrText;
if (!text) throw new Error("VAD found no transcribable speech.");
const result = { input, language: "en", vad: { model: vadModel, gated: true }, source: scriptPath ? "known_script" : "asr", text, asr_text: asrText, ...(timed ? { words: timed } : {}) };
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(output);
