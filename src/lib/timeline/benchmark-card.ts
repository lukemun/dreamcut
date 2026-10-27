export type BenchmarkCardEntry = {
  label: string;
  score: string;
  numericScore: number;
  winner: boolean;
};

export type BenchmarkCardData = {
  name: string;
  source: string | null;
  entries: BenchmarkCardEntry[];
};

function parseScoreEntry(value: string): Omit<BenchmarkCardEntry, "winner"> | null {
  const match = value.trim().match(/^(.*?)\s+(-?[\d,.]+(?:\s*±\s*[\d,.]+)?)$/u);
  if (!match) return null;
  const numericScore = Number.parseFloat(match[2]!.replaceAll(",", ""));
  if (!Number.isFinite(numericScore)) return null;
  return {
    label: match[1]!.trim(),
    score: match[2]!.replaceAll(/\s+/gu, ""),
    numericScore,
  };
}

export function resolveBenchmarkCardData(
  text: string,
  rawProps: Record<string, unknown> | null | undefined,
): BenchmarkCardData | null {
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;

  const winnerFromText = lines.find((line) => /^winner\s*:/iu.test(line))
    ?.replace(/^winner\s*:\s*/iu, "")
    .trim();
  const winner = typeof rawProps?.benchmark_winner === "string"
    ? rawProps.benchmark_winner.trim()
    : winnerFromText;
  const entries = lines[1]!
    .split(/\s*[·|]\s*/u)
    .map(parseScoreEntry)
    .filter((entry): entry is Omit<BenchmarkCardEntry, "winner"> => entry != null)
    .slice(0, 3)
    .map((entry) => ({
      ...entry,
      winner: winner != null && entry.label.toLocaleLowerCase() === winner.toLocaleLowerCase(),
    }));

  if (entries.length < 2) return null;
  if (!entries.some((entry) => entry.winner)) {
    const bestScore = Math.max(...entries.map((entry) => entry.numericScore));
    for (const entry of entries) entry.winner = entry.numericScore === bestScore;
  }

  return {
    name: lines[0]!,
    source: typeof rawProps?.source_note === "string" && rawProps.source_note.trim()
      ? rawProps.source_note.trim()
      : null,
    entries,
  };
}
