// Types and data access for the Redteam service (shield_redteam/server/app.py).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

export type SegState = "active" | "monitor" | "shadow" | "off"
export interface Segment { id: string; label: string; state: SegState; mode: string; switchable: boolean }
export interface Ring { id: string; label: string; segments: Segment[] }
export interface Outcome {
  id: string; attack: boolean; stopped: boolean; category: string; direction: string
  ring: number; seg: string; rewrite: boolean; action: string; text: string
}
export interface CaseRow {
  id: string; kind: string; category: string; owasp: string; direction: string; principal: string
  technique: string | null; text: string; action: string; caught_by: string[]; error: string
  was?: string; was_caught_by?: string[]
}
export interface Group { name: string; attacks: number; stopped: number; benign: number; false_positives: number; protection: number | null }
export interface Report {
  fingerprint: string; started: number; seconds: number; cases: number; errors: number
  posture: number | null; protection: number | null; friction: number | null; evasion: number | null
  attacks: { total: number; stopped: number }; benign: { total: number; stopped: number }; mutants: { total: number; stopped: number }
  by_category: Group[]; by_owasp: Group[]; by_technique: { name: string; total: number; stopped: number }[]
  latency_ms: { p50: number | null; p95: number | null }
  open_attacks: CaseRow[]; false_positives: CaseRow[]; evaded: CaseRow[]
}
export interface Change {
  ts: number; from: string; to: string; cause: string[]; controls: { id: string; what: string }[]
  posture_before: number | null; posture_after: number | null
  opened: CaseRow[]; closed: CaseRow[]; new_false_positives: CaseRow[]; fixed_false_positives: CaseRow[]
  opened_by_category: Record<string, number>; changed: boolean
}
export interface Decoy { id: string; sig_id: string; class: string; kind: string; label: string; planted_in: string; directions: string[]; value_masked: string }
export interface Alert {
  ts: number; sig_id: string; decoy: string; label: string; class: string; planted_in: string
  principal: string; team: string; role: string; channel: string; direction: string; tool: string | null; action: string; request_id: string
}
export interface State {
  now: number
  target: { name: string; error?: string; policy?: { name?: string; version?: string; last_error?: string | null }; feed?: { version?: string }; semantic?: { backend?: string } }
  poligon: {
    report: Report | null; runs: number; error: string
    history: { ts: number; posture: number | null; protection: number | null; friction: number | null; evasion: number | null }[]
    changes: Change[]; corpus: { cases: number; mutants: number; attacks: number; benign: number }
  }
  tripwire: { decoys: Decoy[]; alerts: Alert[]; drills: number; incidents: number; by_principal: [string, number][]; feed_version: string; feed_applied: boolean; feed_error: string }
  feedcheck: { feed_version: string; signatures: number; broken: number; self_tested: number; rows: { id: string; ok: boolean; vectors: number; problems: string[] }[] }
}
export interface Stage { rings: Ring[]; can_switch: boolean; can_steal: boolean; outcomes: Outcome[]; run: number }
export interface Verdict { action: string; stopped: boolean; by: string | null; findings: string[]; ms: number; error: string }

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}
async function post<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })
  const data = await r.json()
  if (data && typeof data === "object" && "error" in data && data.error) throw new Error(String(data.error))
  return data as T
}

const LIVE = ["live"] as const

/** Everything the dashboard shows, refreshed every two seconds. */
export function useLive() {
  return useQuery({
    queryKey: LIVE,
    queryFn: async () => {
      const [state, stage] = await Promise.all([get<State>("/api/state"), get<Stage>("/api/stage")])
      return { state, stage }
    },
    refetchInterval: 2000,
    retry: false,
  })
}

function useAction<TArgs, TOut>(fn: (args: TArgs) => Promise<TOut>) {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: LIVE }) })
}
export const useRetest = () => useAction(() => post<Report>("/api/run"))
export const useSwitch = () => useAction((a: { id: string; enabled: boolean }) => post<{ ok: boolean }>("/api/control", a))
export const useSteal = () => useAction((decoy: string) => post<{ action: string; stopped: boolean }>("/api/steal", { decoy }))
export const tryMessage = (text: string, direction: string) => post<Verdict>("/api/try", { text, direction })
