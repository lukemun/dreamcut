import { CREATOR_PROGRAM_URL, type GuideTourChapterId } from "@/lib/guide-tour";

/** What a step's check can read: the page, and what only the server knows (selection, card review state). */
export type TourContext = {
  path: string;
  search: URLSearchParams;
  projectId: string;
  /** The practice project's card statuses, newest last; null until read. */
  cards: ("pending" | "approved" | "rejected")[] | null;
  /** What the creator has selected in the practice project (templates, clips), as the agent reads it; null until read. */
  selection: { group: string; label: string }[] | null;
  /** Per-step scratch, reset when the step starts (a baseline count, a latched state). */
  memo: Record<string, unknown>;
};

export type TourAction = "open-practice";

export type TourStep = {
  title: string;
  body?: string;
  /** Keys the step asks for, shown as key caps after the body. */
  keys?: string[];
  /** The control to point at; the step still works when it is not on screen. */
  target?: () => Element | null;
  /** A shortcut for a creator who is somewhere else, never the thing being taught. */
  action?: { kind: TourAction; label: string };
  link?: { href: string; label: string };
  /** Shown until done; a step without a check is finished with Next. */
  done?: (context: TourContext) => boolean;
  /** A progress line, such as "2 of 3 marks". */
  progress?: (context: TourContext) => string | undefined;
  /** Skip this step when it does not apply (no Undo needed after applying). */
  skip?: (context: TourContext) => boolean;
};

/** The template the practice card was built with, and the card's option. */
const TEMPLATE = "3D Sketch Scene";
const CARD = "Neon road";

