import { ArrowDownRight, ArrowUpRight, Check, ShieldAlert, ShieldCheck, TriangleAlert } from "lucide-react"
import { useEffect, useState } from "react"
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { Empty, Num, Panel, Pill, Stat } from "@/components/bits"
import { Pipeline } from "@/components/Pipeline"
import { ScoreRing } from "@/components/ScoreRing"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useToggleSafeguard } from "@/lib/actions"
import type { Change, Stage, State } from "@/lib/api"
import { cap, clock, pct, scoreTone, segLabel, words } from "@/lib/format"

function changeTitle(c: Change, stage: Stage) {
  if (c.controls?.length) return c.controls.map((k) => `${segLabel(stage.rings, k.id)} ${k.what}`).join(", ")
  return `${words(c.cause.join(", ")) || "Settings"} changed`
}

const FEED = {
  stopped: { icon: ShieldCheck, label: "Stopped", cls: "text-emerald-600 dark:text-emerald-400" },
  through: { icon: ShieldAlert, label: "Got through", cls: "text-red-600 dark:text-red-400" },
  wrong: { icon: TriangleAlert, label: "Wrongly blocked", cls: "text-amber-600 dark:text-amber-400" },
  normal: { icon: Check, label: "Normal, allowed", cls: "text-muted-foreground" },
} as const

