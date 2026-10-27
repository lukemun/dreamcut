import fs from "node:fs";
import { syncEffectCreatorDocs } from "../src/lib/effects/creator-docs";
import { referenceAnalysisSchema } from "../src/lib/media-analysis/reference-analysis";
import { z } from "zod";
import { effectCatalogSchema, validateEffectCatalog } from "../src/lib/effects/recipes";
if (process.argv.includes("--write-schema")) fs.writeFileSync("docs/effects/catalog.schema.json", JSON.stringify(z.toJSONSchema(effectCatalogSchema, { unrepresentable: "any" }), null, 2) + "\n");
const referenceIndex = process.argv.indexOf("--reference");
if (referenceIndex >= 0) {
  const file = process.argv[referenceIndex + 1];
  if (!file) throw new Error("--reference requires a record path");
  const record = referenceAnalysisSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  console.log(`Validated ${record.scope} reference: ${record.sections.length} sections, ${record.effects.length} effects, ${record.occurrences.length} occurrences. Pixel/motion accuracy remains a separate check.`);
} else {
  const catalog = validateEffectCatalog();
  syncEffectCreatorDocs();
  console.log(`Validated ${catalog.entries.length} effect entries, evidence hashes, and skill backlinks.`);
}
