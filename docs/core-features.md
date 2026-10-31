# Core features

What DreamCut ships, split into what sets it apart and what any serious editor has.
Site, README and guide copy take their claims from this page. A claim not listed here
needs checking against the code before it goes on the site.

Draft for owner review, 2026-10-26.

## Positioning

A standard editor underneath, so a creator can always finish by hand. What is new is the
loop on top: your own agent (Claude Code or Codex) proposes edits on a real timeline, and
you preview, tune and approve each one.

## Unique to DreamCut

| Feature | What the creator gets | Where it lives |
| --- | --- | --- |
| **Proposals you approve** | Every agent change arrives as a card: preview it, tune it, apply or reject it. Undo works after applying. Nothing reaches the timeline without the creator's Apply. | `proposal_create`, Proposals drawer |
| **Dials on every change** | A proposal comes with the sliders needed to finish it by hand (main controls first, the rest in Advanced adjustments), so the result never depends on asking the agent again. | Editable parameter contract, `proposal-dial-selection` |
| **Bring your own agent** | Works inside Claude Code or Codex through one MCP server; the same tools drive the in-editor agent. No separate AI subscription inside the editor. | `mcp/server.mjs` |
| **Recreate an effect as a Template** | Point at a reference clip; the agent rebuilds the effect as a reusable, tunable Template that applies to your own footage. | `recreate-effect`, Templates catalogue |
| **Auditions** | Several playable versions side by side (takes, music, looks) without touching the working cut. | `audition_create`, `timeline-auditions` |
| **Word-accurate take selection** | Joins between spoken takes are placed on word-level forced alignment (MFA), with source handles kept, so cuts don't clip words. | `talking-video-editing` |
| **Direction that is kept** | Each ask is recorded and tracked under Up next until linked work or a stated reason closes it; My Style holds the creator's defaults and every proposal names the ones it followed. | `editing_feedback_*`, My Style |
| **Storyboards and recasts** | Break footage into named beats, or plan a shot-for-shot recreation of a reference with other people. | `storyboard-drafting`, `video-recast` |
| **Edits checked against the picture** | The agent measures frames, spacing and on-screen activity before handing over (text clear of faces, sound timed to motion, cuts on beat). | `frame-state`, `spatial_assess`, `sound-design`, `beat-aligned-cuts` |
| **Open, local project format** | Each project is a folder with a readable `timeline.json`, media and history, on the creator's machine. Agents and people work from the same file. | Library, web/desktop library contract |

## Standard among editors

Table stakes. DreamCut needs them to be credible, but they are not why someone switches.
In copy, mention them as "everything you'd expect", not as headline features.

| Feature | Notes |
| --- | --- |
| Multi-track timeline: trim, split, transitions, lanes, undo/redo | |
| Captions from transcription, caption styles | The behind-the-subject styles are a strength, not a category of their own |
| Titles, text and keyframed motion graphics | |
| Colour correction and looks: wheels, curves, slices, HLG export | Resolve-style parity work is paused by the feature freeze |
| Audio: mixing, fades, loudness, voice enhancement | |
| Subject cutouts, masks, keys, screen replacement, surface tracking | CapCut and Premiere offer one-click versions |
| Music and sound effects library | |
| Generative images, video, music and voice | Credits, with the price shown before anything is spent |
| Proxies, broad camera/phone format support, platform export presets | |

## Copy to check

- Homepage "Learns your style: your choices become your defaults." The editor does not learn
  on its own: My Style changes only when the creator edits it or accepts a suggestion synced
  from their account. Reword to something like "Keeps your style".
- DreamCut installs from the GitHub repository (macOS first; Windows experimental). Say so wherever
  install is promised; don't point at `npx dreamcut`, which is no longer referenced.
- DreamCut is open source under Apache-2.0 (relicensed from FSL-1.1-ALv2 on 2026-10-30). Call it open
  source; don't describe it as fair source or source-available.