function LiveFeed({ stage }: { stage: Stage }) {
  const [at, setAt] = useState(0)
  useEffect(() => { const t = setInterval(() => setAt((x) => x + 1), 1600); return () => clearInterval(t) }, [])
  const base = stage.outcomes.filter((o) => !o.rewrite)
  if (!base.length) return <Empty>Waiting for the first run.</Empty>
  const rows = Array.from({ length: 8 }, (_, i) => base[(at + i * 17) % base.length])
  return (
    <ul className="grid gap-x-8 md:grid-cols-2">
      {rows.map((o, i) => {
        const kind = o.attack ? (o.stopped ? "stopped" : "through") : o.stopped ? "wrong" : "normal"
        const { icon: Icon, label, cls } = FEED[kind]
        return (
          <li key={`${o.id}-${i}`} className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-2.5 border-b py-2.5">
            <Icon className={`mt-0.5 size-4 ${cls}`} aria-hidden />
            <div className="min-w-0">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className={`font-medium ${cls}`}>{o.attack ? `Attack ${label.toLowerCase()}` : label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {o.stopped ? `by ${segLabel(stage.rings, o.seg)}` : cap(o.category)}
                </span>
              </div>
              <p className="truncate font-mono text-xs text-muted-foreground" title={o.text}>{o.text}</p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export function Overview({ state, stage }: { state: State; stage: Stage }) {
  const r = state.poligon.report
  const { toggle, pending } = useToggleSafeguard(stage.can_switch)
  const [open, setOpen] = useState<Change | null>(null)
  if (!r) return <Empty>The first test run has not finished yet.</Empty>

  const changes = state.poligon.changes.filter((c) => c.changed)
  const hist = state.poligon.history.slice(-60).map((h) => ({ t: clock(h.ts), ts: h.ts, score: h.posture ?? 0, pin: "" }))
  for (const c of changes) {
    const p = hist.find((h) => h.ts >= c.ts)
    if (p) p.pin = (c.posture_after ?? 0) < (c.posture_before ?? 0) ? "down" : "up"
  }
  const miss = r.attacks.total - r.attacks.stopped
  const tone = scoreTone(r.posture)

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Attacks stopped" value={<><Num value={r.attacks.stopped} /> / {r.attacks.total}</>} sub={pct(r.protection)} tone={miss ? undefined : "good"} />
        <Stat label="Normal requests blocked by mistake" value={<><Num value={r.benign.stopped} /> / {r.benign.total}</>} sub={pct(r.friction)} tone={r.benign.stopped ? "warn" : "good"} />
        <Stat label="Disguised attacks stopped" value={<><Num value={Math.round((r.evasion ?? 0) * 100)} />%</>} sub={`${r.mutants.stopped} of ${r.mutants.total} rewrites`} />
        <Stat label="Delay added per message" value={<><Num value={r.latency_ms.p95} decimals={2} /> ms</>} sub="slowest 5% of messages" />
      </div>

      <Panel className="col-span-12" title="What happens to every test message?" hint="Messages enter on the left and pass five stages. Each stage takes out what it catches. Click a safeguard to switch it off.">
        <Pipeline stage={stage} onToggle={toggle} pending={pending} />
      </Panel>

      <Panel className="col-span-12 lg:col-span-4" title="How safe is it right now?" hint="Measured by attacking the firewall, not estimated">
        <div className="flex flex-col items-center">
          <ScoreRing value={r.posture} />
          <p className="mt-1 text-center text-sm">
            {miss ? <><b>{miss}</b> of {r.attacks.total} known attacks still get through.</> : <>All {r.attacks.total} known attacks are stopped.</>}
          </p>
          <p className="mt-1 text-center text-xs text-muted-foreground">
            {tone === "good" ? "Above the target of 90." : tone === "warn" ? "Below the target of 90." : "Far below the target of 90."} {r.cases} test messages in {r.seconds} s.
          </p>
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-8" title="Did a settings change break anything?" hint="Score after every test run. A dot marks a change in Shield's settings.">
        {hist.length > 1 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={hist} margin={{ top: 10, right: 12, bottom: 0, left: -18 }}>
              <defs><linearGradient id="score" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity={0.08} /><stop offset="1" stopColor="currentColor" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid vertical={false} className="stroke-border" strokeDasharray="3 3" />
              <XAxis dataKey="t" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} minTickGap={48} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
              <ReferenceLine y={90} stroke="#10b981" strokeDasharray="4 4" label={{ value: "target 90", position: "insideTopRight", fontSize: 11, fill: "#10b981" }} />
              <Area type="stepAfter" dataKey="score" className="text-foreground" stroke="currentColor" strokeWidth={2} fill="url(#score)" isAnimationActive={false}
                dot={({ cx, cy, payload, index }) => payload.pin
                  ? <circle key={index} cx={cx} cy={cy} r={5.5} fill={payload.pin === "down" ? "#ef4444" : "#10b981"} stroke="var(--card)" strokeWidth={2} />
                  : <g key={index} />} />
            </AreaChart>
          </ResponsiveContainer>
        ) : <Empty>The line appears after the second test run.</Empty>}
        <ul className="mt-3 divide-y">
          {changes.slice(0, 4).map((c) => {
            const d = (c.posture_after ?? 0) - (c.posture_before ?? 0)
            return (
              <li key={c.ts}>
                <button className="flex w-full items-center gap-3 py-2 text-left text-sm hover:bg-muted/60" onClick={() => setOpen(c)}>
                  <span className={`grid size-6 shrink-0 place-items-center rounded-full ${d < 0 ? "bg-red-500/10 text-red-600" : "bg-emerald-500/10 text-emerald-600"}`}>
                    {d < 0 ? <ArrowDownRight className="size-3.5" /> : <ArrowUpRight className="size-3.5" />}
                  </span>
                  <span className="font-medium">{changeTitle(c, stage)}</span>
                  <span className="text-muted-foreground">{c.opened.length ? `${c.opened.length} attacks now get through` : c.closed.length ? `${c.closed.length} attacks stopped again` : `${c.new_false_positives.length} normal requests affected`}</span>
                  <span className="ml-auto tabular-nums">{c.posture_before} → <b>{c.posture_after}</b></span>
                  <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">{clock(c.ts)}</span>
                </button>
              </li>
            )
          })}
          {!changes.length ? <Empty>No change yet. Switch a safeguard off and the damage shows here.</Empty> : null}
        </ul>
      </Panel>

      <Panel className="col-span-12" title="Live test messages" hint="What we are sending right now, and what Shield did">
        <LiveFeed stage={stage} />
      </Panel>

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {open ? (
            <>
              <SheetHeader>
                <SheetTitle>{changeTitle(open, stage)}</SheetTitle>
                <SheetDescription>{clock(open.ts)} · score {open.posture_before} → {open.posture_after}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6 text-sm">
                {([["Attacks that started getting through", open.opened, "bad"], ["Attacks stopped again", open.closed, "good"], ["Normal requests newly blocked", open.new_false_positives, "warn"]] as const).map(([label, rows, t]) =>
                  rows.length ? (
                    <section key={label}>
                      <h3 className="mb-2 font-medium">{label} <span className="text-muted-foreground">({rows.length})</span></h3>
                      <ul className="space-y-2">
                        {rows.filter((o) => !o.technique).slice(0, 20).map((o) => (
                          <li key={o.id} className="rounded-lg border p-2.5">
                            <div className="mb-1 flex items-center gap-2"><Pill tone={t}>{words(o.category)}</Pill><span className="font-mono text-xs text-muted-foreground">{o.id}</span></div>
                            <p className="break-words text-muted-foreground">{o.text}</p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null)}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
