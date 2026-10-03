import { FolderKanban, KeyRound, Lock, MessageSquareWarning, ServerCog, UserRound } from "lucide-react"
import { toast } from "sonner"

import { Empty, Num, Panel, Pill, Stat } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { type Stage, type State, useSteal } from "@/lib/api"
import { CHANNEL, clock } from "@/lib/format"
import { cn } from "@/lib/utils"

const ICON: Record<string, typeof Lock> = { password: Lock, aws_key: KeyRound, github_token: KeyRound, person: UserRound, codename: FolderKanban, canary: MessageSquareWarning, hostname: ServerCog }
const CLASS: Record<string, string> = {
  trap: "Nobody has a reason to touch it. Any sighting is an incident.",
  marker: "A fake record inside real data. Reading it is fine, moving it out is not.",
  canary: "Lives in the system prompt. If it shows up in a reply, the prompt leaked.",
}

export function Traps({ state, stage }: { state: State; stage: Stage }) {
  const tw = state.tripwire
  const steal = useSteal()
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Traps planted" value={tw.decoys.length} />
        <Stat label="Incidents" value={<Num value={tw.incidents} />} tone={tw.incidents ? "bad" : "good"} sub="each one is confirmed, not a guess" />
        <Stat label="People and agents caught" value={tw.by_principal.length} tone={tw.by_principal.length ? "bad" : "good"} />
        <Stat label="Enforced by Shield" value={tw.feed_applied ? "Yes" : "Not yet"} tone={tw.feed_applied ? "good" : "bad"} sub={`${tw.drills} self-test hits not counted`} />
      </div>
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 grid gap-4 sm:grid-cols-2 lg:col-span-7">
          {tw.decoys.map((d) => {
            const hits = tw.alerts.filter((a) => a.decoy === d.id), Icon = ICON[d.kind] ?? Lock
            return (
              <div key={d.id} className={cn("flex flex-col gap-3 rounded-xl border bg-card p-4", hits.length && "border-red-500/40 bg-red-500/5")}>
                <div className="flex items-start gap-3">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", hits.length ? "bg-red-500/15 text-red-600" : "bg-muted text-muted-foreground")}><Icon className="size-4.5" /></span>
                  <div className="min-w-0">
                    <div className="leading-snug font-medium">{d.label}</div>
                    <div className="text-xs text-muted-foreground">hidden in {d.planted_in || "the environment"}</div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">{CLASS[d.class]}</p>
                <div className="mt-auto flex items-center justify-between gap-2">
                  {hits.length ? <Pill tone="bad">used {hits.length}x, last by {hits[0].principal}</Pill> : <Pill tone="good">untouched</Pill>}
                  {stage.can_steal ? (
                    <Button variant="outline" size="sm" disabled={steal.isPending && steal.variables === d.id}
                      onClick={() => steal.mutate(d.id, {
                        onSuccess: (v) => toast(v.stopped ? "Theft blocked and recorded" : "Theft recorded", { description: `An agent tried to send "${d.label}" to an outside site.` }),
                        onError: (e) => toast.error(e.message),
                      })}>Simulate theft</Button>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
        <Panel className="col-span-12 lg:col-span-5" title="Who took the bait?" hint="Every row names the person or agent">
          {tw.alerts.length ? (
            <ol className="relative space-y-4 border-l pl-5">
              {tw.alerts.slice(0, 12).map((a) => (
                <li key={a.request_id + a.sig_id} className="relative text-sm">
                  <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-red-500 ring-4 ring-background" />
                  <div className="flex flex-wrap items-center gap-x-2"><b>{a.principal}</b><span className="text-xs text-muted-foreground">{a.team}/{a.role}</span><span className="ml-auto text-xs text-muted-foreground tabular-nums">{clock(a.ts)}</span></div>
                  <p className="text-muted-foreground">used <span className="text-foreground">{a.label}</span> via {(CHANNEL[a.direction] ?? a.direction).toLowerCase()}{a.tool ? ` (${a.tool})` : ""}</p>
                  <Pill tone={a.action === "block" ? "good" : "warn"} className="mt-1">{a.action === "block" ? "blocked by Shield" : a.action}</Pill>
                </li>
              ))}
            </ol>
          ) : <Empty>Nobody yet. Press “Simulate theft” on a trap.</Empty>}
        </Panel>
      </div>
    </div>
  )
}
