import { NextResponse } from "next/server";

// Local projects carry no storyboard beats (GET /timeline returns beats: []),
// so there is nothing to patch or delete here.
export async function PATCH() {
  return NextResponse.json({ error: "Local projects have no beats" }, { status: 404 });
}

export async function DELETE() {
  return NextResponse.json({ error: "Local projects have no beats" }, { status: 404 });
}
