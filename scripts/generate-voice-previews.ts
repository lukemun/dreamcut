/**
 * Makes the voice samples the Generate form's voice picker plays: one short line per voice, in the voice's language,
 * from each voiceover model's best quality. Writes public/voice-previews/<model>/<voice>.mp3 (mono, 48 kbps, -18 LUFS) and
 * skips samples that already exist, so a rerun only fills in voices added to voices.ts.
 *
 * Run: OPENROUTER_API_KEY=… pnpm exec tsx scripts/generate-voice-previews.ts [model-id …]
 * Spends OpenRouter credit (about $1 for every voice); never run it from an agent without the owner's go-ahead.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLOUD_MODELS } from "../src/lib/generation/asset-models";
import { modelVoices, voicePreviewUrl, type Voice } from "../src/lib/generation/voices";

const LINES: Record<string, string> = {
  English: "Hi there. This is how I sound reading your script, line by line.",
  Czech: "Ahoj! Takhle zním, když čtu váš scénář řádek po řádku.",
  Danish: "Hej! Sådan lyder jeg, når jeg læser dit manuskript linje for linje.",
  German: "Hallo! So klinge ich, wenn ich Ihr Skript Zeile für Zeile vorlese.",
  Spanish: "¡Hola! Así sueno cuando leo tu guion, línea por línea.",
  Finnish: "Hei! Tältä kuulostan, kun luen käsikirjoituksesi rivi riviltä.",
  French: "Bonjour ! Voici comment je sonne en lisant votre texte, ligne par ligne.",
  Hindi: "नमस्ते! आपकी स्क्रिप्ट को पंक्ति दर पंक्ति पढ़ते हुए मेरी आवाज़ ऐसी लगती है।",
  Hungarian: "Szia! Így hangzom, amikor sorról sorra felolvasom a forgatókönyvedet.",
  Indonesian: "Halo! Beginilah suara saya saat membacakan naskah Anda baris demi baris.",
  Italian: "Ciao! Ecco come suono mentre leggo il tuo copione, riga per riga.",
  Japanese: "こんにちは。台本を一行ずつ読むと、こんな声になります。",
  Korean: "안녕하세요! 대본을 한 줄씩 읽으면 이런 목소리예요.",
  Norwegian: "Hei! Slik høres jeg ut når jeg leser manuset ditt linje for linje.",
  Dutch: "Hallo! Zo klink ik wanneer ik je script regel voor regel voorlees.",
  Polish: "Cześć! Tak brzmię, gdy czytam twój scenariusz linijka po linijce.",
  Portuguese: "Olá! É assim que eu soo lendo o seu roteiro, linha por linha.",
  Romanian: "Salut! Așa sun când îți citesc scenariul, rând cu rând.",
  Russian: "Привет! Вот так я звучу, когда читаю ваш сценарий строка за строкой.",
  Swedish: "Hej! Så här låter jag när jag läser ditt manus rad för rad.",
  Thai: "สวัสดี! นี่คือเสียงของฉันเวลาอ่านสคริปต์ของคุณทีละบรรทัด",
  Turkish: "Merhaba! Senaryonu satır satır okurken sesim böyle çıkıyor.",
  Vietnamese: "Xin chào! Đây là giọng của tôi khi đọc kịch bản của bạn từng dòng một.",
  Chinese: "你好！这就是我逐行朗读你的脚本时的声音。",
};
/** "English (UK)" → English; voices without a language read English. */
const lineFor = (voice: Voice) => LINES[(voice.group ?? "English").replace(/ \(.*\)$/, "")] ?? LINES.English;

const key = process.env.OPENROUTER_API_KEY?.trim();
if (!key) throw new Error("Set OPENROUTER_API_KEY.");
const only = new Set(process.argv.slice(2));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "voice-previews-"));
const jobs = CLOUD_MODELS.filter(m => m.speech && (!only.size || only.has(m.id)))
  .flatMap(model => modelVoices(model.id).map(voice => ({ model, voice, file: path.join("public", voicePreviewUrl(model.id, voice.id)) })))
  .filter(job => !fs.existsSync(job.file));

async function sample({ model, voice, file }: (typeof jobs)[number]) {
  const variant = model.speech!.variants.best, format = model.speech!.format;
  const response = await fetch("https://openrouter.ai/api/v1/audio/speech", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: variant.model, input: lineFor(voice), voice: `${voice.id}${variant.voiceSuffix ?? ""}`, response_format: format }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`${model.id}/${voice.id}: ${response.status} ${(await response.text()).slice(0, 200)}`);
  const type = response.headers.get("content-type") ?? "";
  const raw = path.join(scratch, `${model.id}-${voice.id}.${format}`);
  fs.writeFileSync(raw, new Uint8Array(await response.arrayBuffer()));
  const input = type.startsWith("audio/pcm")
    ? ["-f", "s16le", "-ar", type.match(/rate=(\d+)/)?.[1] ?? "24000", "-ac", type.match(/channels=(\d+)/)?.[1] ?? "1", "-i", raw]
    : ["-i", raw];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // One loudness for every sample, so voices are compared by sound rather than level.
  execFileSync("ffmpeg", ["-v", "error", "-y", ...input, "-af", "loudnorm=I=-18:TP=-1.5:LRA=11", "-ac", "1", "-ar", "44100", "-b:a", "48k", file]);
}

async function main() {
  let failed = 0;
  for (let i = 0; i < jobs.length; i += 4) {
    const batch = await Promise.allSettled(jobs.slice(i, i + 4).map(sample));
    for (const result of batch) if (result.status === "rejected") { failed++; console.error(String(result.reason)); }
    process.stdout.write(`\r${Math.min(i + 4, jobs.length)}/${jobs.length}`);
  }
  fs.rmSync(scratch, { recursive: true, force: true });
  console.log(`\n${jobs.length - failed} samples written, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}
void main();
