import { createRequire } from "node:module";
import path from "node:path";
import { createActivityMonitor } from "../src/lib/observability/agent-activity";
import { profileDir } from "../src/lib/local-store/editing-memory";
import { runServerWithOtel } from "../src/lib/observability/server-otel";
import { readEnv } from "../src/lib/env-name";

// Resolve the env loader shipped with this installed Next version.
const nextRequire = createRequire(require.resolve("next/package.json"));
nextRequire("@next/env").loadEnvConfig(process.cwd(), process.argv[2] === "dev");

let stopActivity = () => {};
if (readEnv("ACTIVITY_CAPTURE") === "1") {
  try {
    const activity = createActivityMonitor({ workspace: process.cwd(), directory: path.join(profileDir(), "agent-activity") });
    const capture = () => { try { activity.tick(); } catch { console.warn("Local agent activity capture failed; editing remains available."); } };
    capture();
    const timer = setInterval(capture, 10000);
    stopActivity = () => { clearInterval(timer); activity.close(); };
  } catch (error) { console.warn("Local agent activity:", error instanceof Error ? error.message : "unavailable"); }
}

void runServerWithOtel(process.execPath, [require.resolve("next/dist/bin/next"), ...process.argv.slice(2)])
  .then(code => { process.exitCode = code; })
  .catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => stopActivity());
