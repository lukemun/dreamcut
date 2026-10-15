import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function ResourcePage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { projectId } = await params;
  const { tab } = await searchParams;
  redirect(`/?view=user&project=${encodeURIComponent(projectId)}${tab ? `&tab=${encodeURIComponent(tab)}` : ""}`);
}
