import { notFound } from "next/navigation";
import { readTemplateDraft } from "@/lib/local-store/template-drafts";
import { TemplateDraftPage } from "./TemplateDraftPage";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ draftId: string }> }) {
  const { draftId } = await params;
  let draft;
  try { draft = readTemplateDraft(draftId); } catch { notFound(); }
  return <TemplateDraftPage initial={draft} />;
}
