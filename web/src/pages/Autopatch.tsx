import { ArrowRight, Check, Loader2, Undo2, Wand2 } from "lucide-react"
import { toast } from "sonner"

import { Empty, Panel, Pill, Stat } from "@/components/bits"
import { Button } from "@/components/ui/button"
import { type State, useApplyPatch, usePatches, useRevertPatch } from "@/lib/api"
import { cap, clock, words } from "@/lib/format"

export function Autopatch({ state }: { state: State }) {
  const { data } = usePatches()
  const apply = useApplyPatch(), revert = useRevertPatch()
  const r = state.poligon.report
  const proven = data?.proposals.filter((p) => p.proven) ?? []
  const best = proven.length ? Math.max(...proven.map((p) => p.after ?? 0)) : null
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Attacks getting through" value={r ? r.attacks.total - r.attacks.stopped : "–"} tone={r && r.attacks.total - r.attacks.stopped ? "bad" : "good"} />
        <Stat label="Patches proposed" value={data?.proposals.length ?? "–"} />
        <Stat label="Proven safe" value={proven.length} tone={proven.length ? "good" : undefined} sub="close their attack, block no legitimate request" />
        <Stat label="Applied" value={data?.applied.length ?? 0} sub={best ? `one patch alone reaches ${best}` : undefined} />
      </div>
      <Panel className="col-span-12 lg:col-span-8" title="Proposed patches" hint="Each one is a rule written from an attack that got through, then tested in a private copy of Shield on every test message and recent real requests."
        action={data?.busy ? <Pill tone="info"><Loader2 className="size-3 animate-spin" />proving</Pill> : null}>
        {data?.error ? <p className="mb-3 text-sm text-red-600">{data.error}</p> : null}
        {!data ? <Empty>Loading…</Empty> : data.proposals.length ? (
          <ul className="space-y-3">
            {data.proposals.map((p) => (
              <li key={p.signature.id} className="rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Wand2 className="size-4 text-muted-foreground" />
                  <span className="font-medium">{cap(words(p.signature.category))}</span>
                  {p.proven ? <Pill tone="good"><Check className="size-3" />proven</Pill> : <Pill tone="warn">not proven</Pill>}
                  <span className="ml-auto flex items-center gap-1.5 text-sm tabular-nums">{p.before}<ArrowRight className="size-3.5 text-muted-foreground" /><b className="text-emerald-600 dark:text-emerald-400">{p.after}</b></span>
                </div>
                <p className="mt-2 truncate text-xs text-muted-foreground" title={p.signature.tests?.match[0]}>Gets through today: <span className="font-mono">{p.signature.tests?.match[0]}</span></p>
                <code className="mt-2 block overflow-x-auto rounded-md bg-muted px-2.5 py-1.5 font-mono text-xs">{p.signature.pattern}</code>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>closes {p.closed.length} test case{p.closed.length === 1 ? "" : "s"}</span>
                  <span className={p.new_false_positives ? "text-red-600" : ""}>{p.new_false_positives} legitimate request{p.new_false_positives === 1 ? "" : "s"} newly blocked</span>
                  <span>{p.real_requests_checked} real requests checked</span>
                  <Button className="ml-auto" size="sm" disabled={!p.proven || apply.isPending}
                    onClick={() => apply.mutate(p.signature.id, { onSuccess: () => toast.success("Patch applied", { description: "Shield picks it up from the signature feed within seconds." }), onError: (e) => toast.error(e.message) })}>
                    Apply patch
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : <Empty>{data.busy ? "Writing and proving patches…" : "Nothing to patch: every attack in the test set is stopped."}</Empty>}
      </Panel>
      <Panel className="col-span-12 lg:col-span-4" title="Applied patches" hint="Published through the signature feed Shield already reads">
        {data?.applied.length ? (
          <ul className="space-y-2">
            {data.applied.map((a) => (
              <li key={a.signature.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2"><span className="font-medium">{cap(words(a.signature.category))}</span>
                  <span className="text-xs text-muted-foreground">{clock(a.applied_at)}</span>
                  <Button className="ml-auto" variant="ghost" size="sm" disabled={revert.isPending}
                    onClick={() => revert.mutate(a.signature.id, { onSuccess: () => toast("Patch reverted") })}><Undo2 className="size-3.5" />Revert</Button></div>
                <code className="mt-1 block truncate font-mono text-xs text-muted-foreground">{a.signature.pattern}</code>
              </li>
            ))}
          </ul>
        ) : <Empty>None yet.</Empty>}
        <p className="mt-3 text-xs text-muted-foreground">Disguised versions of an attack (encoded, spaced out) need input normalisation in Shield, which a single pattern cannot provide.</p>
      </Panel>
    </div>
  )
}
