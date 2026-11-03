import { agentTemplate, galleryTemplates } from '@/lib/effects/gallery';
export const dynamic = 'force-dynamic';
/** Read-only: every Templates gallery card with its construction brief, for capability_catalog. */
export async function GET() {
  const { effects, warning } = await galleryTemplates();
  return Response.json({ templates: effects.map(agentTemplate), ...(warning ? { warning } : {}) });
}
