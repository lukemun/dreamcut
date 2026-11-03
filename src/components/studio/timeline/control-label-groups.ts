/**
 * Shortens a run of control labels that share a first word ("Ticker low price", "Ticker shape",
 * "Ticker style") to their remainders ("Low price", "Shape", "Style") under that word as a
 * heading, so each label fits on one line beside its slider. Applies to three or more
 * consecutive labels; numbered series ("Word 1", "Step 3 detail") keep their full labels, so a
 * number never starts a shortened label.
 */
export function groupControlLabels(labels: readonly string[]): Array<{ group: string | null; label: string }> {
  const split = labels.map(label => {
    const match = /^(\S+)\s+(.+)$/.exec(label.trim());
    return match && !/^\d/.test(match[2]!) ? { head: match[1]!, rest: match[2]! } : null;
  });
  const result = labels.map(label => ({ group: null as string | null, label }));
  for (let start = 0; start < labels.length;) {
    const head = split[start]?.head.toLowerCase();
    let end = start;
    while (head && end < labels.length && split[end]?.head.toLowerCase() === head) end += 1;
    if (end - start >= 3) {
      for (let index = start; index < end; index += 1) {
        const rest = split[index]!.rest;
        result[index] = { group: split[start]!.head, label: rest[0]!.toUpperCase() + rest.slice(1) };
      }
    }
    start = Math.max(end, start + 1);
  }
  return result;
}
