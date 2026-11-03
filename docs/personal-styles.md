# Personal styles

A style is a named set of your editing choices, stored in your local profile. Effects and skills describe reusable methods; a personal style records the parameters you want when using those methods. It is never added to the contribution catalog.

## Save and reuse through chat

1. Finish an edit, then explicitly ask: “Save these settings as an effect recipe ‘Punchy cuts’.” The agent identifies the existing skills and parameter values, then calls `personal_style_save`. A save requires the actual user instruction; approval of an ordinary timeline edit alone does not authorize saving a style.
2. Open **Properties → Templates** to inspect its source edit, edit the name, description and values, or copy a reuse prompt.
3. On another project, ask: “Use Punchy cuts on this footage.” The agent calls `personal_style_list` and `personal_style_get`, reads the current timeline and applicable skills, preserves the chosen parameters, and adapts source windows and timing to the new footage.
4. The agent calls `proposal_create` with its ordinary proposal plus `personal_style: {id, revision}`. You preview, adjust and approve in the editor. Loading or saving a style never changes a timeline.

For example, a bundle can name `caption-craft` with parameters `font_size: 64`, `fill: "#ffffff"` and `max_words: 4`. These are instructions for the agent's skill, not raw timeline patches. Values are scalars (text, finite numbers or booleans); skill names must exist. Optional `recipe_id` references must have recreation evidence and match the skill. Partial recipes remain partial when used in a style.

## Storage and evidence

Styles live at `profileDir()/personal-styles/<uuid>.json`; the profile honors `DREAMCUT_PROFILE_DIR`. Each save records a source project/title and timeline hash, the explicit instruction and an immutable revision receipt under `personal-styles/revisions/<uuid>/`. Concurrent edits reject stale revisions. The source receipt remains the original edit when the style is renamed or tuned.

Project editing-memory events record only that a local style was saved. Personal names and parameter bundles are excluded from that ledger. Proposal records pin only the style ID, revision and SHA-256; the full snapshot remains in the local profile. Updating a style does not silently change an existing proposal.

There is no style upload, export-to-catalog or contribution action. Reading a style through an explicitly requested agent tool returns its parameters to that agent; if you use a remote agent, those requested tool results enter that agent's context. DreamCut does not automatically attach styles to chat or send them to a community service.

The proposal reference pins provenance, not a general-purpose compiler: the agent must translate the bundle into supported operations and disclose any parameter it cannot preserve. The normal preview, source-boundary checks and human approval still apply. Automated tests cover local persistence, version conflicts and timeline preservation; a real new-footage trial and the user's approval remain acceptance evidence to collect.
