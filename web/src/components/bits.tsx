import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** A card whose title is the question it answers. */
export function Panel({ title, hint, action, className, children }: { title: string; hint?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {hint ? <CardDescription>{hint}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

const TONES = {
  good: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  bad: "bg-red-500/10 text-red-700 dark:text-red-400",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  plain: "bg-muted text-muted-foreground",
} as const
export type Tone = keyof typeof TONES

export function Pill({ tone = "plain", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone], className)}>{children}</span>
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  const color = tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-red-600 dark:text-red-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : ""
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold tracking-tight tabular-nums", color)}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}
