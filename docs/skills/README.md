# DreamCut skill catalog

[Browse skills and side-by-side examples](index.html) · [Written skill index](../../.agents/skills/README.md)

## Object-led scene transition

| Original reference | DreamCut prototype |
| --- | --- |
| [Play with original audio](../effects/media/FX-08.mp4) | [Play silent dinosaur-and-birds example](media/dinosaur-birds.mp4) |

Skill: [video-compositing](../../.agents/skills/video-compositing/SKILL.md). Recipe: `object-led-scene-transition`.

Objects enter over the existing scene, the background switches, and individual objects flash white. The prototype adapts the reference timing to eleven independent bird cutouts. Native motion and mask edges remain approximate.

The browser catalog provides Replay both and shared playback speed. The reference retains its original audio; the recreation intentionally has no entrance sound effects.

Named effect entry point: [Mask Glitch](../../.agents/skills/mask-glitch/SKILL.md). It supports continuous mask handoffs and consecutive sequences, with the former pop/batch construction retained as an explicit variant. The existing video above is an earlier slide-in prototype, not verification of the newly authored pop defaults.
