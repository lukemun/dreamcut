import { NextResponse } from "next/server";
import { readProductSignals, recordProductSignal, summarizeProductSignals } from "@/lib/observability/product-signals";

// Fixed-schema, upload-eligible records; see docs/architecture/desktop-data-layout.md.
export async function POST(request: Request) {
  try { return NextResponse.json(recordProductSignal(await request.json())); }
  catch { return NextResponse.json({ error: "Invalid product signal" }, { status: 400 }); }
}
export async function GET() { return NextResponse.json(summarizeProductSignals(readProductSignals())); }
