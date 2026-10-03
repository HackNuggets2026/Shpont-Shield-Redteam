import type { Ring } from "./api"

export const words = (s: string | null | undefined) => String(s ?? "").replace(/_/g, " ")
export const cap = (s: string | null | undefined) => {
  const w = words(s)
  return w.charAt(0).toUpperCase() + w.slice(1)
}
export const clock = (ts: number) => new Date(ts * 1000).toLocaleTimeString([], { hour12: false })
export const pct = (x: number | null | undefined) => (x == null ? "n/a" : `${Math.round(x * 100)}%`)
export const ago = (ts: number, now: number) => {
  const s = Math.max(0, Math.round(now - ts))
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`
}
export const CHANNEL: Record<string, string> = {
  input: "Prompt", tool_call: "Tool call", output: "Model reply", tool_result: "Tool data", tool_description: "Tool listing",
}
export const ABOUT: Record<string, string> = {
  auth: "Only callers with a valid key get in",
  models: "Only approved AI models may be used",
  tool_access: "Each role may call only its allowed tools",
  budget: "Limits on requests, tokens and cost",
  secrets: "Passwords, API keys and private keys",
  pii: "Card numbers, bank accounts, national IDs",
  signatures: "Known attack patterns from a feed, and the traps",
  pii_model: "Names and addresses a pattern cannot catch",
  prompt_injection: "Text that tries to take over the AI",
  data_exfiltration: "Attempts to send internal data outside",
  confidential_output: "Confidential business info in replies",
  harmful_request: "Requests for malware, weapons, harassment",
  off_policy_use: "Non-work use, in trial mode",
}
export const scoreTone = (p: number | null | undefined) => (p == null ? "muted" : p >= 90 ? "good" : p >= 70 ? "warn" : "bad")
export const TONE_TEXT: Record<string, string> = {
  good: "text-emerald-600 dark:text-emerald-400", warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400", muted: "text-muted-foreground",
}
export const segLabel = (rings: Ring[], id: string) => {
  for (const r of rings) for (const s of r.segments) if (s.id === id) return cap(s.label)
  return cap(id)
}
/** Per-safeguard counts from the last run; rewritten variants are left out. */
export function tally(outcomes: { seg: string; attack: boolean; stopped: boolean; rewrite: boolean }[]) {
  const by: Record<string, { stop: number; miss: number; wrong: number }> = {}
  for (const o of outcomes) {
    if (o.rewrite) continue
    const t = (by[o.seg] ??= { stop: 0, miss: 0, wrong: 0 })
    if (o.attack) {
      if (o.stopped) t.stop++
      else t.miss++
    } else if (o.stopped) t.wrong++
  }
  return by
}
