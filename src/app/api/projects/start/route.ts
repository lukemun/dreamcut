import { NextResponse } from "next/server";
import { z } from "zod";

import { startProjectFromHome } from "@/lib/local-store/home-start";

/** Home's Start project: creates the project with the creator's brief waiting for its first build. */
export async function POST(request: Request) {
  try {
    return NextResponse.json(startProjectFromHome(await request.json()), { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Write what you'd like to make, up to 2,000 characters." }, { status: 400 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not start the project" }, { status: 500 });
  }
}
