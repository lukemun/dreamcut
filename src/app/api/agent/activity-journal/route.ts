import { NextResponse } from "next/server";
import { recordEpisodeBatch } from "@/lib/observability/activity-journal";

// Ordered episode records from the desktop chat; see docs/architecture/desktop-data-layout.md#activity-journal.
export async function POST(request: Request) {
  try { return NextResponse.json(recordEpisodeBatch(await request.json())); }
  catch { return NextResponse.json({ error: "Invalid episode records" }, { status: 400 }); }
}
