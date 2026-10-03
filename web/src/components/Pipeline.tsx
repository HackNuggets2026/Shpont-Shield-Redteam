import NumberFlow from "@number-flow/react"
import { motion } from "motion/react"
import { useMemo } from "react"

import type { Stage } from "@/lib/api"
import { cap } from "@/lib/format"
import { cn } from "@/lib/utils"

// Geometry of the drawing, in viewBox units.
const W = 1000, H = 250, X0 = 130, XE = 870, GATE_W = 44, PX = 0.95 // PX: lane thickness per message
const ATTACK_Y = 92, NORMAL_Y = 196
const RED = "#ef4444", BLUE = "#3b82f6", GREEN = "#10b981", AMBER = "#f59e0b"

interface Gate { id: string; label: string; x: number; caught: number; wrong: number; off: number }

/** A lane that narrows at every gate by what the gate took out of it. */
function ribbon(cy: number, counts: number[], gates: Gate[]) {
  const half = (n: number) => Math.max(n * PX, n > 0 ? 2.5 : 0) / 2
  const top: string[] = [`M${X0},${cy - half(counts[0])}`], bottom: string[] = []
  gates.forEach((g, i) => {
    const a = half(counts[i]), b = half(counts[i + 1]), l = g.x - GATE_W / 2, r = g.x + GATE_W / 2
    top.push(`L${l},${cy - a}`, `C${g.x},${cy - a} ${g.x},${cy - b} ${r},${cy - b}`)
    bottom.unshift(`L${r},${cy + b}`, `C${g.x},${cy + b} ${g.x},${cy + a} ${l},${cy + a}`)
  })
  const end = half(counts[counts.length - 1])
  return [...top, `L${XE},${cy - end}`, `L${XE},${cy + end}`, ...bottom, `L${X0},${cy + half(counts[0])}`, "Z"].join(" ")
}

/** Dots that travel a lane and vanish at the gate that stops them. */
function Particles({ cy, color, counts, gates, n }: { cy: number; color: string; counts: number[]; gates: Gate[]; n: number }) {
  const total = counts[0]
  if (!total) return null
  return (
    <g>
      {Array.from({ length: n }, (_, i) => {
        // Spread the dots over the outcomes in proportion: dot i stands for message number `rank`.
        const rank = ((i + 0.5) / n) * total
        let stop = XE, passed = total
        for (let k = 0; k < gates.length; k++) {
          passed = counts[k + 1]
          if (rank > passed) { stop = gates[k].x; break }
        }
        const spread = ((i * 37) % 100) / 100 - 0.5
        return (
          <circle key={i} cx={X0} cy={cy + spread * Math.max(total * PX - 8, 0)} r={2.6} fill={color}
            style={{ "--dx": `${stop - X0}px`, animation: `lane ${2.4 + (stop - X0) / 500}s linear ${-(i * 0.37)}s infinite` } as React.CSSProperties} />
        )
      })}
    </g>
  )
}

function Badge({ x, y, n, color }: { x: number; y: number; n: number; color: string }) {
  if (!n) return null
  const w = 30 + String(n).length * 7
  return (
    <motion.g initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ transformOrigin: `${x}px ${y}px` }}>
      <rect x={x - w / 2} y={y - 11} width={w} height={22} rx={11} fill={color} />
      <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="middle" fill="#fff" style={{ font: "600 12px var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>−{n}</text>
    </motion.g>
  )
}

