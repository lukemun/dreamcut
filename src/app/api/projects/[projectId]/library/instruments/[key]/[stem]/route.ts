import path from "node:path";
import fs from "node:fs";
import { instrumentDirectory } from "@/lib/local-store/instrument-analysis";
import { instrumentResultSchema } from "@/lib/timeline/instrument-analysis";
import { streamFileResponse } from "@/lib/local-store/stream-file";
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string; key: string; stem: string }> }) {
  try {
    const { projectId, key, stem } = await params;
    if (!["mix", "drums", "bass", "other", "vocals"].includes(stem)) throw new Error("Unknown instrument");
    const directory = instrumentDirectory(projectId, key);
    instrumentResultSchema.parse(JSON.parse(fs.readFileSync(path.join(directory, "manifest.json"), "utf8")));
    return streamFileResponse(path.join(directory, `${stem}.wav`), request, { contentType: "audio/wav" });
  } catch { return Response.json({ error: "Instrument audio is not ready" }, { status: 404 }); }
}
