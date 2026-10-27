import { StoryboardWorkspace } from "@/components/studio/storyboard/StoryboardWorkspace";
export default async function StoryboardPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <StoryboardWorkspace key={projectId} projectId={projectId} />;
}
