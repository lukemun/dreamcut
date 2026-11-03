import { findCoreSkill } from "@/lib/local-store/editing-memory";

export const dynamic = "force-dynamic";

// Resolve only installed skill names; never interpret the URL as a file path.
export async function GET(_request: Request, { params }: { params: Promise<{ skill: string }> }) {
  const { skill } = await params;
  if (!/^[a-z0-9-]+$/.test(skill)) return new Response("Skill not found", { status: 404 });
  const installed = findCoreSkill(skill);
  if (!installed) return new Response("Skill not found", { status: 404 });
  return new Response(installed.content, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" },
  });
}
