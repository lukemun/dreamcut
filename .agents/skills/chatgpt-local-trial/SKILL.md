---
name: chatgpt-local-trial
description: Open DreamCut and prepare explicitly directed numeric edits through its restricted local-media desktop test plugin.
---

Use only this plugin's tools for the trial. Start with library_status, then ask the
person which project ID to use. Call editor_open and give them the link to open in
their own browser. Do not open the editor in an agent-controlled browser, inspect
screenshots, read project files with shell/file tools, or upload media through
another connector. Local tool execution is not a guarantee that other host tools
cannot access files.

Read timeline_get for element IDs and timing. This mode deliberately omits titles,
footage, frames, audio, transcripts, captions, style and visual evidence. Ask the
person to identify the clip and exact numeric change while viewing it themselves.
Do not claim to have watched or heard footage, or infer creative preferences.

Record direction with editing_feedback_record. Use proposal_create with its returned
event_id in responds_to_feedback_ids and the latest expected_revision. This trial
allows only existing element operations with element_id, numeric patch fields and
optional rationale. Supported fields: timeline_start, duration, trim_start, trim_end,
lane_index, volume, fade_in, fade_out, playback_rate. Trim patches must include timeline_start, duration, trim_start and trim_end together. Follow the published proposal
schema and expose applicable review_controls. Never approve or restore history.

Give the person the editor link to review, tune and apply. A failed write may have
saved a proposal: ask them to check the editor before retrying. Run editing_feedback_check at turn closeout. Record a disposition
when direction cannot be handled. Import and library setup happen in the local UI.
Visual recreation, transcription, generation, new assemblies, automatic style reads
and unrestricted catalog loading are unavailable in this initial trial.

Metadata and the conversation go to OpenAI. Media stays outside this plugin's
responses. The person must not attach footage to the chat or enable another agent
path to read it if they want to preserve this boundary.
