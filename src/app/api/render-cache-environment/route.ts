import { createHash, randomUUID } from "node:crypto";
import { projectsRoot } from "@/lib/local-store/paths";

/** Prove that a local instrument hashes the same source/storage roots this server reads.
 * Paths themselves are not exposed. Running JS/CSS/fonts have separate content hashes.
 */
const runtimeId = randomUUID();
export function GET() {
  return Response.json({ protocol: 1, runtime_id: runtimeId, roots: createHash("sha256")
    .update(JSON.stringify([process.cwd(), projectsRoot()])).digest("hex") }, { headers: { "Cache-Control": "no-store" } });
}
