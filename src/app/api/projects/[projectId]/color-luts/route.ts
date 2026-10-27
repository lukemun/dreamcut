import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import { activeElements, assertProject, readTimeline } from "@/lib/local-store/store";
import { projectLutsDir } from "@/lib/local-store/paths";
import { MAX_CUBE_LUT_BYTES, parseCubeLut } from "@/lib/timeline/cube-lut";

type Params = { params: Promise<{ projectId: string }> };

function assetUrl(projectId: string, assetId: string) {
  return `/api/projects/${projectId}/media/luts/${assetId}.cube`;
}

function readAsset(filePath: string, projectId: string) {
  const text = fs.readFileSync(filePath, "utf8");
  const parsed = parseCubeLut(text);
  const assetId = path.basename(filePath, ".cube");
  return { asset_id: assetId, title: parsed.title ?? assetId, size: parsed.size, source_url: assetUrl(projectId, assetId) };
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    const dir = projectLutsDir(projectId);
    const assets = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((name) => /^[a-f0-9]{64}\.cube$/.test(name)).sort().map((name) => readAsset(path.join(dir, name), projectId))
      : [];
    return NextResponse.json({ assets });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to list LUTs" }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".cube")) {
      return NextResponse.json({ error: "Choose a .cube LUT file." }, { status: 400 });
    }
    if (file.size > MAX_CUBE_LUT_BYTES) {
      return NextResponse.json({ error: `.cube file exceeds the ${MAX_CUBE_LUT_BYTES / 1024 / 1024} MB limit.` }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const text = buffer.toString("utf8");
    const parsed = parseCubeLut(text);
    const assetId = createHash("sha256").update(buffer).digest("hex");
    const dir = projectLutsDir(projectId);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${assetId}.cube`);
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, buffer);
    return NextResponse.json({
      ok: true,
      asset: { asset_id: assetId, title: parsed.title ?? path.basename(file.name, path.extname(file.name)), size: parsed.size, source_url: assetUrl(projectId, assetId) },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "LUT upload failed" }, { status: 400 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    assertProject(projectId);
    const body = await request.json() as { asset_id?: unknown };
    const assetId = body.asset_id;
    if (typeof assetId !== "string" || !/^[a-f0-9]{64}$/.test(assetId)) {
      return NextResponse.json({ error: "Invalid LUT asset id." }, { status: 400 });
    }
    const references = activeElements(readTimeline(projectId)).filter((element) => element.props?.lut_asset_id === assetId);
    if (references.length > 0) {
      return NextResponse.json({ error: `LUT is used by ${references.length} active clip${references.length === 1 ? "" : "s"}. Reset those clips before deleting it.` }, { status: 409 });
    }
    fs.rmSync(path.join(projectLutsDir(projectId), `${assetId}.cube`), { force: true });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete LUT" }, { status: 500 });
  }
}
