import { notFound, redirect } from "next/navigation";
import { projectExists } from "@/lib/local-store/paths";
export const dynamic = "force-dynamic";
/** Generate is a drawer in Library now; old links open it there. */
export default async function GeneratePage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { projectId } = await params;
  if (!projectExists(projectId)) notFound();
  const pane = (await searchParams).pane === "results" ? "results" : "create";
  redirect(`/p/${encodeURIComponent(projectId)}/library?generate=${pane}`);
}
