import path from "node:path";
import { spawnBackgroundWorker as spawn } from "@/lib/local-store/background-worker";

import { NextResponse } from "next/server";

import {
  hyperframesOverlayCliArgs,
  parseHyperframesActionRequest,
  type HyperframesActionRequest,
} from "@/lib/hyperframes/actions";
import { listHyperframesCompositions } from "@/lib/local-store/hyperframes-overlays";
import { projectExists } from "@/lib/local-store/paths";

type Params = { params: Promise<{ projectId: string }> };

const activeActions = new Set<string>();
const MAX_OUTPUT_CHARACTERS = 24_000;

function runOverlayAction(projectId: string, request: HyperframesActionRequest): Promise<string> {
  const args = hyperframesOverlayCliArgs(request, projectId);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", path.resolve("scripts/hyperframes-overlay.ts"), ...args.slice(1)], {
      cwd: process.cwd(),
      env: { ...process.env, HYPERFRAMES_SKIP_SKILLS: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const append = (chunk: Buffer) => {
      output = `${output}${chunk.toString("utf8")}`.slice(-MAX_OUTPUT_CHARACTERS);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(output.trim());
      else reject(new Error(output.trim() || `Animation command exited with code ${code ?? "unknown"}`));
    });
  });
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    if (!projectExists(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ compositions: listHyperframesCompositions(projectId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load animations" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  let actionKey: string | null = null;
  try {
    const { projectId } = await params;
    if (!projectExists(projectId)) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const action = parseHyperframesActionRequest(await request.json());
    const key = `${projectId}:${action.composition_id}`;
    if (activeActions.has(key)) {
      return NextResponse.json({ error: "That animation already has an action running" }, { status: 409 });
    }
    activeActions.add(key);
    actionKey = key;
    const output = await runOverlayAction(projectId, action);
    return NextResponse.json({
      ok: true,
      action: action.action,
      output,
      compositions: listHyperframesCompositions(projectId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Animation action failed";
    const status = /Invalid|Unknown|Use letters|requires explicit/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  } finally {
    if (actionKey) activeActions.delete(actionKey);
  }
}