export function Pipeline({ stage, onToggle, pending }: { stage: Stage; onToggle: (id: string, name: string, enabled: boolean) => void; pending?: string }) {
  const model = useMemo(() => {
    const base = stage.outcomes.filter((o) => !o.rewrite)
    const gates: Gate[] = stage.rings.map((r, i) => ({
      id: r.id, label: r.label, x: X0 + 70 + (i * (XE - X0 - 140)) / Math.max(stage.rings.length - 1, 1),
      caught: base.filter((o) => o.attack && o.stopped && o.ring === i).length,
      wrong: base.filter((o) => !o.attack && o.stopped && o.ring === i).length,
      off: r.segments.filter((s) => s.state === "off").length,
    }))
    const attacks = base.filter((o) => o.attack).length, normal = base.length - attacks
    const a = [attacks], n = [normal]
    gates.forEach((g, i) => { a.push(a[i] - g.caught); n.push(n[i] - g.wrong) })
    const per: Record<string, { stop: number; miss: number }> = {}
    for (const o of base) if (o.attack) { const t = (per[o.seg] ??= { stop: 0, miss: 0 }); if (o.stopped) t.stop++; else t.miss++ }
    return { gates, a, n, per }
  }, [stage])
  const { gates, a, n, per } = model
  const leaked = a[a.length - 1], delivered = n[n.length - 1]
  const label = { font: "500 11px var(--font-sans)" }

  return (
    <div>
      <style>{`@keyframes lane{0%{transform:translateX(0);opacity:0}8%{opacity:1}88%{opacity:1}100%{transform:translateX(var(--dx));opacity:0}}
        @media (prefers-reduced-motion:reduce){.lane-dots circle{animation:none!important;opacity:0}}`}</style>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`${a[0]} attacks sent, ${a[0] - leaked} stopped, ${leaked} got through. ${n[0]} normal requests sent, ${delivered} delivered.`}>
        {/* lanes */}
        <motion.path animate={{ d: ribbon(ATTACK_Y, a, gates) }} initial={false} transition={{ type: "spring", stiffness: 120, damping: 20 }} fill={RED} fillOpacity={0.16} stroke={RED} strokeOpacity={0.5} />
        <motion.path animate={{ d: ribbon(NORMAL_Y, n, gates) }} initial={false} transition={{ type: "spring", stiffness: 120, damping: 20 }} fill={BLUE} fillOpacity={0.16} stroke={BLUE} strokeOpacity={0.5} />
        <g className="lane-dots">
          <Particles cy={ATTACK_Y} color={RED} counts={a} gates={gates} n={26} />
          <Particles cy={NORMAL_Y} color={BLUE} counts={n} gates={gates} n={12} />
        </g>

        {/* gates */}
        {gates.map((g, i) => (
          <g key={g.id}>
            <rect x={g.x - GATE_W / 2} y={36} width={GATE_W} height={H - 50} rx={12} className={cn("fill-card", g.off ? "stroke-red-500" : "stroke-border")}
              fillOpacity={0.82} strokeWidth={g.off ? 1.5 : 1} strokeDasharray={g.off ? "5 4" : undefined} />
            <text x={g.x} y={12} textAnchor="middle" className="fill-muted-foreground" style={{ font: "500 9px var(--font-sans)", letterSpacing: ".08em" }}>STAGE {i + 1}</text>
            <text x={g.x} y={27} textAnchor="middle" className="fill-foreground" style={{ font: "600 12px var(--font-sans)" }}>{g.label}</text>
            <Badge x={g.x} y={ATTACK_Y} n={g.caught} color={GREEN} />
            <Badge x={g.x} y={NORMAL_Y} n={g.wrong} color={AMBER} />
            {g.off ? <text x={g.x} y={H - 22} textAnchor="middle" fill={RED} style={{ font: "600 10px var(--font-sans)" }}>{g.off} OFF</text> : null}
          </g>
        ))}

        {/* ends */}
        <text x={X0 - 14} y={ATTACK_Y - 8} textAnchor="end" className="fill-foreground" style={{ font: "600 22px var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>{a[0]}</text>
        <text x={X0 - 14} y={ATTACK_Y + 12} textAnchor="end" className="fill-muted-foreground" style={label}>attacks sent</text>
        <text x={X0 - 14} y={NORMAL_Y - 8} textAnchor="end" className="fill-foreground" style={{ font: "600 22px var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>{n[0]}</text>
        <text x={X0 - 14} y={NORMAL_Y + 12} textAnchor="end" className="fill-muted-foreground" style={label}>normal requests</text>

        <text x={XE + 14} y={ATTACK_Y - 8} fill={leaked ? RED : GREEN} style={{ font: "600 22px var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>{leaked}</text>
        <text x={XE + 14} y={ATTACK_Y + 12} className="fill-muted-foreground" style={label}>{leaked ? "got through" : "none got through"}</text>
        <text x={XE + 14} y={NORMAL_Y - 8} fill={BLUE} style={{ font: "600 22px var(--font-sans)", fontVariantNumeric: "tabular-nums" }}>{delivered}</text>
        <text x={XE + 14} y={NORMAL_Y + 12} className="fill-muted-foreground" style={label}>delivered</text>
      </svg>

      {/* the safeguards behind each gate, lined up under it */}
      <div className="hidden gap-2 lg:grid" style={{ gridTemplateColumns: `repeat(${gates.length}, minmax(0,1fr))`, padding: `0 ${((X0 + 70 - (XE - X0 - 140) / (2 * Math.max(gates.length - 1, 1))) / W) * 100}%` }}>
        {stage.rings.map((ring) => (
          <div key={ring.id} className="flex flex-col items-stretch gap-1">
            {ring.segments.map((s) => {
              const on = s.state !== "off", t = per[s.id]
              return (
                <button key={s.id} disabled={!s.switchable || pending === s.id} onClick={() => onToggle(s.id, cap(s.label), !on)}
                  title={s.switchable ? (on ? "Click to switch off" : "Click to switch back on") : "Always on"}
                  className={cn("flex items-center gap-1.5 rounded-md border px-2 py-1 text-left text-xs transition-colors enabled:hover:border-foreground/40 disabled:opacity-70",
                    !on && "border-red-500/50 bg-red-500/10 text-red-600 line-through dark:text-red-400")}>
                  <span className={cn("size-1.5 shrink-0 rounded-full", on ? "bg-emerald-500" : "bg-red-500")} />
                  <span className="truncate" title={cap(s.label)}>{cap(s.label)}</span>
                  {t ? <span className="ml-auto text-muted-foreground tabular-nums no-underline">{t.stop}{t.miss ? <span className="text-red-500">+{t.miss}</span> : null}</span> : null}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-sm">
        {([[GREEN, a[0] - leaked, "attacks stopped"], [RED, leaked, "got through"], [BLUE, delivered, "normal requests delivered"], [AMBER, n[0] - delivered, "blocked by mistake"]] as const).map(([color, v, text]) => (
          <span key={text} className="flex items-center gap-1.5 text-muted-foreground">
            <i className="size-2 rounded-full" style={{ background: color }} />
            <NumberFlow value={v} className="font-semibold text-foreground" />{text}
          </span>
        ))}
      </div>
    </div>
  )
}
