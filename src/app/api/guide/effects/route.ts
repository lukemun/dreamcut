import { galleryTemplates } from '@/lib/effects/gallery';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json(await galleryTemplates());
}
