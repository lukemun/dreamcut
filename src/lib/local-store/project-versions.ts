import { listProjectIds } from "@/lib/local-store/paths";
import { readMetadata, type ProjectMetadata } from "@/lib/local-store/store";

export type ProjectVersion = {
  projectId: string;
  label: string;
  title: string;
  order: number;
};

export function buildProjectVersionFamily(
  currentProjectId: string,
  currentMetadata: ProjectMetadata,
  projects: Array<{ projectId: string; metadata: ProjectMetadata }>,
): ProjectVersion[] {
  const groupId = currentMetadata.version_group_id;
  const family = groupId
    ? projects.filter(({ metadata }) => metadata.version_group_id === groupId)
    : projects.filter(({ projectId }) => projectId === currentProjectId);

  return family
    .map(({ projectId, metadata }) => ({
      projectId,
      label: metadata.version_label ?? metadata.title ?? projectId,
      title: metadata.title ?? projectId,
      order: metadata.version_order ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

export function listProjectVersionFamily(projectId: string): ProjectVersion[] {
  const currentMetadata = readMetadata(projectId);
  if (!currentMetadata.version_group_id) {
    return buildProjectVersionFamily(projectId, currentMetadata, [{ projectId, metadata: currentMetadata }]);
  }
  const projects = listProjectIds().flatMap((candidateId) => {
    try {
      return [{ projectId: candidateId, metadata: readMetadata(candidateId) }];
    } catch {
      return [];
    }
  });

  return buildProjectVersionFamily(projectId, currentMetadata, projects);
}
