import fs from "node:fs";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { readCoverLayoutProposal } from "@/lib/layout-proposals/cover-layout";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _request: NextRequest,
  context: {
    params: Promise<{
      projectId: string;
      layoutId: string;
      coverId: string;
    }>;
  },
) {
  try {
    const { projectId, layoutId, coverId } = await context.params;
    const proposal = readCoverLayoutProposal(projectId, layoutId);
    const item = proposal.items.find((candidate) => candidate.id === coverId);
    if (!item) {
      return NextResponse.json({ error: "Cover is not part of this layout proposal" }, { status: 404 });
    }
    if (!item.asset_url.startsWith("/research/") || item.asset_url.includes("..")) {
      return NextResponse.json({ error: "Unsupported cover asset path" }, { status: 422 });
    }

    const publicRoot = path.resolve(process.cwd(), "../..", "public");
    const file = path.resolve(publicRoot, item.asset_url.slice(1));
    if (!file.startsWith(`${publicRoot}${path.sep}`) || !fs.existsSync(file)) {
      return NextResponse.json({ error: "Cover thumbnail not found" }, { status: 404 });
    }
    const contentType = CONTENT_TYPES[path.extname(file).toLowerCase()];
    if (!contentType) {
      return NextResponse.json({ error: "Unsupported cover thumbnail type" }, { status: 422 });
    }

    return new NextResponse(fs.readFileSync(file), {
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const status = typeof error === "object" && error && "status" in error
      ? Number((error as { status?: unknown }).status) || 500
      : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load cover thumbnail" },
      { status },
    );
  }
}
