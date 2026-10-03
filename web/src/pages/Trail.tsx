import { ArrowRight, Database, Footprints, Loader2, Play, ShieldX, Upload } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { ShimmeringText } from "@/components/animate-ui/primitives/texts/shimmering"
import { Empty, Num, Panel, Pill, Stat } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { trailDemo, type TrailIncident, useTrail } from "@/lib/api"
import { clock } from "@/lib/format"

function Chain({ inc }: { inc: TrailIncident }) {
  return (
    <div className="grid items-center gap-2 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
      <div className="rounded-xl border p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Database className="size-3.5" />Read</div>
        {inc.read ? (
          <p className="text-sm"><b>{inc.read.reader}</b> read <span className="font-mono">{inc.read.masked}</span> ({inc.read.field}){inc.read.tool ? <> via <span className="font-mono">{inc.read.tool}</span></> : null}
            <span className="block text-xs text-muted-foreground">{clock(inc.read.read_at)}</span></p>
        ) : <p className="text-sm text-muted-foreground">read earlier (expired from the trail)</p>}
      </div>
      <ArrowRight className="mx-auto size-4 text-muted-foreground" />
      <div className="rounded-xl border p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><Upload className="size-3.5" />Tried to leave</div>
        <p className="text-sm"><b>{inc.moved_by}</b> <span className="text-muted-foreground">{inc.team}</span> sent it out{inc.tool ? <> via <span className="font-mono">{inc.tool}</span></> : null}
          <span className="block text-xs text-muted-foreground">{clock(inc.ts)}</span></p>
      </div>
      <ArrowRight className="mx-auto size-4 text-muted-foreground" />
      <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
        <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldX className="size-3.5" />Shield</div>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{inc.action === "block" ? "Blocked" : inc.action}</p>
        <p className="text-xs text-muted-foreground">no detector knew this value; the trail did</p>
      </div>
    </div>
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
      <Panel className="col-span-12" title="From where data was read to where it tried to go"
        hint="Detectors know card numbers and keys, not a customer's name or a contract number. The trail remembers what agents actually read from company systems and stops those values in outgoing tool calls."
        action={data?.can_demo ? <Button size="sm" disabled={busy} onClick={demo}>{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}Play a two-step leak</Button> : null}>
        {busy ? <p className="mb-3 text-sm"><ShimmeringText text="One agent reads a customer record… another will try to send it out in 5 seconds…" duration={1.6} /></p> : null}
        {incidents.length ? (
          <div className="space-y-3">{incidents.slice(0, 6).map((inc) => <Chain key={inc.sig_id + inc.ts} inc={inc} />)}</div>
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
