import { Bot, Download, Globe, Lock, Search, User, Wrench } from "lucide-react"
import { useMemo, useState } from "react"
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Empty, Num, Panel, Pill, Stat } from "@/components/bits"
import { Input } from "@/components/ui/input"
import { type Leg, type ReachIdentity, useReach } from "@/lib/api"
import { cn } from "@/lib/utils"

const LEG: Record<Leg, { icon: typeof Lock; color: string; short: string }> = {
  private: { icon: Lock, color: "#8b5cf6", short: "Private data" },
  untrusted: { icon: Download, color: "#f59e0b", short: "Outside content" },
  egress: { icon: Globe, color: "#ef4444", short: "Sends out" },
}
const LEGS: Leg[] = ["private", "untrusted", "egress"]
type Filter = "flagged" | "agents" | "all"

/** One identity, the tools and resources it holds, and the capability each one gives. */
function EgoGraph({ who }: { who: ReachIdentity }) {
  const sources = useMemo(() => {
    const m = new Map<string, { id: string; kind: string; via: string; legs: Leg[] }>()
    for (const leg of LEGS) for (const s of who.legs[leg]) {
      const k = `${s.kind}:${s.id}`
      const row = m.get(k) ?? { id: s.id, kind: s.kind, via: s.via, legs: [] }
      row.legs.push(leg)
      m.set(k, row)
    }
    return [...m.values()].sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "tool" ? -1 : 1))
  }, [who])
  const ROW = 28, H = Math.max(sources.length, 3) * ROW + 20, W = 760, X = [80, 380, 650]
  const ys = (i: number, n: number) => 10 + ((H - 20) / n) * (i + 0.5)
  const legY = (leg: Leg) => ys(LEGS.indexOf(leg), 3)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`What ${who.id} can reach`}>
      {sources.map((s, i) => {
        const y = ys(i, sources.length)
        return (
          <g key={s.kind + s.id}>
            <path d={`M${X[0] + 62},${H / 2} C${X[0] + 170},${H / 2} ${X[1] - 170},${y} ${X[1] - 80},${y}`} fill="none" className="stroke-muted-foreground" strokeOpacity={0.35} />
            {s.legs.map((leg) => (
              <path key={leg} d={`M${X[1] + 80},${y} C${X[1] + 170},${y} ${X[2] - 170},${legY(leg)} ${X[2] - 78},${legY(leg)}`} fill="none" stroke={LEG[leg].color} strokeOpacity={0.6} strokeWidth={1.4} />
            ))}
            <rect x={X[1] - 80} y={y - 11} width={160} height={22} rx={6} className="fill-muted" />
            <text x={X[1] - 70} y={y + 4} className="fill-foreground" style={{ font: `500 11px ${s.kind === "tool" ? "ui-monospace, monospace" : "var(--font-sans)"}` }}>
              {s.id.length > 18 ? s.id.slice(0, 17) + "…" : s.id}
            </text>
            <text x={X[1] + 72} y={y + 4} textAnchor="end" className="fill-muted-foreground" style={{ font: "400 9px var(--font-sans)" }}>{s.via.startsWith("grant") ? "grant" : s.via.startsWith("role") ? "role" : "team"}</text>
          </g>
        )
      })}
      <rect x={X[0] - 62} y={H / 2 - 16} width={124} height={32} rx={16} className={cn("fill-foreground", who.trifecta ? "stroke-red-500" : "")} strokeWidth={2} />
      <text x={X[0]} y={H / 2 + 4} textAnchor="middle" className="fill-background" style={{ font: "600 12px var(--font-sans)" }}>
        {who.id.length > 16 ? who.id.slice(0, 15) + "…" : who.id}
      </text>
      {LEGS.map((leg) => {
        const has = who.legs[leg].length > 0
        return (
          <g key={leg}>
            <rect x={X[2] - 78} y={legY(leg) - 15} width={156} height={30} rx={15} fill={LEG[leg].color} fillOpacity={has ? 0.15 : 0.03} stroke={LEG[leg].color} strokeOpacity={has ? 1 : 0.25} strokeDasharray={has ? undefined : "4 4"} />
            <text x={X[2]} y={legY(leg) + 4} textAnchor="middle" fill={LEG[leg].color} fillOpacity={has ? 1 : 0.4} style={{ font: "600 12px var(--font-sans)" }}>{LEG[leg].short}</text>
          </g>
        )
      })}
    </svg>
  )
}

function Dots({ who }: { who: ReachIdentity }) {
  return (
    <span className="flex gap-1">
      {LEGS.map((leg) => <i key={leg} className="size-2 rounded-full" title={LEG[leg].short}
        style={{ background: who.legs[leg].length ? LEG[leg].color : "transparent", border: `1px solid ${LEG[leg].color}` }} />)}
    </span>
  )
}

