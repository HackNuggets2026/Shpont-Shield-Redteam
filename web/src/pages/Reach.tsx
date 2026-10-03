import { Download, Globe, KeyRound, Lock, Wrench } from "lucide-react"
import { useMemo, useState } from "react"

import { Empty, Panel, Pill, Stat } from "@/components/bits"
import { type Leg, type Reach as ReachData, type ReachIdentity, useReach } from "@/lib/api"
import { cn } from "@/lib/utils"

const LEG: Record<Leg, { icon: typeof Lock; color: string; short: string }> = {
  private: { icon: Lock, color: "#8b5cf6", short: "Private data" },
  untrusted: { icon: Download, color: "#f59e0b", short: "Outside content" },
  egress: { icon: Globe, color: "#ef4444", short: "Sends out" },
}
const LEGS: Leg[] = ["private", "untrusted", "egress"]

function Graph({ data, selected, onSelect }: { data: ReachData; selected: string | null; onSelect: (id: string) => void }) {
  const W = 900, ROW = 30, TOP = 30
  const cols = useMemo(() => {
    const c: Record<number, typeof data.graph.nodes> = { 0: [], 1: [], 2: [] }
    for (const n of data.graph.nodes) c[n.col].push(n)
    c[1].sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label) : a.kind === "tool" ? -1 : 1))
    return c
  }, [data])
  const H = TOP + Math.max(cols[0].length, cols[1].length, 3) * ROW + 10
  const X = [140, 470, 760]
  const pos: Record<string, { x: number; y: number }> = {}
  for (const k of [0, 1, 2] as const) {
    const list = cols[k], span = Math.max(cols[0].length, cols[1].length, 3) * ROW
    list.forEach((n, i) => { pos[n.id] = { x: X[k], y: TOP + (span / list.length) * (i + 0.5) } })
  }
  // Highlight what the selected identity reaches.
  const lit = new Set<string>()
  if (selected) {
    lit.add(`p:${selected}`)
    for (const e of data.graph.edges) if (e.from === `p:${selected}`) { lit.add(e.to) }
    for (const e of data.graph.edges) if (lit.has(e.from) && e.to.startsWith("l:")) {
      const ident = data.identities.find((i) => i.id === selected)
      const leg = e.to.slice(2) as Leg
      if (ident?.legs[leg].some((s) => `${s.kind[0]}:${s.id}` === e.from)) lit.add(e.to)
    }
  }
  const on = (e: { from: string; to: string }) => !selected || (lit.has(e.from) && lit.has(e.to) && (e.from === `p:${selected}` || e.to.startsWith("l:")))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Who can reach what">
      {["People and agents", "Tools and resources", "Capabilities"].map((t, i) => (
        <text key={t} x={X[i]} y={12} textAnchor="middle" className="fill-muted-foreground" style={{ font: "600 11px var(--font-sans)", letterSpacing: ".04em" }}>{t.toUpperCase()}</text>
      ))}
      {data.graph.edges.map((e, i) => {
        const a = pos[e.from], b = pos[e.to]
        if (!a || !b) return null
        const leg = e.to.startsWith("l:") ? (e.to.slice(2) as Leg) : null
        const x1 = a.x + (e.from.startsWith("p:") ? 70 : 60), x2 = b.x - (e.to.startsWith("l:") ? 80 : 60), mx = (x1 + x2) / 2
        return <path key={i} d={`M${x1},${a.y} C${mx},${a.y} ${mx},${b.y} ${x2},${b.y}`} fill="none"
          stroke={leg ? LEG[leg].color : "currentColor"} className={leg ? "" : "text-muted-foreground"}
          strokeOpacity={on(e) ? (selected ? 0.75 : 0.22) : 0.05} strokeWidth={on(e) && selected ? 1.6 : 1} />
      })}
      {cols[0].map((n) => {
        const p = pos[n.id], sel = selected === n.label
        return (
          <g key={n.id} onClick={() => onSelect(n.label)} style={{ cursor: "pointer" }} opacity={!selected || sel ? 1 : 0.45}>
            <rect x={p.x - 70} y={p.y - 12} width={140} height={24} rx={12} className={cn(sel ? "fill-foreground" : "fill-card", n.trifecta ? "stroke-red-500" : "stroke-border")} strokeWidth={n.trifecta ? 1.5 : 1} />
            <text x={p.x - 56} y={p.y + 4} className={sel ? "fill-background" : "fill-foreground"} style={{ font: "600 12px var(--font-sans)" }}>{n.kind === "agent" ? "◆ " : ""}{n.label}</text>
            {n.trifecta ? <circle cx={p.x + 56} cy={p.y} r={4} fill="#ef4444" /> : null}
          </g>
        )
      })}
      {cols[1].map((n) => {
        const p = pos[n.id]
        return (
          <g key={n.id} opacity={!selected || lit.has(n.id) ? 1 : 0.3}>
            <rect x={p.x - 60} y={p.y - 10} width={120} height={20} rx={6} className="fill-muted" />
            <text x={p.x - 52} y={p.y + 4} className="fill-foreground" style={{ font: `500 11px ${n.kind === "tool" ? "ui-monospace, monospace" : "var(--font-sans)"}` }}>{n.label.length > 17 ? n.label.slice(0, 16) + "…" : n.label}</text>
          </g>
        )
      })}
      {cols[2].map((n) => {
        const p = pos[n.id], leg = n.id.slice(2) as Leg
        return (
          <g key={n.id} opacity={!selected || lit.has(n.id) ? 1 : 0.3}>
            <rect x={p.x - 80} y={p.y - 15} width={160} height={30} rx={15} fill={LEG[leg].color} fillOpacity={0.14} stroke={LEG[leg].color} />
            <text x={p.x} y={p.y + 4} textAnchor="middle" fill={LEG[leg].color} style={{ font: "600 12px var(--font-sans)" }}>{n.label}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Legs({ who }: { who: ReachIdentity }) {
  return (
    <div className="space-y-3">
      {LEGS.map((leg) => {
        const L = LEG[leg], srcs = who.legs[leg]
        return (
          <div key={leg} className={cn("rounded-lg border p-3", who.weakest === leg && "border-emerald-500/50 bg-emerald-500/5")}>
            <div className="mb-1.5 flex items-center gap-2 text-sm font-medium">
              <L.icon className="size-4" style={{ color: L.color }} />{L.short}
              <span className="text-muted-foreground tabular-nums">{srcs.length}</span>
              {who.weakest === leg ? <Pill tone="good" className="ml-auto">cut here: fewest sources</Pill> : null}
            </div>
            {srcs.length ? (
              <div className="flex flex-wrap gap-1.5">
                {srcs.map((s) => (
                  <span key={s.key} className="rounded-md bg-muted px-2 py-0.5 text-xs" title={s.via}>
                    <span className={s.kind === "tool" ? "font-mono" : ""}>{s.id}</span> <span className="text-muted-foreground">via {s.via.replace(":", " ")}</span>
                  </span>
                ))}
              </div>
            ) : <p className="text-xs text-muted-foreground">None. This capability is missing, so the combination is broken.</p>}
          </div>
        )
      })}
    </div>
  )
}

export function Reach() {
  const { data } = useReach()
  const [sel, setSel] = useState<string | null>(null)
  if (!data) return <Empty>Reading identities, grants and resources from Shield…</Empty>
  const chosen = data.identities.find((i) => i.id === (sel ?? data.flagged[0])) ?? data.identities[0]
  const agents = data.identities.filter((i) => i.kind === "agent")
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="People and agents" value={data.identities.length} sub={`${agents.length} agents`} />
        <Stat label="Hold all three capabilities" value={data.flagged.length} tone={data.flagged.length ? "bad" : "good"} sub="one planted instruction could move private data out" />
        <Stat label="Agents among them" value={agents.filter((a) => a.trifecta).length} tone={agents.some((a) => a.trifecta) ? "bad" : "good"} />
        <Stat label="Best single fix" value={data.fixes[0] ? `${data.fixes[0].fixes.length} fixed` : "none"} sub={data.fixes[0]?.change ?? "no single change breaks a combination"} />
      </div>
      <Panel className="col-span-12 xl:col-span-8" title="Who can reach what?" hint="Click a person or agent. Red ring: holds all three capabilities at once (private data, outside content, sending out).">
        <Graph data={data} selected={chosen?.id ?? null} onSelect={setSel} />
      </Panel>
      <div className="col-span-12 space-y-4 xl:col-span-4">
        {chosen ? (
          <Panel title={chosen.id} hint={`${chosen.kind}${chosen.owner ? ` of ${chosen.owner}` : ""} · ${chosen.team}/${chosen.role}`}
            action={chosen.trifecta ? <Pill tone="bad">all three</Pill> : <Pill tone="good">safe combination</Pill>}>
            <Legs who={chosen} />
          </Panel>
        ) : null}
        <Panel title="Changes that break the combination" hint="Ranked by how many identities each one fixes, then by how little it takes away">
          {data.fixes.length ? (
            <ul className="space-y-2">
              {data.fixes.map((f) => (
                <li key={f.key} className="rounded-lg border p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium"><Wrench className="size-4 text-muted-foreground" />{f.change}</div>
                  <p className="mt-1 text-xs text-muted-foreground">Fixes <b className="text-foreground">{f.fixes.join(", ")}</b> · also affects {f.affects.filter((a) => !f.fixes.includes(a)).join(", ") || "nobody else"} · removes "{LEG[f.leg].short.toLowerCase()}"</p>
                </li>
              ))}
            </ul>
          ) : <Empty>No single change is enough: every flagged identity gets each capability from several places.</Empty>}
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground"><KeyRound className="mt-0.5 size-3.5 shrink-0" />People are flagged too because their own AI sessions use the same tools; agents also inherit what their owner grants.</p>
        </Panel>
      </div>
    </div>
  )
}
