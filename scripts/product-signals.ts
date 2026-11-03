// Read-only summary of the local product-signal stream: missed catalog searches, fields agents
// invented or left out, and changes staged without a creator dial.
// See docs/architecture/desktop-data-layout.md.
//
//   pnpm product-signals                 # this profile's stream
//   pnpm product-signals --dir DIR       # an uploaded or copied product-signals folder
import { parseArgs } from "node:util";
import { productSignalsDir, readProductSignals, summarizeProductSignals } from "../src/lib/observability/product-signals";

const { values } = parseArgs({ options: { dir: { type: "string" }, help: { type: "boolean" } } });
if (values.help) console.log("pnpm product-signals [--dir DIR]");
else console.log(JSON.stringify({ directory: values.dir ?? productSignalsDir(), ...summarizeProductSignals(readProductSignals(values.dir)) }, null, 2));
