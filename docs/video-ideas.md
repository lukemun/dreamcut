# Personal video ideas

**User → Video ideas** holds references, hooks, filming concepts and editing notes
across projects. The URL uses `?tab=ideas`. Saving an idea does not create a project,
alter a timeline, or activate a style preference.

The page supports adding notes or a source link, editing, searching by title/concept/
creator/tag, filtering by status, and related effect/project links. Status is Saved,
Planned, In production, Made or Archived. Archive and restore use the status field
in Edit idea. Cancel discards a draft; Undo changes restores the previous saved
values for the latest edit in the mounted page. It is separate from timeline Undo.
Reloading clears that temporary undo action. There is no destructive delete action.

## Storage and media

The existing `profileDir()` resolver owns location and environment overrides.
Each `video-ideas/<uuid>/idea.json` record is authoritative; listing scans records
rather than maintaining a second index. Bad records are reported without hiding
healthy records. Private content is not added to the shared effects catalog.

`src/lib/video-ideas.ts` defines the versioned record and input schema. The local
store uses per-record locks, expected revisions and atomic writes. A stale save
returns 409 and preserves the draft in the UI. Saved reference and poster artifacts
use fixed filenames and SHA-256 identities. The media route checks containment and
hashes before using the shared range-aware streaming response.

`/api/user/video-ideas` lists records and accepts validated create/update requests.
It does not download arbitrary URLs or accept server filesystem paths. Notes-only
and URL-only entries are useful saved ideas; the UI labels links without downloaded
media explicitly. Source credits and capture/editing notes remain user-editable.

## Prepared local references

An agent can prepare a reference with the media-intake/recreate-effect workflows,
then use the reusable import command:

```sh
pnpm exec tsx scripts/import-video-idea.ts --input idea-input.json --reference reference.mp4 --poster poster.jpg
```

The JSON input has `title`, `concept`, `source_url`, `credit`, `capture_notes`,
`edit_notes`, `tags` (array), `status`, and `links` (array of `{title, url}`).
Only title must be nonempty; optional text fields use empty strings. Reference and
poster arguments are optional. Prepare a browser-playable MP4 and a JPEG poster
before importing; the command copies unchanged bytes and does not transcode.
Keep the original source, attribution, preparation receipts and detailed analysis
in the private intake collection. The importer reuses an existing reference hash
(or source URL for link-only imports) rather than overwriting the existing idea.

An idea can link to several effects and projects. The current feature records those
links; it does not automatically create assemblies, download references in the
browser, or turn a concept into a verified effect recipe.
