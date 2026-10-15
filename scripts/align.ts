import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { validateAlignment } from "../src/lib/instruments/captions";
import { dictionaryWords, findOovTokens, MFA_G2P_MODEL, MFA_G2P_MODEL_VERSION, parseG2pOutput } from "../src/lib/instruments/oov";

const args = process.argv.slice(2);
const audio = args[0];
const transcriptPath = args[1];
const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
if (!audio || !transcriptPath) throw new Error("usage: pnpm align <audio> <transcript.json|txt> [--pronunciations review.json] [--out alignment.json]");
const rawTranscript = readFileSync(transcriptPath, "utf8").trim();
const text = transcriptPath.endsWith(".json") ? JSON.parse(rawTranscript).text : rawTranscript;
if (typeof text !== "string" || !text.trim()) throw new Error("Transcript has no text.");
const out = value("--out") ?? `${audio}.alignment.json`;
const reviewPath = value("--pronunciations") ?? path.join(path.dirname(out), "pronunciations.json");
const mfaBin = process.env.MFA_BIN ?? "mfa";
const mfaBeam = process.env.MFA_BEAM;
const mfaRoot = process.env.MFA_ROOT_DIR ?? path.join(process.env.HOME ?? "", ".local", "share", "mfa-data");
const dictionaryPath = process.env.MFA_DICTIONARY_PATH ?? path.join(mfaRoot, "pretrained_models", "dictionary", "english_us_mfa.dict");
if (!existsSync(dictionaryPath)) throw new Error(`MFA dictionary not found: ${dictionaryPath}. Set MFA_DICTIONARY_PATH.`);
const oovTokens = findOovTokens(text, dictionaryWords(readFileSync(dictionaryPath, "utf8")));
type Review = Record<string, { token: string; generated_pronunciation: string; confirmed_pronunciation: string; model_version: string }>;
let review: Review = {};
if (existsSync(reviewPath)) review = JSON.parse(readFileSync(reviewPath, "utf8"));
if (oovTokens.length) {
  const g2pInput = path.join(path.dirname(reviewPath), ".mfa-oov-tokens.txt");
  const g2pOutput = path.join(path.dirname(reviewPath), ".mfa-oov-pronunciations.txt");
  writeFileSync(g2pInput, `${oovTokens.join("\n")}\n`);
  execFileSync(mfaBin, ["g2p", g2pInput, MFA_G2P_MODEL, g2pOutput, "--overwrite"], { stdio: "inherit", env: { ...process.env, PATH: `${path.dirname(mfaBin)}:${process.env.PATH ?? ""}` } });
  const generated = parseG2pOutput(readFileSync(g2pOutput, "utf8"));
  for (const token of oovTokens) review[token] ??= { token, generated_pronunciation: generated.get(token) ?? "", confirmed_pronunciation: "", model_version: MFA_G2P_MODEL_VERSION };
}
for (const token of Object.keys(review)) if (!oovTokens.includes(token)) delete review[token];
if (Object.values(review).some((entry) => !entry.confirmed_pronunciation.trim() || entry.model_version !== MFA_G2P_MODEL_VERSION)) {
  mkdirSync(path.dirname(reviewPath), { recursive: true });
  writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
  throw new Error(`Pronunciation confirmation required: edit ${reviewPath}, then rerun.`);
}
const spokenText = text;
const work = path.join(path.dirname(out), ".mfa");
mkdirSync(work, { recursive: true });
const textFile = path.join(work, "transcript.txt");
const mfaOut = path.join(work, "alignment.json");
writeFileSync(textFile, spokenText);
try {
  const alignArgs = ["align_one_hf", audio, textFile, "english_mfa", mfaOut, "--use_g2p", "--output_format", "json", "--overwrite"];
  if (mfaBeam) alignArgs.push("--beam", mfaBeam);
  execFileSync(mfaBin, alignArgs, { stdio: "inherit", env: { ...process.env, PATH: `${path.dirname(mfaBin)}:${process.env.PATH ?? ""}` } });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error("MFA is not installed. Install Montreal Forced Aligner 3.x and rerun.");
  throw error;
}
const mfa = JSON.parse(readFileSync(mfaOut, "utf8"));
const intervals: Array<{ word: string; start: number; end: number }> = [];
const entries = mfa?.tiers?.words?.entries;
if (Array.isArray(entries)) {
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length < 3) continue;
    const [start, end, label] = entry;
    if (typeof start !== "number" || typeof end !== "number" || typeof label !== "string" || !label || label === "<eps>") continue;
    if (label.startsWith("'") && intervals.length) {
      intervals.at(-1)!.word += label;
      intervals.at(-1)!.end = end;
    } else intervals.push({ word: label, start, end });
  }
}
const walk = (node: unknown) => {
  if (Array.isArray(node)) return node.forEach(walk);
  if (!node || typeof node !== "object") return;
  const item = node as Record<string, unknown>;
  const label = item.label ?? item.text ?? item.mark;
  const start = item.begin ?? item.start ?? item.xmin;
  const end = item.end ?? item.stop ?? item.xmax;
  if (typeof label === "string" && typeof start === "number" && typeof end === "number" && label.trim() && !/^<.*>$/.test(label)) intervals.push({ word: label.trim(), start, end });
  Object.values(item).forEach(walk);
};
if (!intervals.length) walk(mfa);
const sourceWords = text.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*[.,!?;:]?/g) ?? [];
if (sourceWords.length !== intervals.length) {
  throw new Error(`MFA returned ${intervals.length} words for ${sourceWords.length} script words; inspect ${mfaOut}.`);
}
const words = validateAlignment(intervals.sort((a, b) => a.start - b.start).map((word, index) => ({ ...word, word: sourceWords[index] })));
if (!words.length) throw new Error("MFA output contained no word intervals.");
writeFileSync(out, `${JSON.stringify(words, null, 2)}\n`);
console.log(out);
