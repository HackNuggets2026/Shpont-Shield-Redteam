import { useEffect, useState } from "react"

import { Num } from "@/components/bits"
import { scoreTone } from "@/lib/format"

const STROKE: Record<string, string> = { good: "#059669", warn: "#d97706", bad: "#dc2626", muted: "#a1a1aa" }

/** The measured score as a 270-degree ring. */
export function ScoreRing({ value, size = 200 }: { value: number | null; size?: number }) {
  const r = 80, c = 2 * Math.PI * r, arc = c * 0.75
  // Start empty and fill on mount, so the score is drawn rather than shown.
  const [shown, setShown] = useState(0)
  useEffect(() => { const id = requestAnimationFrame(() => setShown(value ?? 0)); return () => cancelAnimationFrame(id) }, [value])
  const filled = arc * Math.min(1, Math.max(0, shown / 100))
  const tone = scoreTone(value)
  return (
    <div className="relative" style={{ width: size, height: size }}>
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={`Score ${value ?? "unknown"} of 100`}>
      <g transform="rotate(135 100 100)" fill="none" strokeWidth="14" strokeLinecap="round">
        <circle cx="100" cy="100" r={r} className="stroke-muted" strokeDasharray={`${arc} ${c}`} />
        <circle cx="100" cy="100" r={r} stroke={STROKE[tone]} strokeDasharray={`${filled} ${c}`} style={{ transition: "stroke-dasharray 1.4s cubic-bezier(.16,1,.3,1), stroke .4s", filter: `drop-shadow(0 0 6px ${STROKE[tone]}55)` }} />
      </g>
    </svg>
    <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
      <span className="font-mono leading-none font-semibold tracking-tighter" style={{ fontSize: size * 0.23 }}><Num value={value} decimals={1} /></span>
      <span className="mt-1.5 text-xs text-muted-foreground">out of 100</span>
    </div>
    </div>
  )
}
