import { Search } from "lucide-react"
import { useState } from "react"
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts"

import { Empty, Panel, Pill } from "@/components/bits"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { CaseRow, Stage, State } from "@/lib/api"
import { cap, CHANNEL, segLabel, words } from "@/lib/format"
import { cn } from "@/lib/utils"

function Coverage({ stage }: { stage: Stage }) {
  const cell: Record<string, [number, number]> = {}
  const base = stage.outcomes.filter((o) => o.attack && !o.rewrite)
  for (const o of base) {
    const c = (cell[`${o.category}|${o.direction}`] ??= [0, 0])
    c[1]++
    if (o.stopped) c[0]++
  }
  const cats = [...new Set(base.map((o) => o.category))].sort(), dirs = Object.keys(CHANNEL)
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[520px] gap-1.5 text-sm" style={{ gridTemplateColumns: `150px repeat(${dirs.length}, minmax(0,1fr))` }}>
        <span />
        {dirs.map((d) => <span key={d} className="pb-1 text-center text-xs text-muted-foreground">{CHANNEL[d]}</span>)}
        {cats.map((cat) => (
          <div key={cat} className="contents">
            <span className="self-center truncate pr-2 text-right">{cap(cat)}</span>
            {dirs.map((d) => {
              const c = cell[`${cat}|${d}`]
              if (!c) return <span key={d} className="h-9 rounded-md border border-dashed" title="No test for this combination" />
              const f = c[0] / c[1]
              return (
                <span key={d} title={`${cap(cat)} via ${CHANNEL[d]}: ${c[0]} of ${c[1]} stopped`}
                  className={cn("grid h-9 place-items-center rounded-md font-medium tabular-nums",
                    f === 1 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : f >= 0.6 ? "bg-amber-500/20 text-amber-700 dark:text-amber-400" : "bg-red-500/15 text-red-700 dark:text-red-400")}>
                  {c[0]}/{c[1]}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function CaseTable({ rows, tag, empty, onOpen }: { rows: CaseRow[]; tag: (o: CaseRow) => React.ReactNode; empty: string; onOpen: (o: CaseRow) => void }) {
  if (!rows.length) return <Empty>{empty}</Empty>
  return (
    <ul className="divide-y">
      {rows.map((o) => (
        <li key={o.id}>
          <button className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-muted/60" onClick={() => onOpen(o)}>
            {tag(o)}
            <span className="hidden w-20 shrink-0 text-xs text-muted-foreground sm:inline">{CHANNEL[o.direction] ?? o.direction}</span>
            <span className="truncate text-muted-foreground">{o.text}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

export function Attacks({ state, stage }: { state: State; stage: Stage }) {
  const r = state.poligon.report
  const [q, setQ] = useState("")
  const [open, setOpen] = useState<CaseRow | null>(null)
  if (!r) return <Empty>Waiting for the first test run.</Empty>
  const match = (o: CaseRow) => !q || `${o.id} ${o.category} ${o.text}`.toLowerCase().includes(q.toLowerCase())
  const radar = r.by_technique.map((g) => ({ name: cap(g.name), stopped: g.total ? Math.round((100 * g.stopped) / g.total) : 0, raw: `${g.stopped}/${g.total}` }))

  return (
    <div className="grid grid-cols-12 gap-4">
      <Panel className="col-span-12 lg:col-span-7" title="Where are the holes?" hint="Attack type by the channel it arrives on. Each cell: stopped of sent.">
        <Coverage stage={stage} />
      </Panel>
      <Panel className="col-span-12 lg:col-span-5" title="Can an attacker disguise it?" hint="The same attacks rewritten to slip past a filter. Share still stopped.">
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart data={radar} outerRadius="72%">
            <PolarGrid className="stroke-border" />
            <PolarAngleAxis dataKey="name" tick={({ x, y, payload, textAnchor }) => (
              <text x={x} y={y} textAnchor={textAnchor} className="fill-foreground" style={{ font: "500 11px var(--font-sans)" }}>
                {payload.value} <tspan className="fill-muted-foreground">{radar.find((d) => d.name === payload.value)?.stopped}%</tspan>
              </text>
            )} />
            <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} formatter={(v) => [`${v}%`, "Stopped"]} />
            <Radar dataKey="stopped" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.18} isAnimationActive={false} />
          </RadarChart>
        </ResponsiveContainer>
      </Panel>

      <div className="col-span-12 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8" placeholder="Filter the lists below" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter" />
        </div>
        <a className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:underline" href="/api/report.md" target="_blank" rel="noopener">Open the full report</a>
      </div>

      <Panel className="col-span-12 lg:col-span-6" title={`Attacks that still get through (${r.open_attacks.length})`} hint="The to-do list for whoever maintains the firewall">
        <CaseTable rows={r.open_attacks.filter(match)} empty="Every known attack is stopped." onOpen={setOpen} tag={(o) => <Pill tone="bad" className="w-36 shrink-0 justify-center">{words(o.category)}</Pill>} />
      </Panel>
      <Panel className="col-span-12 lg:col-span-6" title={`Normal requests blocked by mistake (${r.false_positives.length})`} hint="What the firewall costs the people doing their job">
        <CaseTable rows={r.false_positives.filter(match)} empty="None." onOpen={setOpen}
          tag={(o) => <Pill tone="warn" className="w-36 shrink-0 justify-center">{o.caught_by.map((x) => segLabel(stage.rings, x.split("/")[0])).join(", ") || o.action}</Pill>} />
      </Panel>
      <Panel className="col-span-12" title={`Disguised attacks that get through (${r.evaded.length})`} hint="The original is stopped, the rewritten copy is not">
        <CaseTable rows={r.evaded.filter(match).slice(0, 30)} empty="None." onOpen={setOpen} tag={(o) => <Pill className="w-36 shrink-0 justify-center">{o.technique}</Pill>} />
      </Panel>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base">{open.id}</SheetTitle>
                <SheetDescription>{cap(open.category)} · sent as {(CHANNEL[open.direction] ?? open.direction).toLowerCase()} by {open.principal}{open.owasp ? ` · OWASP ${open.owasp}` : ""}</SheetDescription>
              </SheetHeader>
              <div className="space-y-4 px-4 pb-6 text-sm">
                <div><div className="mb-1 text-xs text-muted-foreground">Message</div><pre className="rounded-lg border bg-muted/50 p-3 font-mono text-xs break-words whitespace-pre-wrap">{open.text}</pre></div>
                <div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted-foreground">Shield's answer</span><Pill tone={open.action === "block" || open.action === "redact" ? "good" : "bad"}>{open.action}</Pill>
                  {open.caught_by.map((c) => <Pill key={c}>{c}</Pill>)}</div>
                {open.technique ? <p className="text-muted-foreground">Disguise used: <b className="text-foreground">{open.technique}</b>.</p> : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
