import type { AssetJob } from "./assets";

/** Read historical settings; never substitute today's model defaults. */
export function resultContext(job: AssetJob) {
  const input = job.resolvedInput ?? {}, settings = job.request.settings ?? {};
  const resolution = job.request.resolution ?? (typeof input.resolution === "string" ? input.resolution : undefined);
  const rows: Array<[string, string]> = [];
  const add = (label: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== "") rows.push([label, typeof value === "boolean" ? (value ? "On" : "Off") : String(value)]);
  };
  const expansion = input.prompt_expansion_mode ?? settings.promptExpansion;
  add("Prompt expansion", expansion === "disabled" ? "Off" : expansion === "balanced" ? "Balanced" : expansion === "quality" ? "Quality" : undefined);
  add("Seed", input.seed ?? settings.seed);
  add("Prompt adherence", input.cfg_scale ?? settings.cfgScale);
  add("Safety checker", input.enable_safety_checker ?? settings.enableSafetyChecker);
  add("Auto-fix", input.auto_fix ?? settings.autoFix);
  add("Safety tolerance", input.safety_tolerance ?? settings.safetyTolerance);
  add("Encoding quality", input.bitrate_mode ?? settings.bitrateMode);
  const negativePrompt = input.negative_prompt ?? settings.negativePrompt;
  return { resolution: resolution?.replace(/P$/, "p"), rows, negativePrompt: typeof negativePrompt === "string" ? negativePrompt : undefined };
}
