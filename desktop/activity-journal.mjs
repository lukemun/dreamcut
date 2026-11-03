import { randomUUID } from 'node:crypto';

// One agent turn recorded in order for review: the request, the contract the model was
// given, its text and reasoning, every tool call and raw result, the proposals it made, and how
// the turn ended. The editor stores it (POST /api/agent/activity-journal); see
// docs/architecture/desktop-data-layout.md and docs/architecture/agent-activity.md.
// Streamed text and reasoning are merged into whole messages between tool calls. Recording
// failures are counted, never surfaced to the chat.
const AGENT = { codex: 'gpt', claude: 'claude', local: 'local' };
const BATCH = 50;

export function createEpisodeLog({ origin, serviceToken, fetchImpl = fetch, now = () => new Date().toISOString() }) {
  const headers = { 'content-type': 'application/json', ...(serviceToken ? { Cookie: `dreamcut_desktop_session=${serviceToken}` } : {}) };
  let current, queue = Promise.resolve(), dropped = 0;
  const post = (episodeId, records) => {
    queue = queue.then(async () => {
      for (let start = 0; start < records.length; start += BATCH) {
        const response = await fetchImpl(new URL('/api/agent/activity-journal', origin), { method: 'POST', redirect: 'error', headers,
          body: JSON.stringify({ episode_id: episodeId, records: records.slice(start, start + BATCH) }), signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw Error(`episode records refused (${response.status})`);
      }
    }).catch(() => { dropped += records.length; });
    return queue;
  };
  const push = (type, data) => { if (current) current.pending.push({ seq: current.seq++, at: now(), type, data }); };
  // Merge consecutive deltas of one kind into a single message.
  const stream = (type, text) => {
    if (!current || typeof text !== 'string' || !text) return;
    const last = current.pending.at(-1);
    if (last?.type === type) last.data.text += text;
    else push(type, { text });
  };
  const flush = () => { if (current?.pending.length) { const records = current.pending; current.pending = []; void post(current.id, records); } };

  return {
    /** Start a turn. `contract` is {instructions, tools,...} the model received this session. */
    /** `evaluation` marks an eval run: {case, run, request, expect}; it stays on the episode start. */
    begin({ projectId, provider, model, display, sent, attachments, contract, evaluation }) {
      if (current) this.end('superseded');
      current = { id: randomUUID(), seq: 0, pending: [], proposals: [] };
      push('episode_start', { project_id: projectId, provider, agent: AGENT[provider] ?? provider, model: model ?? null, started_at: now(), ...(evaluation ? { eval: evaluation } : {}) });
      if (contract) push('snapshot', contract);
      // What the creator typed, and the full text sent (with replayed conversation and page context).
      push('user', { display: display ?? sent, sent, ...(attachments?.length ? { attachments } : {}) });
      flush();
      return current.id;
    },
    text: text => stream('assistant_text', text),
    reasoning: text => stream('reasoning', text),
    model: model => { push('model', { model }); },
    tool(event) {
      if (!current) return;
      push(event.phase === 'call' ? 'tool_call' : 'tool_result', event);
      // Proposals this turn staged, so outcomes and project history join to the episode.
      if (event.phase === 'result' && event.tool === 'proposal_create') {
        for (const block of event.result?.content ?? []) {
          try { const id = JSON.parse(block?.text ?? '')?.proposal_id; if (typeof id === 'string') current.proposals.push(id); } catch { /* Not the JSON block. */ }
        }
      }
      flush();
    },
    /** `extra` adds outcome fields known only at the end, such as an eval's pass. */
    end(status, finalText, extra = {}) {
      if (!current) return;
      push('episode_end', { status, proposal_ids: current.proposals, ...(typeof finalText === 'string' ? { final_text: finalText } : {}), ...extra, dropped_records: dropped });
      flush(); current = undefined;
    },
    /** Resolves when every queued record has been sent or counted as dropped. */
    settled: () => queue,
    get dropped() { return dropped; },
  };
}