export function Reach() {
  const { data } = useReach()
  const [sel, setSel] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<Filter>("flagged")
  const byTeam = useMemo(() => {
    const m: Record<string, { team: string; people: number; agents: number }> = {}
    for (const i of data?.identities ?? []) {
      if (!i.trifecta) continue
      const t = (m[i.team] ??= { team: i.team, people: 0, agents: 0 })
      if (i.kind === "agent") t.agents++
      else t.people++
    }
    return Object.values(m).sort((a, b) => b.people + b.agents - a.people - a.agents).slice(0, 10)
  }, [data])
  if (!data) return <Empty>Reading identities, grants and resources from Shield…</Empty>

  const list = data.identities
    .filter((i) => (filter === "flagged" ? i.trifecta : filter === "agents" ? i.kind === "agent" : true))
    .filter((i) => !q || `${i.id} ${i.team} ${i.role}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.trifecta) - Number(a.trifecta) || Number(b.kind === "agent") - Number(a.kind === "agent") || a.id.localeCompare(b.id))
  const chosen = data.identities.find((i) => i.id === sel) ?? list[0] ?? data.identities[0]
  const agents = data.identities.filter((i) => i.kind === "agent")

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="People and agents" value={<Num value={data.identities.length} />} sub={`${agents.length} agents`} />
        <Stat label="Could leak data with one planted instruction" value={<Num value={data.flagged.length} />} tone={data.flagged.length ? "bad" : "good"} sub="read private data + take in outside content + send out" />
        <Stat label="Agents among them" value={<Num value={agents.filter((a) => a.trifecta).length} />} tone={agents.some((a) => a.trifecta) ? "bad" : "good"} />
        <Stat label="Best single fix" value={data.fixes[0] ? <><Num value={data.fixes[0].fixes.length} /> fixed</> : "none"} sub={data.fixes[0]?.change ?? "no single change breaks a combination"} />
      </div>

      <Panel className="col-span-12 lg:col-span-4" title="People and agents" hint="Dots: private data · outside content · sends out. All three filled means one planted instruction could move private data out.">
        <div className="mb-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Search name or team" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
          </div>
        </div>
        <div className="mb-2 flex rounded-lg border p-0.5" role="group" aria-label="Filter">
          {([["flagged", `At risk (${data.flagged.length})`], ["agents", `Agents (${agents.length})`], ["all", `All (${data.identities.length})`]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} aria-pressed={filter === v}
              className={cn("flex-1 rounded-md px-2 py-1 text-xs text-muted-foreground", filter === v && "bg-foreground text-background")}>{l}</button>
          ))}
        </div>
        <ul className="max-h-[520px] divide-y overflow-y-auto">
          {list.map((i) => (
            <li key={i.id}>
              <button onClick={() => setSel(i.id)} className={cn("flex w-full items-center gap-2 px-1.5 py-2 text-left text-sm hover:bg-muted/60", chosen?.id === i.id && "bg-muted")}>
                {i.kind === "agent" ? <Bot className="size-4 shrink-0 text-muted-foreground" /> : <User className="size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{i.id}</span><span className="block truncate text-xs text-muted-foreground">{i.team} · {i.role}</span></span>
                <Dots who={i} />
              </button>
            </li>
          ))}
          {!list.length ? <Empty>Nobody matches.</Empty> : null}
        </ul>
      </Panel>

      <div className="col-span-12 space-y-4 lg:col-span-8">
        {chosen ? (
          <Panel title={`What ${chosen.id} can reach`} hint={`${chosen.kind}${chosen.owner ? ` of ${chosen.owner}` : ""} · ${chosen.team}/${chosen.role}`}
            action={chosen.trifecta ? <Pill tone="bad">could leak data</Pill> : <Pill tone="good">safe combination</Pill>}>
            <EgoGraph who={chosen} />
            {chosen.trifecta && chosen.weakest ? (
              <p className="mt-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
                Cheapest fix: remove <b>{LEG[chosen.weakest].short.toLowerCase()}</b>. It comes from only {chosen.legs[chosen.weakest].length} place{chosen.legs[chosen.weakest].length > 1 ? "s" : ""}: {chosen.legs[chosen.weakest].map((s) => s.id).join(", ")}.
              </p>
            ) : null}
          </Panel>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Panel title="Changes that fix the most" hint="Ranked by identities fixed, then by how few are affected">
            {data.fixes.length ? (
              <ul className="space-y-2">
                {data.fixes.slice(0, 4).map((f) => (
                  <li key={f.key} className="rounded-lg border p-2.5 text-sm">
                    <div className="flex items-center gap-2 font-medium"><Wrench className="size-4 shrink-0 text-muted-foreground" />{f.change}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground"><b className="text-foreground">{f.fixes.length}</b> fixed · {f.affects.length} affected in total</p>
                  </li>
                ))}
              </ul>
            ) : <Empty>No single change is enough.</Empty>}
          </Panel>
          <Panel title="Where the risk sits" hint="Identities that could leak data, by team">
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={byTeam} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="team" width={90} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
                <Bar dataKey="people" stackId="a" fill="#a78bfa" name="people" isAnimationActive={false} />
                <Bar dataKey="agents" stackId="a" fill="#ef4444" name="agents" radius={[0, 4, 4, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      </div>
    </div>
  )
}
