---
name: edit-video
description: Edit video with DreamCut, a local video editor driven through the dreamcut MCP tools. Use when the user wants to open DreamCut, import footage, storyboard, cut, caption or polish a video, or set up their DreamCut Library.
---

# Edit video with DreamCut

DreamCut runs on the user's computer. Footage stays there; the editor opens in a browser at
`http://127.0.0.1`. You prepare work with the DreamCut tools, and the user reviews and approves it in the
editor.

## Get started

1. If the only DreamCut tool is `dreamcut_setup_status`, DreamCut is finishing its one-time download.
   Report its progress. Its tools appear when it finishes; if they do not, ask the user to start a new
   session.
2. Call `library_status`. If no Library is chosen, suggest the folder it proposes and create it with
   `library_setup` once the user agrees. If it finds older projects, show the move plan and migrate only
   with the user's confirmation.
3. Call `editor_open` (with `project_id` and `page` when relevant) and give the user the link. Open it in
   your built-in browser if you have one. Each link works once and expires after about two minutes; call
   `editor_open` again for a new one.

## Do the work

- Find the right tools with `capability_catalog`, and load a tool family when it is missing.
- Read the project and the user's style first: `timeline_get`, or `editing_memory_get` for new work.
  Record material direction in the user's words with `editing_feedback_record`, and finish with
  `editing_feedback_check`.
- New edit from footage: `assembly_create`, then `media_import`. Import keeps verified copies by default.
- Storyboard: `storyboard_get`, then `storyboard_draft`, grounded in `speech_prepare` words and
  `source_evidence` frames.
- Change an existing timeline: `proposal_create`. Say what you staged; the user previews, adjusts and
  approves it in the editor.

## Boundaries

- Never approve, reject or restore history for the user, and never say a proposal was applied before
  they approve it.
- Change projects only through DreamCut tools: no editing project files and no mutation scripts.
- Do not generate media or publish without the user asking. Exporting happens from the editor's Export
  button when the user wants it.
- Footage is never uploaded. Your own model requests are the only place project content goes.

## Requirements

DreamCut needs Node.js 22 or newer and FFmpeg. If either is missing, offer to install it and show the
command before running it:

- macOS: `brew install node ffmpeg`
- Windows: `winget install OpenJS.NodeJS.LTS` and `winget install Gyan.FFmpeg`
