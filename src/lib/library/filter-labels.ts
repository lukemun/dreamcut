/** Creator-facing names for catalog filter values (data keeps its short internal values). */
const SOUND_LABELS: Record<string, string> = {
  ui: "Clicks & interface", misc: "Assorted", other: "Other", foley: "Everyday sounds", accent: "Accents",
  impact: "Impacts", transition: "Transitions", typing: "Typing", camera: "Camera", reaction: "Reactions",
  musical: "Musical", sparkle: "Sparkles", hit: "Hits", texture: "Textures", in_out: "In & out", rise: "Risers", out: "Endings",
};
export function filterValueLabel(value: string): string {
  const key = value.trim().toLowerCase();
  if (SOUND_LABELS[key]) return SOUND_LABELS[key];
  const words = key.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
