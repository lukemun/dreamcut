import fs from "node:fs";
import { recordEditingFeedback } from "../src/lib/local-store/editing-feedback";

// Explicit CLI bridge; hook callbacks never invoke it automatically.
try {
  console.log(JSON.stringify(recordEditingFeedback(JSON.parse(fs.readFileSync(0, "utf8"))), null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
