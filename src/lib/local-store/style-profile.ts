import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { EditingPreference } from "./editing-memory";

const marker = "<!-- dreamcut-style-projection:v1 -->";
// Projections written under the OpenEdit and OpenSequence names remain managed.
const legacyMarkers = ["<!-- openedit-style-projection:v1 -->", "<!-- opensequence-style-projection:v1 -->"];
const statuses = { ACTIVE: "active", SUGGESTED: "suggested", RETIRED: "retired" } as const;

export function renderStyleProfile(template: string, preferences: EditingPreference[]): string {
  if (!template.startsWith(marker)) throw new Error("Unknown style template version");
  // A single replacement pass prevents preference text from acting as a template.
  return template.replace(/\{\{(ACTIVE|SUGGESTED|RETIRED)_PREFERENCES\}\}/g, (_match, key: keyof typeof statuses) => {
    const rows = preferences.filter(p => p.status === statuses[key]);
    if (!rows.length) return "None recorded yet.";
    return rows.map(p => {
      const scope = p.scope === "project" ? `project: ${p.project_id ?? "unspecified (do not apply)"}` : p.scope;
      return `### ${p.category} · ${scope}\n\n${p.text}\n\nStatus: ${p.status} · Updated: ${p.updated_at} · ID: ${p.id}\nOrigin: ${p.origin}\nEvidence: ${p.evidence.length ? p.evidence.join(", ") : "No evidence reference recorded."}`;
    }).join("\n\n");
  });
}

/** Historical projection writer retained for migration fixtures only. Runtime uses
 * style-document.ts; never call this to update an active personal document. */
export function syncStyleProfile(directory: string, preferences: EditingPreference[], templatePath = path.join(process.cwd(), "templates/style/STYLE.md")) {
  return syncProfileDocument(directory, preferences, "STYLE.md", templatePath, marker);
}

function syncProfileDocument(directory: string, preferences: EditingPreference[], name: string, templatePath: string, expectedMarker: string) {
  const destination = path.join(directory, name);
  if (fs.existsSync(destination)) {
    const existing = fs.readFileSync(destination, "utf8");
    if (!existing.startsWith(expectedMarker) && !legacyMarkers.some(legacy => existing.startsWith(legacy))) {
      throw new Error(`Existing ${name} is not a managed projection; preserve it and reconcile through Memory before enabling sync.`);
    }
  }
  const content = renderStyleProfile(fs.readFileSync(templatePath, "utf8"), preferences);
  fs.mkdirSync(directory, { recursive: true });
  if (fs.existsSync(destination) && fs.readFileSync(destination, "utf8") === content) return destination;
  const temporary = path.join(directory, `.style-${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, { flag: "wx", mode: 0o600 });
    fs.renameSync(temporary, destination);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
  return destination;
}
