import { ArrowRight, FlaskConical, Loader2, RotateCcw } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Empty, Panel, Pill } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { type ChangeSpec, type Preview, previewChanges, type Stage, useApplyChanges } from "@/lib/api"
import { cap, CHANNEL, scoreTone, TONE_TEXT, words } from "@/lib/format"
import { cn } from "@/lib/utils"

type Choice = "keep" | "on" | "off" | "block" | "redact" | "warn" | "log"
const CHOICES: { v: Choice; label: string }[] = [
  { v: "keep", label: "as is" }, { v: "off", label: "off" }, { v: "on", label: "on" },
  { v: "block", label: "block" }, { v: "redact", label: "redact" }, { v: "log", label: "log only" },
]

function toChanges(plan: Record<string, Choice>): ChangeSpec[] {
  return Object.entries(plan).filter(([, c]) => c !== "keep").map(([control, c]) =>
    c === "on" ? { control, enabled: true } : c === "off" ? { control, enabled: false } : { control, enabled: true, mode: c })
}

function Score({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="text-center">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("text-4xl font-semibold tracking-tight tabular-nums", TONE_TEXT[scoreTone(value)])}>{value ?? "–"}</div>
    </div>
  )
}

function Result({ p }: { p: Preview }) {
  const d = (p.after.posture ?? 0) - (p.before.posture ?? 0)
  const stopped = p.traffic.newly_stopped, allowed = p.traffic.newly_allowed
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-6 rounded-xl border bg-muted/40 py-4">
        <Score label="Score now" value={p.before.posture} />
        <ArrowRight className="size-5 text-muted-foreground" />
        <Score label="After the change" value={p.after.posture} />
        <Pill tone={d < 0 ? "bad" : d > 0 ? "good" : "plain"} className="text-sm">{d > 0 ? "+" : ""}{d.toFixed(1)}</Pill>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <section>
          <h3 className="mb-2 text-sm font-medium">Security: test attacks</h3>
          <ul className="space-y-1.5 text-sm">
            <li><b className="text-red-600 dark:text-red-400">{p.impact.opened.length}</b> would start getting through{p.impact.opened.length ? `: ${Object.entries(p.impact.opened_by_category).map(([k, v]) => `${v} ${words(k)}`).join(", ")}` : ""}</li>
            <li><b className="text-emerald-600 dark:text-emerald-400">{p.impact.closed.length}</b> would be stopped again</li>
          </ul>
          {p.impact.opened.filter((o) => !o.technique).slice(0, 4).map((o) => <p key={o.id} className="mt-2 truncate border-l-2 border-red-500 pl-2 font-mono text-xs text-muted-foreground" title={o.text}>{o.text}</p>)}
        </section>
        <section>
          <h3 className="mb-2 text-sm font-medium">Productivity: {p.traffic.replayed} real requests replayed</h3>
          {p.traffic.replayed === 0 ? <p className="text-sm text-muted-foreground">No real traffic recorded yet. Run demo/traffic.py or use Shield normally.</p> : (
            <ul className="space-y-1.5 text-sm">
              <li><b className="text-amber-600 dark:text-amber-400">{stopped.length}</b> would now be blocked or redacted</li>
              <li><b>{allowed.length}</b> would be handled more leniently</li>
            </ul>
          )}
          {[...stopped, ...allowed].slice(0, 5).map((f, i) => (
            <div key={i} className="mt-2 rounded-lg border p-2 text-xs">
              <div className="mb-0.5 flex items-center gap-2"><b>{f.principal}</b><span className="text-muted-foreground">{CHANNEL[f.direction] ?? f.direction}</span>
                <span className="ml-auto tabular-nums">{f.before} → <b>{f.after}</b></span></div>
              <p className="truncate text-muted-foreground" title={f.text}>{f.text}</p>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}

export function WhatIf({ stage }: { stage: Stage }) {
  const [plan, setPlan] = useState<Record<string, Choice>>({})
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Preview | null>(null)
  const apply = useApplyChanges()
  const changes = toChanges(plan)
  const segs = stage.rings.flatMap((r) => r.segments.map((s) => ({ ...s, stage: r.label }))).filter((s) => s.switchable)

  async function run() {
    setBusy(true)
    try { setResult(await previewChanges(changes)) } catch (e) { toast.error(e instanceof Error ? e.message : "Preview failed") } finally { setBusy(false) }
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <Panel className="col-span-12 lg:col-span-5" title="1. Draft a change" hint="Nothing touches the live firewall yet. Pick what you would change.">
        <ul className="divide-y">
          {segs.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{cap(s.label)}</div>
                <div className="text-xs text-muted-foreground">{s.stage} · now {s.state === "off" ? "off" : s.mode}</div>
              </div>
              <div className="flex rounded-lg border p-0.5">
                {CHOICES.filter((c) => s.stage !== "Budgets" || ["keep", "on", "off"].includes(c.v)).map((c) => (
                  <button key={c.v} onClick={() => { setPlan((p) => ({ ...p, [s.id]: c.v })); setResult(null) }}
                    className={cn("rounded-md px-2 py-0.5 text-xs text-muted-foreground", (plan[s.id] ?? "keep") === c.v && "bg-foreground text-background")}>{c.label}</button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="col-span-12 lg:col-span-7" title="2. See what it would do" hint="Your draft runs in a private copy of Shield on the test attacks and on recent real requests."
        action={<div className="flex gap-2">
          {changes.length ? <Button variant="ghost" size="sm" onClick={() => { setPlan({}); setResult(null) }}><RotateCcw className="size-3.5" />Reset</Button> : null}
          <Button size="sm" disabled={!changes.length || busy} onClick={run}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}Preview</Button>
        </div>}>
        {result ? (
          <>
            <Result p={result} />
            <div className="mt-4 flex items-center justify-end gap-2 border-t pt-4">
              <span className="text-xs text-muted-foreground">{changes.length} change{changes.length > 1 ? "s" : ""} to Shield's policy file</span>
              <Button variant={(result.after.posture ?? 0) < (result.before.posture ?? 0) ? "destructive" : "default"} disabled={apply.isPending}
                onClick={() => apply.mutate(changes, { onSuccess: () => { toast.success("Applied to the live firewall"); setPlan({}); setResult(null) }, onError: (e) => toast.error(e.message) })}>
                Apply to the live firewall
              </Button>
            </div>
          </>
        ) : <Empty>{changes.length ? "Press Preview." : "Pick a change on the left, for example switch Secrets off."}</Empty>}
      </Panel>
    </div>
  )
}
