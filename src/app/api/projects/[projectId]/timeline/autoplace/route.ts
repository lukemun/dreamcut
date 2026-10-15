import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { NextResponse } from "next/server";

// Autoplace seeds a timeline from storyboard beats — an app concept (beats,
// still variations, voice clips) that has no local equivalent. Local projects
// start from media files instead.
export const POST = withEditRequestActor(async function POST() {
  return NextResponse.json(
    { error: "Auto-place needs storyboard beats, which local projects don't have. Add clips from the media shelf instead." },
    { status: 501 },
  );
});
