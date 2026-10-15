import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { legacyVoiceEnhancementVenvDirs, voiceEnhancementVenvDir } from "@/lib/local-store/audio-effects";

if (process.argv.includes("--help")) {
  console.log("DreamCut setup\n  pnpm bootstrap             Check the editor prerequisites (FFmpeg, Chrome)\n  pnpm setup:voice          Also install optional voice enhancement (Python 3.11 or uv, about 400 MB)\n  pnpm setup:check           Check the standard environment\n  pnpm setup:rust            Check, build and test the Rust preview helper\n  pnpm setup:rust --check    Verify Rust dependencies and decoding; no install/build\n  pnpm dev:rust              Start both preview engines on port 3143");
  process.exit(0);
}
const unknown = process.argv.slice(2).filter(arg => !["--rust", "--check", "--voice"].includes(arg));
if (unknown.length) { console.error(`Unknown setup option: ${unknown.join(", ")}. Use --help.`); process.exit(1); }

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const installVoice = process.argv.includes("--voice");
const deepFilterIn = (directory: string) => process.platform === "win32"
  ? path.join(directory, "Scripts", "deepFilter.exe")
  : path.join(directory, "bin", "deepFilter");
// Reuse an environment installed under an earlier product name instead of reinstalling.
const venvDir = [voiceEnhancementVenvDir(), ...legacyVoiceEnhancementVenvDirs()].find(directory => fs.existsSync(deepFilterIn(directory)))
  ?? voiceEnhancementVenvDir();
const venvPython = process.platform === "win32"
  ? path.join(venvDir, "Scripts", "python.exe")
  : path.join(venvDir, "bin", "python");
const deepFilter = deepFilterIn(venvDir);

function run(command: string, args: string[], options: { quiet?: boolean } = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: options.quiet ? "pipe" : "inherit",
  });
  return result;
}

function available(command: string, args: string[] = ["--version"]) {
  const result = run(command, args, { quiet: true });
  return result.status === 0;
}

function fail(message: string, showSystemHints = false): never {
  console.error(`\nSetup stopped: ${message}`);
  if (showSystemHints && process.platform === "darwin") {
    console.error("Install missing system tools with: brew install ffmpeg python@3.11");
  } else if (showSystemHints && process.platform === "win32") {
    console.error("Install missing system tools with:");
    console.error("  winget install Gyan.FFmpeg");
    console.error("  winget install Python.Python.3.11");
  } else if (showSystemHints) {
    console.error("Install FFmpeg and Python 3.11 using your system package manager.");
  }
  process.exit(1);
}

const packageJsonPath = path.join(root, "package.json");
if (!fs.existsSync(packageJsonPath)) fail("run this command from the DreamCut folder.");

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "", 10);
if (!Number.isFinite(nodeMajor) || nodeMajor < 22) {
  fail(`Node.js 22 or 24 (LTS) is required; this process is using ${process.versions.node}.`);
}
// Odd-numbered Node releases lack prebuilt native modules (better-sqlite3), so fresh installs can fail there.
if (nodeMajor % 2 === 1) console.warn(`Node.js ${process.versions.node} is not an LTS release; if \`pnpm install\` failed to build better-sqlite3, switch to Node 22 or 24.`);

if (process.argv.includes("--rust")) {
  void (async () => {
    const {setupRustPreview} = await import("../src/lib/native-preview/setup");
    await setupRustPreview({root, checkOnly, confirmInstall: async message => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
      const {createInterface} = await import("node:readline/promises");
      const prompt = createInterface({input: process.stdin, output: process.stdout});
      try { return /^y(es)?$/i.test((await prompt.question(`${message} [y/N] `)).trim()); }
      finally { prompt.close(); }
    }});
  })().then(() => process.exit(0)).catch(error => fail(error instanceof Error ? error.message : String(error)));
} else {
console.log(`DreamCut setup (${process.platform})`);

if (!available("ffmpeg", ["-version"]) || !available("ffprobe", ["-version"])) {
  fail("FFmpeg and ffprobe must both be available on PATH.", true);
}
console.log("✓ FFmpeg is available");

const renderBrowser = run(process.execPath, ["--input-type=module", "-e",
  'import {chromium} from "playwright-core"; const browser=await chromium.launch({channel:"chrome",headless:true}); await browser.close();'
], {quiet:true});
if (renderBrowser.status !== 0) fail("Chrome is required for exports. Run `pnpm exec playwright-core install chrome` (Linux: add --with-deps), then retry setup.");
console.log("✓ Render browser is available");

const voiceReady = fs.existsSync(deepFilter) && available(deepFilter, ["--help"]);
if (voiceReady || !installVoice) {
  // Voice enhancement is optional: the editor runs without it, and only the "Enhance voice" action needs it.
  console.log(voiceReady ? "✓ Voice enhancement is installed" : "– Voice enhancement is optional and not installed (`pnpm setup:voice` adds it, about 400 MB)");
  console.log(checkOnly ? "\nSetup check passed." : "\nSetup complete. Start the editor with `pnpm dev`.");
  process.exit(0);
}

const requirements = path.join(root, "scripts", "audio-enhance-requirements.txt");
const hasUv = available("uv");
if (hasUv) {
  console.log("Installing the pinned voice enhancement environment with uv…");
  if (run("uv", ["venv", "--clear", venvDir, "--python", "3.11"]).status !== 0) {
    fail("uv could not create the Python 3.11 environment.", true);
  }
  if (run("uv", ["pip", "install", "--python", venvPython, "-r", requirements]).status !== 0) {
    fail("the DeepFilterNet package could not be installed.");
  }
} else {
  const python = process.platform === "win32"
    ? { command: "py", args: ["-3.11"] }
    : { command: "python3.11", args: [] };
  if (!available(python.command, [...python.args, "--version"])) {
    fail("Python 3.11 is required (uv is also supported when installed).", true);
  }
  console.log("Installing the pinned voice enhancement environment with Python 3.11…");
  if (run(python.command, [...python.args, "-m", "venv", "--clear", venvDir]).status !== 0) {
    fail("Python could not create the voice enhancement environment.");
  }
  if (run(venvPython, ["-m", "pip", "install", "-r", requirements]).status !== 0) {
    fail("the DeepFilterNet package could not be installed.");
  }
}

if (!fs.existsSync(deepFilter) || !available(deepFilter, ["--help"])) {
  fail("DeepFilterNet installed without a working deepFilter command.");
}

console.log("✓ Voice enhancement is installed");
console.log("\nSetup complete. Start the editor with `pnpm dev`.");

}
