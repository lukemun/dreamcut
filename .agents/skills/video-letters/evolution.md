# video-letters — evolution log

## Purpose

Let a creator ask for a title "where the video plays through the letters" and get big, thick
native block letters with their project video playing only inside the glyphs, tunable for
size, length, fades and fill speed without AI. Success means the footage is visibly moving
inside each letter in the editor, in stills and in renders, and the word stays editable text.
Placement and readability belong to [video-typography](../video-typography/SKILL.md); proposal
mechanics to [dreamcut-proposals](../dreamcut-proposals/SKILL.md).

## 2026-10-27 — Built for the LOSER title, packaged as a template

- **Observation:** The creator asked for "the Loser text effect where the video plays through the letters". Video fills worked only through handwriting, so Anton fell back to thin pen strokes; Permanent Marker carried the video but read as cursive, which the creator rejected: "It's not a cursive thing. It's because we're watching something through it, so it has to be big, thick." Proposal GPU admission also refused every new video-filled title.
- **Decision:** Block text now carries `mediaFillVideoUrl` in both renderers, and admission sees the fill's verified preview. The procedure lives in its own skill so the Effects card and agents share one recreation recipe; heavy block fonts and fade entrances are the default, handwriting entrances are excluded.
- **Verification:** Caption fill, admission and effects tests pass; typecheck passes. Frame-state stills, preview renders of two input sets (WILD, COLD) and the editor's GPU player show footage moving inside Anton letters. A full export was not run.
