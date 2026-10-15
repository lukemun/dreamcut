---
name: research-deliverable
description: Produce a research deliverable that is pure evidence — every factual claim inline-linked to a primary source, no synthesis, spin, or product/marketing interpretation. Use whenever asked to research a topic and record findings, write a research doc, gather and cite evidence, build a sourced findings or source-map doc, or "find out what's true" about something external (a market, competitor, craft, definition, prices, specs). Covers the three-layer model (raw verbatim captures, then a pure-evidence deliverable in docs/research/, then a separate opinionated application doc that cites it), the sourcing rules (cite every claim, primary over secondary, quote don't paraphrase, no unsourced claims), a reproducible method/caveats section, and keeping our interpretation OUT of the evidence layer. Complements the deep-research skill (deep-research gathers; this records). NOT for the opinionated application/wiki doc itself, ad copy, or customer/persona research (use client-niche-research).
---

# Research deliverable (pure-evidence findings docs)

How to record research as a **pure-evidence deliverable** — what's true, every claim sourced, *our*
interpretation kept out. Pairs with the **`deep-research`** skill (which *gathers*); this governs how the
findings get written down so they stay trustworthy and reusable.

> **The one rule:** a research deliverable is **evidence, not argument.** No product spin, no "what this
> means for us," no marketing framings. Those belong in a separate application doc that *links back* to
> this one. If a claim can't be linked to a source, it doesn't go in — and that includes your *own*
> cross-source observations: a pattern no single source states is interpretation, so it goes in the
> application doc, never here. The deliverable reports what the sources say, nothing more.

## The three layers (where evidence lives)

Builds on the folder convention in [`docs/research/README.md`](../../../docs/research/README.md):

1. **`raw/`** — unaltered, attributed excerpts or licensed source captures. Preserve source URLs, section references, retrieval dates, and capture scope. These are source records, not ground truth.
2. **The evidence deliverable** — *this skill.* A dated, distilled, **un-opinionated** findings doc at
   `docs/research/YYYY-MM-DD-<slug>.md`. It organizes and dedupes the raw into "here is what the sources
   say," every claim linked. **No application.**
3. **The application / wiki article** — opinionated, atomic, in its topic folder (`docs/marketing/`,
   `docs/standards/`, …). Interprets the evidence for a use case and **cites the deliverable.**

**When to write layer 2 at all:** when an application is downstream (you'll reuse the truth across
uses), when multiple wiki articles will pull the same evidence, or when the un-opinionated findings are
worth preserving on their own. Otherwise go raw → wiki directly (the `research/README.md` default).

## Sourcing rules (the heart)

- **Cite every factual claim inline.** Numbers, definitions, "what works," competitor specs, prices —
  each gets a link to its source *at the point of claim*, not a bibliography dump. (`[[claims-need-sources]]`)
- **Primary over secondary.** Cite the museum / textbook / practitioner / platform doc — never another
  synthesis (no wiki guide citing a wiki guide). (`[[wiki-sourcing-standard]]`)
- **Quote, don't paraphrase**, when exact wording carries weight — verbatim and attributed. Use brief excerpts within applicable quotation limits, with a page or section reference. Public access does not authorize full-text republication. Never treat 150 words as a universal permission.
- **Only sourced facts — no synthesis.** Every statement traces to a source. A cross-source observation
  no single source states (e.g. "all five fields converge on X") is *interpretation*, not evidence — it
  does **not** go in the deliverable. Either find a source that states it directly, or move it to the
  separate application doc (which is allowed to interpret, and cites this one). There is no "synthesis"
  escape hatch and no tag for it; if you can't source it, it isn't a finding.
- **Reproducible numbers + method.** Anyone should be able to re-derive a number, or re-run the
  research, from what you wrote.
- **Exhaust the browser before you accept a failed fetch.** A `WebFetch`/`curl` that times out, 404s,
  returns a bot-block, a JS-shell stub, or a small-model *summary* (not verbatim text) is **not** a
  source that "wouldn't load" — it is a source you haven't tried hard enough to get. Escalate before
  recording it as inaccessible: (1) an **isolated / incognito real browser** (Playwright `chromium.launch()`
  + fresh `newContext()`, or the Playwright MCP with `--isolated`) with a realistic UA, dismissing cookie
  walls and waiting for `networkidle`, then reading `document.body.innerText` for verbatim text; (2) if the
  host hard-blocks bots at the network layer (e.g. `ERR_HTTP2_PROTOCOL_ERROR`, empty body), the **Wayback
  Machine** (`archive.org/wayback/available?url=…` → fetch the archived snapshot — static HTML, no bot
  wall); (3) the raw source at a pinned tag (GitHub `raw.githubusercontent.com` for docs that live in a
  repo) or an official PDF. Only a source that survives *all* applicable escalations goes in
  `inaccessible.md` — and when an escalation *recovers* a previously-flagged source, upgrade the flag to a
  verbatim capture and note the recovery. A subagent that reports "X wouldn't load" has not finished the
  job until it has tried the browser. (`[[browser-escalation-before-inaccessible]]`)
- **No manipulation.** No spin toward a product, message, or conclusion we want. A good deliverable
  doesn't know what it's for.
- **An ABSENCE finding is a defect report against every doc downstream of it — propagate it in the same
  PR.** When you record that a claim *could not be confirmed*, that is not a footnote in your own doc.
  Grep the repo for the claim and fix every skill/standard that asserts it, right then.
  (`[[absence-findings-must-propagate]]`)

  > **Earned 2026-07-13.** A tier-1 skill (`still-prompt-writing`) carried this, in quotation marks, with
  > Google's name and two real Google links beside it: *"a quick outline can communicate relationships
  > between characters, desired movement, or object positions far better than text alone."* **The sentence
  > does not exist** — six Google surfaces and four exact-phrase searches, zero matches anywhere online.
  > It entered as **a human's recollection**. Our own raw capture flagged it as unconfirmed on 2026-07-07
  > and filed it under ABSENCES; a second audit caught it again on 2026-07-11. **The skill carried it for
  > six more days**, because nothing connected *"research declared this unverifiable"* to *"the skills that
  > cite it."* The research was right and inert.
  >
  > **Separate the two failures — "unverified" hides which one you have.** Ask: *does the claim survive if
  > the source is unreachable?*
  > - **Uncited but true** → fix the citation, keep the claim. (The Seedream colored-region pattern was
  >   real; its only source was a page no fetcher could open, so it survived as *our own skill citing a
  >   dead link* — circular, but the claim was sound.)
  > - **Fabricated** → cut it. There was no claim underneath.
  >
  > And note what made it survive: **a citation next to a fabricated quote is worse than no citation.** Both
  > links were real, on-topic Google pages that supported a *weaker* version of the claim. Nothing looked
  > wrong until someone opened them. The cheap test: **a phrase with zero web-search results was never
  > published — but only for text that was published *to the web*.** See the print-only exception below
  > before you cut a quotation on this test alone.
- **Zero exact-phrase hits does not prove fabrication for text that lives only in a print book.** Search absence is not proof of fabrication for either web pages or books. Before any fabrication verdict
  on a passage attributed to a printed work, add a **full-text book index** rung to the escalation ladder:
  Open Library `search/inside` (`https://ia-fts.archive.org/api/v1/search?q=…`, or the
  `openlibrary.org/search/inside?q=…` UI), Google Books `SearchWithinVolume`, and the publisher's own free
  excerpt or sample chapter. Search a **short, unhyphenatable fragment** — scanned text breaks words across
  lines (`en- thusiasm`), so a 12-word query returns zero hits on a quotation that is verbatim correct. If those checks also fail, record the quotation as unconfirmed in the examined sources; absence alone still does not prove it was never published.
  (`[[book-index-rung-before-fabrication-verdict]]`)

## The deliverable structure

```markdown
# <Question being answered> — research findings (sourced)

<one line: what this answers and who/what it backs>

| | |
|---|---|
| **Method** | how it was gathered (e.g. N web-research agents, one per field), reproducibly |
| **Date** | YYYY-MM-DD |
| **Sourcing standard** | this skill — every claim cited; nothing unsourced |

## How to read this
Every factual claim links to its source. Nothing here is our own interpretation — cross-source
observations and "what this means" live in the separate application doc that cites this one.

## <Findings — each claim linked> …

## Method, caveats & sources
- Method (reproducible) · caveats (rate-limits, sources that wouldn't load, gaps) · load-bearing primaries.
```

## The separation rule (don't collapse the layers)

The evidence deliverable answers **"what's true."** The application doc answers **"what we do about
it."** Keep them in separate files:

- **Evidence (`docs/research/`)** → no "framings for the post," no "lead with X," no mapping to our
  messages or CTA. It would read the same for a competitor.
- **Application (topic folder)** → all of that, plus a `## Sources` section / link back to the
  deliverable.

Collapsing the two is how a sourced doc quietly becomes a pitch.

**The leak runs both ways.** Just as the evidence doc carries no application, the application/plan must not
reach back and shape the *gather*. Don't purpose-gate data collection ("decide what it's for before we pull
it") — a gather doesn't know what it's for, and bending it to a use case biases the evidence. Gather
exhaustively and neutrally; choose the use downstream. This binds plans written *ahead* of need: a plan made
before the application is decided still follows the standard (gather neutrally, keep the "for" out).

## Neighbors (don't reinvent these)

- **`deep-research` skill** — the gathering harness (fan-out → fetch → adversarially verify →
  synthesize). Use it to *get* the evidence; use *this* to *record* it.
- **[`docs/research/README.md`](../../../docs/research/README.md)** — the folder convention: `raw/` format, the
  `references.md` / `inaccessible.md` patterns, how wiki articles cite raw.
- **`client-niche-research` skill** — customer/persona research for a creative-strategy engagement; an
  opinionated, framework-shaped deliverable. Not this.

## Checklist before shipping a deliverable

- [ ] Every factual claim links to a source.
- [ ] Sources are primary, not other syntheses.
- [ ] Brief verbatim excerpts where wording matters, within applicable limits, with page/section references.
- [ ] No unsourced claims — every statement traces to a source; cross-source observations no single source states are left out (or moved to the application doc).
- [ ] No product / marketing interpretation anywhere in the doc.
- [ ] Method + caveats section present; numbers reproducible.
- [ ] If there's an application, it's a *separate* doc that links back here.

## Retro ritual

User says **"run the research-deliverable retro"** → review the run against this skill → append a dated
entry to [`evolution.md`](./evolution.md) (what bit · rules
earned · notes for next) → **graduate durable, general rules up** into this file. The log is the
scratchpad; the skill is where stable rules live (repo rule: a rule earns a place here after it bites twice).

## DreamCut adaptation

Imported from MakeTrailer; see [PROVENANCE.md](PROVENANCE.md). The local folder contract is [docs/research/README.md](../../../docs/research/README.md). Use the repository [wiki](../../../docs/wiki/README.md) for interpretation and review navigation. Keep proposed architecture separate from implemented behavior. Record code revision, file hashes, exact commands, and actual results for repository audits. Preserve search-only leads as leads, not verified findings. The documentation layers here are publishing layers; they are not the runtime L1–L4 evidence taxonomy.

Source capture must obey applicable copyright and tool limits. Short excerpts plus metadata are valid raw records; label them as excerpts, never full captures. A failed retrieval remains pending unless applicable escalation has been attempted. Do not rewrite earlier captures when interpretations change. No network publishing, extra agents, or runtime mutations are implied by recording research.
