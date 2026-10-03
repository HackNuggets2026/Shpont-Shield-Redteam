import { Crown, Loader2, Play, TriangleAlert } from "lucide-react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

import { ShimmeringText } from "@/components/animate-ui/primitives/texts/shimmering"
import { Empty, Num, Panel, Pill } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { type LeagueRow, useReferee, useRunReferee } from "@/lib/api"
import { cap, clock, pct, scoreTone, TONE_TEXT, words } from "@/lib/format"
import { cn } from "@/lib/utils"

const COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981"]

function Card({ g, rank, color }: { g: LeagueRow; rank: number; color: string }) {
  if (g.error) {
    return (
      <div className="rounded-xl border border-dashed p-4">
        <div className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: color }} />{g.name}<span className="text-xs text-muted-foreground">{g.owner}</span></div>
        <p className="mt-2 flex items-start gap-1.5 text-sm text-muted-foreground"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />Not reachable: {g.error}</p>
      </div>
    )
  }
  const skipped = Object.values(g.skipped).reduce((a, b) => a + b, 0)
  return (
    <div className={cn("relative rounded-xl border p-4", rank === 0 && "border-amber-400/60 bg-amber-400/5")}>
      {rank === 0 ? <Crown className="absolute top-3 right-3 size-5 text-amber-500" /> : null}
      <div className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ background: color }} />{g.name}<span className="text-xs text-muted-foreground">{g.owner}</span></div>
      <div className={cn("mt-2 text-4xl font-semibold tracking-tight", TONE_TEXT[scoreTone(g.posture)])}><Num value={g.posture} decimals={1} /></div>
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <span className="text-muted-foreground">attacks stopped</span><span className="text-right tabular-nums">{g.attacks?.stopped}/{g.attacks?.total}</span>
        <span className="text-muted-foreground">normal blocked</span><span className="text-right tabular-nums">{g.benign?.stopped}/{g.benign?.total}</span>
        <span className="text-muted-foreground">disguised stopped</span><span className="text-right tabular-nums">{pct(g.evasion)}</span>
        <span className="text-muted-foreground">delay p95</span><span className="text-right tabular-nums">{g.latency_ms?.p95} ms</span>
      </div>
      {skipped ? <p className="mt-2 text-xs text-muted-foreground">Cannot evaluate {skipped} test messages ({Object.keys(g.skipped).map(words).join(", ")}): it checks prompts only.</p> : null}
    </div>
  )
}

export function Referee() {
  const { data } = useReferee()
  const run = useRunReferee()
  const r = data?.result
  const ranked = [...(r?.gateways ?? [])].sort((a, b) => (b.posture ?? -1) - (a.posture ?? -1))
  const colorOf = (name: string) => COLORS[(data?.configured.findIndex((c) => c.name === name) ?? 0) % COLORS.length]
  const cats = [...new Set(ranked.flatMap((g) => (g.by_category ?? []).filter((c) => c.attacks).map((c) => c.name)))].sort()
  const chart = cats.map((cat) => Object.fromEntries([["cat", cap(cat)], ...ranked.filter((g) => !g.error).map((g) => [g.name, Math.round(100 * ((g.by_category ?? []).find((c) => c.name === cat)?.protection ?? 0))])]))

  return (
    <div className="grid grid-cols-12 gap-4">
      <Panel className="col-span-12" title="One test, every gateway the team built"
        hint="The same 103 test messages and their disguised versions go to all four control layers, each running its own demo policy offline. Trap drills are left out: the decoys are planted in Shield only."
        action={<Button size="sm" disabled={data?.busy || run.isPending} onClick={() => run.mutate()}>
          {data?.busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}{r ? "Run again" : "Run the comparison"}</Button>}>
        {data?.busy ? <p className="mb-3 text-sm"><ShimmeringText text="Sending every test message to four gateways…" duration={1.6} /></p> : null}
        {!r ? <Empty>{data?.busy ? "" : "Not run yet. Start the other gateways with demo/referee-up.sh, then press Run."}</Empty> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ranked.map((g, i) => <Card key={g.name} g={g} rank={g.error ? 99 : i} color={colorOf(g.name)} />)}
          </div>
        )}
        {r ? <p className="mt-3 text-xs text-muted-foreground">Run at {clock(r.ran_at)}. Offline settings for everyone: keyword or stand-in models instead of real decision models, so semantic checks score lower than with models. The corpus was written against Shield, which favours it.</p> : null}
      </Panel>

      {r ? (
        <>
          <Panel className="col-span-12 xl:col-span-8" title="Who stops which kind of attack" hint="Share of each attack class stopped, per gateway">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid vertical={false} className="stroke-border" strokeDasharray="3 3" />
                <XAxis dataKey="cat" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval={0} />
                <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} contentStyle={{ borderRadius: 8, fontSize: 12, background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {ranked.filter((g) => !g.error).map((g) => <Bar key={g.name} dataKey={g.name} fill={colorOf(g.name)} radius={[3, 3, 0, 0]} isAnimationActive={false} />)}
              </BarChart>
            </ResponsiveContainer>
          </Panel>
          <div className="col-span-12 space-y-4 xl:col-span-4">
            <Panel title="Best part of each, for the merge" hint="For every attack class, the gateway that stops the most">
              <ul className="divide-y">
                {r.best_by_category.map((b) => (
                  <li key={b.category} className="flex items-center gap-2 py-2 text-sm">
                    <span className="flex-1">{cap(b.category)}</span>
                    <span className="size-2 rounded-full" style={{ background: colorOf(b.gateway) }} /><b>{b.gateway}</b>
                    <span className="w-12 text-right text-muted-foreground tabular-nums">{pct(b.protection)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Gaps nobody closes" hint="Attacks every gateway that can evaluate them lets through">
              {r.gaps_everywhere.length ? (
                <div className="flex flex-wrap gap-1.5">{r.gaps_everywhere.map((g) => <Pill key={g} tone="bad" className="font-mono">{g}</Pill>)}</div>
              ) : <Empty>None: every attack is stopped by at least one gateway.</Empty>}
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  )
}
