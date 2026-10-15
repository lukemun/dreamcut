---
name: open
description: Open the DreamCut editor in the browser, optionally at a project or its storyboard.
argument-hint: "[project or page]"
---

Open DreamCut for the user.

1. If the user named a project, find its id in the `projects` that `library_status` lists; otherwise open
   the editor home.
2. Call `editor_open` with that `project_id` and, if they asked for it, `page: "storyboard"`.
3. Give the user the link and open it in your built-in browser if you have one. The link works once; call
   `editor_open` again if it has expired.

If the only DreamCut tool is `dreamcut_setup_status`, DreamCut is still finishing its first download:
report its progress instead.
