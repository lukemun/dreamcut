# Personal skills

User → Skills shows shared Catalog skills and local Personal skills together, with
All / Personal / Catalog filters. Catalog skills come from `skillsDirectory()`;
presence in the curated `catalog.json` is presentation metadata, not ownership.

Personal skills live at `profileDir()/skills/<name>/SKILL.md`. The profile honors
`DREAMCUT_PROFILE_DIR`. Names use lowercase letters, numbers, and hyphens (up to
64 characters). Only ordinary directories and files are read; symlinks are excluded.
The usual frontmatter `description` supplies the summary. An optional unquoted
`based_on: catalog-skill-name` records the original catalog method. The UI shows
that relationship without inferring it from a matching name.

Both versions remain visible when personal and catalog names match. Reading or
saving a personal copy never rewrites the catalog, activates a skill in an external
assistant, or changes a timeline. Ask the assistant to read the personal file when
using it. This release supports browsing profile skills; it does not add a skill
editor, installer, or automatic runtime override. Existing catalog improvement
reviews retain their shared scope and approval behavior.
