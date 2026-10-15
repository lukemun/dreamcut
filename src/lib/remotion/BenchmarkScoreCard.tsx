import { resolveBenchmarkCardData } from "@/lib/timeline/benchmark-card";

export function BenchmarkScoreCard({
  text,
  rawProps,
  progress,
}: {
  text: string;
  rawProps: Record<string, unknown> | null | undefined;
  progress: number;
}) {
  const data = resolveBenchmarkCardData(text, rawProps);
  if (!data) return <>{text}</>;
  const peak = Math.max(...data.entries.map((entry) => entry.numericScore), 1);
  const rawRotation = typeof rawProps?.benchmarkRotationDeg === "number"
    ? rawProps.benchmarkRotationDeg
    : 0;
  const rotationDeg = Math.max(-8, Math.min(8, rawRotation));

  return (
    <div
      data-benchmark-score-card="true"
      style={{
        width: "100%",
        boxSizing: "border-box",
        padding: "0.16em",
        borderRadius: "0.3em",
        background: "#fffdf7",
        boxShadow: "0 0.55em 1.8em rgba(0,0,0,0.42)",
        clipPath: "polygon(0.7% 1.5%, 99.1% 0.4%, 99.7% 98.4%, 0.3% 99.5%)",
        transform: `rotate(${rotationDeg}deg)`,
        transformOrigin: "center center",
      }}
    >
      <div style={{
        width: "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        borderRadius: "0.21em",
        background: "linear-gradient(145deg, rgba(17,24,39,0.99), rgba(3,7,18,0.99))",
        color: "#f8fafc",
        padding: "0.64em 0.76em 0.66em",
        textAlign: "left",
        clipPath: "polygon(0.45% 1.1%, 99.35% 0.35%, 99.65% 98.75%, 0.2% 99.45%)",
      }}>
      <div style={{ fontSize: "0.82em", fontWeight: 820, letterSpacing: "-0.03em" }}>
        {data.name}
      </div>

      <div style={{ display: "grid", gap: "0.3em", marginTop: "0.58em" }}>
        {data.entries.map((entry, index) => {
          const fill = Math.max(0.06, entry.numericScore / peak) * Math.max(0, Math.min(1, progress));
          return (
            <div
              key={`${entry.label}:${entry.score}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1.2em minmax(0,1fr) auto",
                alignItems: "center",
                columnGap: "0.38em",
                border: entry.winner ? "1px solid rgba(129,140,248,0.46)" : "1px solid rgba(148,163,184,0.16)",
                borderRadius: "0.38em",
                background: entry.winner ? "rgba(79,70,229,0.16)" : "rgba(255,255,255,0.035)",
                padding: "0.34em 0.42em",
              }}
            >
              <span style={{
                display: "grid",
                width: "1.2em",
                height: "1.2em",
                placeItems: "center",
                borderRadius: "0.32em",
                background: entry.winner ? "#818cf8" : "rgba(148,163,184,0.15)",
                color: entry.winner ? "#0b1020" : "#cbd5e1",
                fontSize: "0.38em",
                fontWeight: 900,
              }}>
                {index + 1}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.4em" }}>
                  <span style={{ overflow: "hidden", color: entry.winner ? "#eef2ff" : "#cbd5e1", fontSize: "0.43em", fontWeight: 780, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {entry.label}
                  </span>
                  {entry.winner ? (
                    <span style={{ color: "#a5b4fc", fontSize: "0.27em", fontWeight: 850, letterSpacing: "0.11em" }}>WINNER</span>
                  ) : null}
                </div>
                <div style={{ height: "0.1em", overflow: "hidden", marginTop: "0.18em", borderRadius: "999px", background: "rgba(148,163,184,0.14)" }}>
                  <div style={{
                    width: `${fill * 100}%`,
                    height: "100%",
                    borderRadius: "inherit",
                    background: entry.winner
                      ? "linear-gradient(90deg, #6366f1, #a78bfa)"
                      : "linear-gradient(90deg, #475569, #94a3b8)",
                  }} />
                </div>
              </div>
              <span style={{ color: entry.winner ? "#ffffff" : "#cbd5e1", fontSize: "0.72em", fontWeight: 880, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.025em" }}>
                {entry.score}
              </span>
            </div>
          );
        })}
      </div>

      {data.source ? (
        <div style={{ overflow: "hidden", marginTop: "0.46em", color: "#64748b", fontSize: "0.27em", fontWeight: 650, letterSpacing: "0.035em", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          SOURCE · {data.source}
        </div>
      ) : null}
      </div>
    </div>
  );
}
