import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

if (process.argv.includes("--help")) {
  console.log("DreamCut setup\n  pnpm bootstrap             Check every program and model the editor uses (FFmpeg and Chrome are required)\n  pnpm setup:voice          Also install optional voice enhancement (Python 3.11 or uv, about 400 MB)\n  pnpm setup:speech         Install the caption models (Whisper; MFA models when MFA is installed)\n  pnpm setup:check           Check the standard environment\n  pnpm setup:rust            Check, build and test the Rust preview helper\n  pnpm setup:rust --check    Verify Rust dependencies and decoding; no install/build\n  pnpm dev:rust              Start both preview engines on port 3143");
  process.exit(0);
}
const unknown = process.argv.slice(2).filter(arg => !["--rust", "--check", "--voice"].includes(arg));
if (unknown.length) { console.error(`Unknown setup option: ${unknown.join(", ")}. Use --help.`); process.exit(1); }

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const installVoice = process.argv.includes("--voice");

function fail(message: string): never {
  console.error(`\nSetup stopped: ${message}`);
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

// The same checks an installed DreamCut runs with `node bin/dreamcut.mjs doctor`: FFmpeg and Chrome are required; the
// speech tools, voice enhancement and subject tracing are per-feature and named with the command that adds them.
// --voice first installs or repairs voice enhancement (scripts/setup-voice.mjs).
if (installVoice && spawnSync(process.execPath, [path.join(root, "scripts", "setup-voice.mjs")], { stdio: "inherit" }).status !== 0) process.exit(1);
if (spawnSync(process.execPath, [path.join(root, "scripts", "doctor.mjs")], { stdio: "inherit" }).status !== 0) {
  fail("install the required tools marked ✗ above, then run this again.");
}
console.log(checkOnly ? "\nSetup check passed." : "\nSetup complete. Start the editor with `pnpm editor`.");

}
