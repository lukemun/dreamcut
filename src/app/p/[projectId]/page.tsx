import { notFound } from "next/navigation";

import { projectExists } from "@/lib/local-store/paths";
import { EditorClient } from "./EditorClient";
import type { TimelineWorkspaceProfileId } from "@/components/studio/timeline/workspace-profile";

export const dynamic = "force-dynamic";

export default async function ProjectEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ embed?: string; profile?: string; at?: string }>;
}) {
  const { projectId } = await params;
  const { profile, at } = await searchParams;
  if (!projectExists(projectId)) {
    notFound();
  }
  const workspaceProfile: TimelineWorkspaceProfileId = profile === "simple" ? "simple" : "full";
  return (
    <EditorClient
      projectId={projectId}
      workspaceProfile={workspaceProfile}
      initialSeekSeconds={at !== undefined && Number.isFinite(Number(at)) ? Math.max(0, Number(at)) : undefined}
    />
  );
}
