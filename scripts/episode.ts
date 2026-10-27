// Read-only: print one activity-journal episode as a timeline for review, or list
// recent episodes. See docs/architecture/desktop-data-layout.md#activity-journal.
//
//   pnpm episode                       # recent episodes
//   pnpm episode <id> [--full]         # one turn: request, reasoning, calls, proposals, decisions, later edits
//   pnpm episode <id> --json           # the same, as records plus the joined context
//   pnpm episode --journal DIR ...     # another machine's activity-journal folder
import { parseArgs } from "node:util";
import { activityJournalDir, listEpisodes } from "../src/lib/observability/activity-journal";
import { episodeReport } from "../src/lib/observability/episode-report";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { full: { type: "boolean" }, json: { type: "boolean" }, journal: { type: "string" }, limit: { type: "string" }, help: { type: "boolean" } } });
const journalDir = values.journal ?? activityJournalDir();
if (values.help) console.log("pnpm episode [<id>] [--full] [--json] [--journal DIR] [--limit N]");
else if (!positionals[0]) {
  const episodes = listEpisodes(journalDir).slice(0, Number(values.limit ?? 30));
  if (values.json) console.log(JSON.stringify(episodes, null, 2));
  else if (!episodes.length) console.log(`No episodes in ${journalDir}`);
  else for (const episode of episodes) {
    const evaluation = episode.eval ? ` [eval ${episode.eval.case} run ${episode.eval.run}]` : "";
    console.log(`${episode.episode_id}  ${episode.started_at.replace("T", " ").slice(0, 19)}  ${episode.agent.padEnd(6)} ${episode.project_id}  ${episode.status}  ${episode.tool_calls} calls  ${episode.proposal_ids.length} proposals${evaluation}  ${episode.request.slice(0, 60)}`);
  }
} else {
  const report = episodeReport(positionals[0], { journalDir, full: Boolean(values.full) });
  console.log(values.json ? JSON.stringify({ records: report.records, context: report.context }, null, 2) : report.text);
}
