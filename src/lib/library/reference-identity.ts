/** The fields of a Library visual that identify it for the library-selection API. */
export type LibraryReferenceAsset = { catalog_visual_id?: string | null; catalog_image_id?: string | null; upload_id?: string | null };

/** Catalog items resolve by catalog id (copied into the project when used); project media by its path. */
export function libraryReferenceIdentity(asset: LibraryReferenceAsset): string {
  if (asset.catalog_visual_id) return `catalog:visual:${asset.catalog_visual_id}`;
  if (asset.catalog_image_id) return `catalog:image:${asset.catalog_image_id}`;
  return asset.upload_id ?? "";
}
