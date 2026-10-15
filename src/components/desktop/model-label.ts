/**
 * A model's everyday name from its identifier: "claude-opus-5-5" → "Opus 5.5",
 * "gpt-5.5-codex" → "GPT-5.5". Unknown identifiers are returned unchanged.
 */
export function modelLabel(model?: string | null): string | null {
  if (!model || model === "default") return null;
  const id = model.trim().toLowerCase().replace(/\[[^\]]*\]$/, "").replace(/-\d{8}$/, "");
  const claude = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?$/.exec(id);
  if (claude) return `${claude[1]![0]!.toUpperCase()}${claude[1]!.slice(1)} ${claude[2]}${claude[3] ? `.${claude[3]}` : ""}`;
  const family = /^(opus|sonnet|haiku|fable)$/.exec(id);
  if (family) return `${family[1]![0]!.toUpperCase()}${family[1]!.slice(1)}`;
  const gpt = /^gpt-([\d.]+[a-z]?)((?:-[a-z]+)*)$/.exec(id);
  if (gpt) {
    // The coding variant is how the editor runs GPT; its suffix adds nothing for the creator.
    const variants = gpt[2]!.split("-").filter(part => part && part !== "codex");
    return [`GPT-${gpt[1]}`, ...variants].join(" ");
  }
  return model;
}
