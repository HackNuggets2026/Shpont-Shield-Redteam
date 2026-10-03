import { motion, type Variants } from "motion/react"
import type { ComponentType, ReactNode } from "react"

import { SlidingNumber } from "@/components/animate-ui/primitives/texts/sliding-number"

import { BorderBeam } from "@/components/ui/border-beam"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/** Page children rise in one after another; the page container in AppShell staggers them. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 10, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
}

type Icon = ComponentType<{ className?: string }>

/** A card whose title is the question it answers. */
/** `beam` runs a light around the border in that colour, for the one card a page is about. */
export function Panel({ title, hint, action, icon: Icon, beam, className, children }: { title: string; hint?: string; action?: ReactNode; icon?: Icon; beam?: string; className?: string; children: ReactNode }) {
  return (
    <motion.div variants={rise} className={className}>
      <Card className="relative h-full gap-3 transition-shadow hover:ring-foreground/20">
        {beam ? <BorderBeam size={90} duration={9} colorFrom={beam} colorTo="transparent" borderWidth={1.5} /> : null}
        <CardHeader className="flex flex-col items-start justify-between gap-3 sm:flex-row">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon ? <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground"><Icon className="size-3.5" /></span> : null}
            <div className="space-y-1">
              <CardTitle className="text-base">{title}</CardTitle>
              {hint ? <CardDescription>{hint}</CardDescription> : null}
            </div>
          </div>
          {action}
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </motion.div>
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

const STAT_TONE = {
  good: { text: "text-emerald-600 dark:text-emerald-400", bar: "bg-emerald-500" },
  bad: { text: "text-red-600 dark:text-red-400", bar: "bg-red-500" },
  warn: { text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500" },
} as const

export function Stat({ label, value, sub, tone, icon: Icon }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; icon?: Icon }) {
  const t = tone && tone in STAT_TONE ? STAT_TONE[tone as keyof typeof STAT_TONE] : null
  return (
    <motion.div variants={rise} whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="relative overflow-hidden rounded-xl border bg-card p-4 transition-shadow hover:shadow-md hover:shadow-foreground/5">
      {t ? <span className={cn("absolute inset-x-0 top-0 h-0.5 opacity-70", t.bar)} /> : null}
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        {Icon ? <Icon className="size-3.5 shrink-0" /> : null}
      </div>
      <div className={cn("mt-1.5 text-2xl font-semibold tracking-tight tabular-nums", t?.text)}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </motion.div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
}

/** A number that slides to its new value when it changes. */
export function Num({ value, decimals = 0 }: { value: number | null | undefined; decimals?: number }) {
  if (value == null || Number.isNaN(value)) return <>–</>
  return <SlidingNumber number={value} decimalPlaces={decimals} className="inline-flex tabular-nums" />
}
