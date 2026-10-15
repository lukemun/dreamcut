import type { z } from "zod";

/** Each issue as `path: message`, so a caller can tell which field to fix; regex bodies are not echoed. */
export function zodIssuesToMessage(error: z.ZodError): string {
  return error.issues.map((issue) => {
    const at = issue.path.reduce<string>((text, part) => typeof part === "number" ? `${text}[${part}]` : `${text}${text ? "." : ""}${String(part)}`, "");
    const message = "format" in issue && issue.format === "uuid"
      ? "must be a UUID"
      : issue.message.replace(/must match pattern \/.*\/[a-z]*$/, "must match the expected format");
    return at ? `${at}: ${message}` : message;
  }).join("; ");
}

/** Safely parse JSON from a Request, returning null on failure instead of throwing. */
export async function safeParseJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}


