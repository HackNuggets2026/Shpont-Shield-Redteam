import { Empty, Panel, Pill } from "@/components/bits"
import { Switch } from "@/components/animate-ui/components/base/switch"
import { useToggleSafeguard } from "@/lib/actions"
import type { Stage, State } from "@/lib/api"
import { ABOUT, cap, tally } from "@/lib/format"
import { cn } from "@/lib/utils"

const STAGE_HINT: Record<string, string> = {
  access: "Who may use what. Checked first.",
  budget: "How much may be spent.",
  deterministic: "Exact patterns. No AI involved, microseconds.",
  context: "A small model that finds personal data in context.",
  semantic: "AI checks that understand meaning.",
}

export function Safeguards({ stage }: { state: State; stage: Stage }) {
  const by = tally(stage.outcomes)
  const { toggle, pending } = useToggleSafeguard(stage.can_switch)
  if (!stage.rings.length) return <Empty>No safeguards reported by Shield.</Empty>
  return (
    <div className="space-y-4">
      {stage.rings.map((ring, i) => (
        <Panel key={ring.id} title={`${i + 1}. ${ring.label}`} hint={STAGE_HINT[ring.id]}>
          <ul className="divide-y">
            {ring.segments.map((s) => {
              const t = by[s.id] ?? { stop: 0, miss: 0, wrong: 0 }, on = s.state !== "off", total = t.stop + t.miss
              return (
                <li key={s.id} className={cn("grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 py-3 md:grid-cols-[auto_minmax(0,1fr)_260px]", !on && "bg-red-500/5")}>
                  <Switch checked={on} disabled={!s.switchable || pending === s.id} aria-label={`${cap(s.label)} on or off`}
                    onCheckedChange={(v) => toggle(s.id, cap(s.label), v)} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {cap(s.label)}
                      {!on ? <Pill tone="bad">switched off</Pill> : s.state === "monitor" ? <Pill tone="warn">log only</Pill> : s.state === "shadow" ? <Pill>trial, never blocks</Pill> : null}
                      {!s.switchable ? <Pill>always on</Pill> : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{ABOUT[s.id] ?? ""}</p>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    {total ? (
                      <>
                        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                          <div className="bg-emerald-500 transition-all duration-700" style={{ width: `${(100 * t.stop) / total}%` }} />
                          <div className="bg-red-500 transition-all duration-700" style={{ width: `${(100 * t.miss) / total}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                          <span className="text-emerald-600 dark:text-emerald-400">{t.stop} stopped</span>
                          {t.miss ? <> · <span className="font-medium text-red-600 dark:text-red-400">{t.miss} get through</span></> : null}
                          {t.wrong ? <> · <span className="text-amber-600 dark:text-amber-400">{t.wrong} wrong block{t.wrong > 1 ? "s" : ""}</span></> : null}
                        </p>
                      </>
                    ) : <p className="text-xs text-muted-foreground">Not exercised by the test set{t.wrong ? `, ${t.wrong} wrong block` : ""}.</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        </Panel>
      ))}
    </div>
  )
}
