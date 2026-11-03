# Share a recreated effect for maintainer review

Use `template_share` with `prepare_package` / `submit_package` for a **full private contribution**. The agent uploads the implementation, not just a recipe pointing to local code. The maintainer pulls and reviews it, then separately adds it to the catalog. Upload never installs code, executes a test, opens a PR, or publishes a catalog entry.

## Full package

Supply `package.title`, `credit`, the tested editor Git `base_revision`, and an explicit file list. Each file declares its source `root` (`repository` or `project`), relative `path`, portable destination `name`, `role`, and rights/provenance in `license`.

Required roles:

- `recipe`: portable effect definition, input requirements and tunable controls.
- `skill`: the complete owning SKILL.md plus every newly required reference/template file.
- `input`: the actual untreated source footage needed to reproduce the demo.
- `result`: the completed demonstration.
- `instructions`: README with dependency list, exact build/rebuild commands, source clock mapping, required models/tools, installation steps, controls and known limits. Pin unchanged dependencies to `base_revision`; include every new/modified dependency as a file.
- `evidence`: fresh rebuild receipts, verification results and comparison evidence; distinguish passes from unverified claims.
- `license`: credits and permission scope for code, input, demo and supporting assets.

Include `runtime` files for editor/runtime changes and `tests` for their regression cases (required when runtime files are present). Include all needed `asset` files. Code is reviewed as untrusted source, never executed automatically. The manifest validates required roles and byte identity; the agent and reviewer still assess whether dependencies are complete and the effect actually works.

Repository sources may come from `.agents/skills`, `src`, `scripts`, `docs`, `tests`, or `public`. Project sources may come from `media`, `renders`, `instruments`, or `contributions`. Explicit regular files only; no folders, escaped symlinks, credentials or environment files. Inspect text and media for private material before upload. Do not send a whole repository or project as a shortcut.

Limits: 100 files, 50 MiB per file, 500 MiB total. For larger originals, losslessly split the unchanged bytes into numbered parts and include their reassembly order, original SHA-256 and verification command in the instructions. Do not transcode originals merely to fit. If the complete package exceeds the total limit, report it instead of dropping dependencies. No local packaging copy is needed; upload reads the listed files. Temporary preparation artifacts remain owned by the source project until the creator chooses to remove them.

## Prepare and submit

1. Follow effect-authoring and the fresh-rebuild gate. Rendering and uploading each require their own authorization; preserve existing explicit authorization.
2. Call `template_share` with `action: prepare_package`, `project_id`, and `package`. It reads local files only and returns the full manifest and `package_sha256`. Review every inclusion and rights statement.
3. When the creator authorizes uploading those files privately to DreamCut for maintainer review, call `submit_package` with the identical package, returned hash, and their words in `authorization`. Changed contents require preparation again. Do not infer permission from recreating, saving or rendering.
4. Cloud allocates immutable signed upload paths. Retrying the same manifest resumes the same author-scoped package; already-uploaded files are skipped. Submission verifies every file's length and SHA-256 before writing `submitted.json`. Incomplete or corrupt uploads are never listed as submitted.
5. Report the returned id, private `review_path` and status **submitted for review**. This is not catalog publication. The private local receipt records authorization and package hash. Failed uploads leave a draft for retry, not a success claim.

The command-line counterpart uses the identical contract:
`pnpm exec tsx scripts/share-template.ts <project-id> <request.json>`.
Request JSON is the tool body without `project_id`. Prefer MCP for agents.

## After submission

DreamCut's maintainer pulls each package privately, verifies its hashes and reviews code, licenses, inputs, result and rebuild evidence before anything runs or is integrated. Packages sit in a private review inbox; nothing is installed or published automatically, and catalog publication is a separate reviewed release. Existing MCP processes need a restart to expose changed schemas.

## Legacy recipe-only sharing

`prepare` / `submit` and the existing manual sharing form still upload only a saved recipe, result MP4, poster and credit through Cloud recipes v1. Use them only for an already-shipped implementation, never as a substitute for the full contribution above.
