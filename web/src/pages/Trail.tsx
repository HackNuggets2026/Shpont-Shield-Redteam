import { ArrowRight, Database, Footprints, Loader2, Play, ShieldX, Upload } from "lucide-react"
import { type ReactNode, type RefObject, useRef, useState } from "react"
import { toast } from "sonner"

import { ShimmeringText } from "@/components/animate-ui/primitives/texts/shimmering"
import { Empty, Num, Panel, Pill, Stat } from "@/components/bits"
import { AnimatedBeam } from "@/components/ui/animated-beam"
import { Button } from "@/components/ui/button"
import { trailDemo, type TrailIncident, useTrail } from "@/lib/api"
import { clock } from "@/lib/format"
import { cn } from "@/lib/utils"

function Node({ ref, icon: Icon, label, tone, children }: { ref: RefObject<HTMLDivElement | null>; icon: typeof Database; label: string; tone?: "good"; children: ReactNode }) {
  return (
    <div ref={ref} className={cn("relative z-10 rounded-xl border bg-card p-3.5 shadow-sm", tone === "good" && "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/40")}>
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] tracking-widest text-muted-foreground uppercase"><Icon className="size-3.5" />{label}</div>
      {children}
    </div>
  )
}

/** The latest stopped attempt, drawn as data travelling from the read to the block. */
function Chain({ inc }: { inc: TrailIncident }) {
  const box = useRef<HTMLDivElement>(null), read = useRef<HTMLDivElement>(null), out = useRef<HTMLDivElement>(null), shield = useRef<HTMLDivElement>(null)
  return (
    <div ref={box} className="relative grid items-center gap-10 md:grid-cols-3 md:gap-16">
      <Node ref={read} icon={Database} label="Read">
        {inc.read ? (
          <p className="text-sm"><b>{inc.read.reader}</b> read <span className="font-mono">{inc.read.masked}</span> ({inc.read.field}){inc.read.tool ? <> via <span className="font-mono">{inc.read.tool}</span></> : null}
            <span className="block font-mono text-xs text-muted-foreground">{clock(inc.read.read_at)}</span></p>
        ) : <p className="text-sm text-muted-foreground">read earlier (expired from the trail)</p>}
      </Node>
      <Node ref={out} icon={Upload} label="Tried to leave">
        <p className="text-sm"><b>{inc.moved_by}</b> <span className="text-muted-foreground">{inc.team}</span> sent it out{inc.tool ? <> via <span className="font-mono">{inc.tool}</span></> : null}
          <span className="block font-mono text-xs text-muted-foreground">{clock(inc.ts)}</span></p>
      </Node>
      <Node ref={shield} icon={ShieldX} label="Shield" tone="good">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{inc.action === "block" ? "Blocked" : inc.action}</p>
        <p className="text-xs text-muted-foreground">no detector knew this value; the trail did</p>
      </Node>
      <AnimatedBeam containerRef={box} fromRef={read} toRef={out} duration={3} pathWidth={2} gradientStartColor="#f59e0b" gradientStopColor="#ef4444" />
      <AnimatedBeam containerRef={box} fromRef={out} toRef={shield} duration={3} delay={1.5} pathWidth={2} gradientStartColor="#ef4444" gradientStopColor="#10b981" />
    </div>
  )
}

function Row({ inc }: { inc: TrailIncident }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
      <span className="font-mono text-xs text-muted-foreground">{clock(inc.ts)}</span>
      <b>{inc.moved_by}</b><span className="text-muted-foreground">tried to send</span>
      <span className="font-mono">{inc.read?.masked ?? inc.sig_id}</span>
      {inc.read ? <span className="text-muted-foreground">read by {inc.read.reader}</span> : null}
      <ArrowRight className="size-3.5 text-muted-foreground" />
      <Pill tone={inc.action === "block" ? "good" : "warn"}>{inc.action === "block" ? "blocked" : inc.action}</Pill>
    </li>
  )
}

export function Trail() {
  const { data } = useTrail()
  const [busy, setBusy] = useState(false)
  async function demo() {
    setBusy(true)
    try {
      const r = await trailDemo()
      toast("Playing the leak", { description: `Contract ${r.contract}: read now, sent out in 5 seconds.` })
      setTimeout(() => setBusy(false), 9000)
    } catch (e) { toast.error(String(e)); setBusy(false) }
  }
  const incidents = data?.incidents ?? []
  const people = new Set(incidents.map((i) => i.moved_by))
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sensitive values being traced" value={<Num value={data?.count} />} sub="read by agents in the last 24 hours" />
        <Stat label="Attempts to send them out" value={<Num value={incidents.length} />} tone={incidents.length ? "bad" : "good"} />
        <Stat label="Agents involved" value={<Num value={people.size} />} />
        <Stat label="Where it applies" value="Outgoing calls" sub="reading the data stays allowed" />
      </div>
      <Panel className="col-span-12" beam={incidents.length ? "#10b981" : undefined} title="From where data was read to where it tried to go"
        hint="Detectors know card numbers and keys, not a customer's name or a contract number. The trail remembers what agents actually read from company systems and stops those values in outgoing tool calls."
        action={data?.can_demo ? <Button size="sm" disabled={busy} onClick={demo}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}Play a two-step leak</Button> : null}>
        {busy ? <p className="mb-3 text-sm"><ShimmeringText text="One agent reads a customer record… another will try to send it out in 5 seconds…" duration={1.6} /></p> : null}
        {incidents.length ? (
          <div className="space-y-4">
            <Chain key={incidents[0].sig_id + incidents[0].ts} inc={incidents[0]} />
            {incidents.length > 1 ? <ul className="divide-y border-t pt-1">{incidents.slice(1, 8).map((inc) => <Row key={inc.sig_id + inc.ts} inc={inc} />)}</ul> : null}
          </div>
        ) : <Empty>No attempt yet. Press “Play a two-step leak”.</Empty>}
      </Panel>
      <Panel className="col-span-12" title="Values being traced" hint="Shown masked. Each one expires after 24 hours.">
        {data?.traced.length ? (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {data.traced.slice(0, 30).map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                <Footprints className="size-4 shrink-0 text-muted-foreground" />
                <span className="whitespace-nowrap font-mono">{t.masked}</span><Pill>{t.field}</Pill>
                <span className="ml-auto min-w-0 truncate text-xs text-muted-foreground">{t.reader}{t.tool ? ` · ${t.tool}` : ""} · {clock(t.read_at)}</span>
              </li>
            ))}
          </ul>
        ) : <Empty>Nothing traced yet.</Empty>}
      </Panel>
    </div>
  )
}
