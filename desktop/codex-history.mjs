// Project-scoped, display-only projection. Never forward raw Codex thread items:
// they can include internal reasoning, command output and host/runtime metadata.
export function visibleCodexHistory(thread) {
  const messages = [];
  let bytes = 0, truncated = false;
  const turns = Array.isArray(thread?.turns) ? thread.turns : [];
  for (let t = turns.length - 1; t >= 0; t--) {
    const items = Array.isArray(turns[t].items) ? turns[t].items : [];
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      let role, text;
      if (item?.type === 'agentMessage' && typeof item.text === 'string') {
        role = 'assistant'; text = item.text;
      } else if (item?.type === 'userMessage' && Array.isArray(item.content)) {
        role = 'user';
        text = item.content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n');
      } else continue;
      if (!text) continue;
      const size = Buffer.byteLength(text);
      if (messages.length >= 200 || bytes + size > 1024 * 1024) { truncated = true; continue; }
      messages.push({ role, text }); bytes += size;
    }
  }
  return { messages: messages.reverse(), truncated };
}
