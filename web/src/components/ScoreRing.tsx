import { scoreTone } from "@/lib/format"

const STROKE: Record<string, string> = { good: "#059669", warn: "#d97706", bad: "#dc2626", muted: "#a1a1aa" }

/** The measured score as a 270-degree ring. */
export function ScoreRing({ value, size = 200 }: { value: number | null; size?: number }) {
  const r = 80, c = 2 * Math.PI * r, arc = c * 0.75
  const filled = arc * Math.min(1, Math.max(0, (value ?? 0) / 100))
  const tone = scoreTone(value)
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`Score ${value ?? "unknown"} of 100`}>
      <g transform="rotate(135 100 100)" fill="none" strokeWidth="14" strokeLinecap="round">
        <circle cx="100" cy="100" r={r} className="stroke-muted" strokeDasharray={`${arc} ${c}`} />
        <circle cx="100" cy="100" r={r} stroke={STROKE[tone]} strokeDasharray={`${filled} ${c}`} style={{ transition: "stroke-dasharray .8s cubic-bezier(.16,1,.3,1), stroke .4s" }} />
      </g>
      <text x="100" y="104" textAnchor="middle" className="fill-foreground" style={{ font: "600 46px var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>
        {value == null ? "–" : value.toFixed(1)}
      </text>
      <text x="100" y="128" textAnchor="middle" className="fill-muted-foreground" style={{ font: "500 12px var(--font-sans)" }}>out of 100</text>
    </svg>
  )
}
