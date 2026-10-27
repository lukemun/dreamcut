# Seamless presenter compounds

Right-click a speech-linked presenter section and choose **Prepare seamless presenter compound…**.
This prepares all active presenter sections on that lane as a 30 fps VP9-alpha proxy whose longest edge is at most 640 px, then opens a review proposal. The human
approves it in Review. Approval is one undoable edit. The timeline shows one compound container;
**Break apart compound clip** restores the individual containers without deleting source footage.

The preparation accepts 2–32 adjacent, silent alpha sections with identical static appearance,
normal speed, lightweight local previews, and no transitions or section animations. It concatenates
their exact 30 fps source windows into an audio-free alpha preview. The player uses one video
instance across the old section boundaries; it does not crossfade, freeze, or alter speech.
Voice and linked captions stay independent and unchanged. Export continues to use the original
full-quality sections, not the compiled preview.

Editing a member's timing, appearance, source, or group membership invalidates the continuous
preview and safely restores ordinary section playback. Prepare again after such edits. This is
a bounded presenter workflow, not a general nested sequence editor or an alpha-matte repair.

## Harness

`compound_prepare({ project_id, element_ids, label? })` prepares media and creates a proposal;
it never approves or mutates the working timeline. The equivalent UI endpoint is
`POST /api/projects/<projectId>/timeline/compounds`. The response includes `proposal_id` and
the verified preparation receipt. Existing `proposal_get` and `proposal_preview` inspect it.
Receipts are in `analysis/compounds/`, disposable media in `media/compounds/`.

The receipt verifies output hash, frame count, alpha metadata, and exact member signatures.
Preparation also decodes the complete alpha stream and rejects empty presenter frames.
Preview projection is disabled for exports. Changes to this contract must preserve those checks
and the human proposal gate.
