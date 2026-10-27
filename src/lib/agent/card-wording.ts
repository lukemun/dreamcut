/**
 * Card titles, option labels and option summaries are read by the creator, not an engineer:
 * they say what the viewer will see or hear, in everyday words. This catches the build
 * vocabulary agents reach for. Quoted text (on-screen words, the creator's own phrasing) is exempt.
 */
const JARGON: { pattern: RegExp; instead: string }[] = [
  { pattern: /\bbak(?:e|ed|es|ing)\b/i, instead: "name what it shows, e.g. \"the combined title clip\"" },
  { pattern: /\bnative (?:text|image|shape|clip|element)s?\b/i, instead: "say \"its own text\", \"its own picture\" or \"editable\"" },
  { pattern: /\btransparent (?:clip|video|layer)s?\b/i, instead: "say \"its own clip\" or \"a clip on top\"" },
  { pattern: /\b(?:alpha|matte|composite|compositing|props?)\b/i, instead: "describe the visible result" },
  { pattern: /\belements?\b/i, instead: "say \"clip\", \"text\" or the clip's name" },
  { pattern: /\b[a-z]+(?:_[a-z0-9]+)+\b/, instead: "use the setting's label, not its field name" },
  { pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}\b|\b[0-9a-f]{12,}\b/i, instead: "use the clip's name, not its id" },
];

/** Removes quoted spans so on-screen text and the creator's own words are never flagged. */
const unquoted = (text: string) => text.replace(/"[^"]*"|“[^”]*”|'[^']*'(?!\w)|‘[^’]*’/g, " ");

export type CardWordingIssue = { field: string; word: string; instead: string };

export function cardWordingIssues(text: string, field: string): CardWordingIssue[] {
  const plain = unquoted(text);
  return JARGON.flatMap(({ pattern, instead }) => {
    const match = plain.match(pattern);
    return match ? [{ field, word: match[0], instead }] : [];
  });
}

export function proposalWordingIssues(proposal: { summary: string; options: { label: string; summary: string }[] }) {
  return [
    ...cardWordingIssues(proposal.summary, "summary"),
    ...proposal.options.flatMap((option, index) => [
      ...cardWordingIssues(option.label, `options[${index}].label`),
      ...cardWordingIssues(option.summary, `options[${index}].summary`),
    ]),
  ];
}

export function cardWordingMessage(issues: CardWordingIssue[]) {
  return `Card text is read by the creator: describe what the viewer will see or hear, in everyday words. Rewrite ${
    issues.map(issue => `${issue.field} ("${issue.word}": ${issue.instead})`).join("; ")}.`;
}
