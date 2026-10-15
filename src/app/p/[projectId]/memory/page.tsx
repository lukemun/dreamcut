import { notFound, redirect } from "next/navigation";
import { projectExists } from "@/lib/local-store/paths";
export const dynamic = "force-dynamic";
export default async function LegacyMemoryPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (!projectExists(projectId)) notFound();
  redirect(`/p/${projectId}/user`);
}