/** On screen and reachable: a closed drawer slid off the edge, or one marked hidden or inert, does not count. */
const visible = (element: Element | null) => {
  if (!(element instanceof HTMLElement) || !element.getClientRects().length) return null;
  if (element.closest('[inert], [aria-hidden="true"]') || !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
  const box = element.getBoundingClientRect();
  return box.right > 0 && box.bottom > 0 && box.left < window.innerWidth && box.top < window.innerHeight ? element : null;
};
const one = (selector: string) => visible([...document.querySelectorAll(selector)].find(element => visible(element)) ?? null);
/** The first visible button or link whose own text is `text`. */
const named = (text: string, within = "button, a") => visible([...document.querySelectorAll(within)].find(element => visible(element) && element.textContent?.trim() === text) ?? null);
const inProject = (context: TourContext) => context.path === `/p/${context.projectId}`;
const templatesPanel = () => one('.recipe-catalog[data-layout="panel"]');
const detailTitle = () => one(".template-detail-header h2")?.textContent?.trim();
const markCount = () => new Set([...document.querySelectorAll('[aria-label="Timeline marks"] button')].map(button => button.getAttribute("aria-label")?.split(",")[0])).size;
const dialValues = () => [...document.querySelectorAll("[data-proposal-control] input")].map(input => (input as HTMLInputElement).value).join("|");
/** The panel's close button, docked ("Close proposals panel") or as a drawer ("Close proposals"). */
const proposalsClose = () => one('[aria-label="Close proposals panel"], [aria-label="Close proposals"]');
const proposalsOpen = () => proposalsClose() !== null;
const practiceCard = () => one(`[aria-label^="Preview ${CARD}"], [aria-label^="Replay ${CARD}"]`);
const timeline = () => one('[aria-label="Timeline marks"]')?.parentElement ?? null;
const picked = (context: TourContext, match: (item: { group: string; label: string }) => boolean) => Boolean(context.selection?.some(match));

/** Latches a check: once it has been true during the step it stays true. */
function latched(context: TourContext, key: string, now: boolean) {
  if (now) context.memo[key] = true;
  return context.memo[key] === true;
}

export const TOUR_STEPS: Record<GuideTourChapterId, TourStep[]> = {
  effects: [
    { title: "Open the practice project", body: "A short project the Guide made for you: the bobblehead is the footage on its timeline. Your own projects stay as they are.",
      action: { kind: "open-practice", label: "Open practice project" },
      done: inProject },
    { title: "Put Proposals away", body: "Your agent's changes wait in Proposals. Press P to put them away for now; you'll come back to them.",
      keys: ["P"], target: proposalsClose,
      // The editor opens Proposals a moment after the project loads, so wait before calling it put away.
      done: ({ memo }) => { memo.checks = Number(memo.checks ?? 0) + 1; return Number(memo.checks) > 6 && !proposalsOpen(); } },
    { title: "Open Templates", body: "Click Templates in the toolbar on the left. It holds effects and looks you can use on your footage.",
      target: () => one('[aria-label="Editing tools"] [aria-label="Templates"]') ?? named("Templates", "button, [role=tab]"),
      done: () => templatesPanel() !== null },
    { title: "Show effects", body: "Effects build something with your footage. Looks restyle what is already there. Click Effects.",
      target: () => named("Effects"),
      done: () => one('.template-kind button[aria-pressed="true"]')?.textContent === "Effects" },
    { title: `Open ${TEMPLATE}`, body: `Find ${TEMPLATE} and click Details. Its example plays first.`,
      target: () => one('[data-template-key*="SKETCH-3D"]') ?? templatesPanel(),
      done: () => detailTitle() === TEMPLATE },
    { title: "See what it needs", body: "Every effect lists what you supply. This one needs a few words on what to draw; others need clips you film. How to use says the rest.",
      target: () => one("#template-film-title")?.closest("section") ?? one(".template-use-section") },
    { title: "Select it", body: `Click Select. ${TEMPLATE} joins the chat box for your agent.`,
      target: () => one(".template-start button"),
      done: context => picked(context, item => item.group === "templates" && item.label.includes(TEMPLATE))
        || one('.template-start button[aria-pressed="true"]') !== null },
    { title: "Select your footage", body: "Click a bobblehead clip on the timeline. That tells your agent which footage the effect goes with.",
      target: timeline,
      done: context => picked(context, item => item.group !== "templates" && /bobblehead/i.test(item.label)) },
    { title: "Ask your agent", target: () => one('[aria-label="Selected for the agent"]'),
      body: "Your picks wait here for your agent. Tell it what you want, such as “put a neon road behind me”. It builds the effect and sends it back as a card for you to review. For this practice, that card is already waiting." },
  ],
  cards: [
    { title: "Show and hide Proposals", body: "Press P to hide Proposals, and P again to bring them back. Cards from your agent wait here; nothing changes your video until you apply one.",
      keys: ["P"], action: { kind: "open-practice", label: "Open practice project" },
      target: proposalsClose,
      done: context => {
        if (!inProject(context)) return false;
        const open = proposalsOpen();
        context.memo.initial ??= open;
        if (open !== context.memo.initial) context.memo.toggled = true;
        return open && context.memo.toggled === true;
      } },
    { title: "Play the change", body: "Watch the neon road behind him before you decide.", keys: ["R"],
      target: practiceCard,
      done: context => latched(context, "played", one('[aria-label^="Replay "]') !== null) },
    { title: "Compare with the original", body: "Press B to switch between your video and the change. Press it again to switch back.", keys: ["B"],
      target: () => one('[aria-label^="Show original"]'),
      done: context => latched(context, "compared", one('[aria-label^="Show original"][aria-pressed="true"]') !== null) },
    { title: "Tune it", body: "The card's sliders are the effect's own settings. Drag Glow, or pick a new Ink colour, and the road redraws.",
      target: () => one('[data-proposal-control="motion:glow"]') ?? one("[data-proposal-control]"),
      done: ({ memo }) => { const values = dialValues(); if (!values) return false; memo.start ??= values; return values !== memo.start; } },
    { title: "Apply it, or reject it", body: "Press A to apply the change to your video, or X to reject it. Either way, Undo brings it back.", keys: ["A", "X"],
      target: () => one(`[aria-label^="Apply ${CARD}"]`) ?? practiceCard(),
      done: ({ cards }) => Boolean(cards?.length && cards.at(-1) !== "pending") },
    { title: "Undo it", body: "Press ⌘Z (Ctrl+Z on Windows), or click Undo. The card comes back to review again.", keys: ["⌘Z"],
      target: () => one('button[aria-label="Undo"]'),
      skip: ({ cards }) => cards?.at(-1) === "approved",
      done: ({ cards }) => cards?.at(-1) === "pending" },
  ],
  marks: [
    { title: "Mark three moments", body: "Click the timeline to move the playhead, then press M. Do it at three different places. Marks tell your agent which moments you mean.",
      keys: ["M"], action: { kind: "open-practice", label: "Open practice project" },
      target: () => one(".timeline-ruler, [data-timeline-ruler], [aria-label=\"Timeline marks\"]"),
      progress: ({ memo }) => { const count = Math.max(0, markCount() - Number(memo.baseline ?? 0)); return `${Math.min(count, 3)} of 3 marks`; },
      done: ({ memo }) => { memo.baseline ??= markCount(); return markCount() - Number(memo.baseline) >= 3; } },
  ],
  creators: [
    { title: "Creator program", body: "Read about the DreamCut creator program.",
      link: { href: CREATOR_PROGRAM_URL, label: "About the creator program" } },
  ],
};
