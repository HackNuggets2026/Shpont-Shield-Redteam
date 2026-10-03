import { Crosshair } from "lucide-react"
import { motion } from "motion/react"
import { type ReactNode, useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { toast } from "sonner"

import { Moon } from "@/components/animate-ui/icons/moon"
import { RefreshCw } from "@/components/animate-ui/icons/refresh-cw"
import { Sun } from "@/components/animate-ui/icons/sun"
import { Highlight, HighlightItem } from "@/components/animate-ui/primitives/effects/highlight"
import { Button } from "@/components/ui/button"
import { DotPattern } from "@/components/ui/dot-pattern"
import { type Stage, type State, useRetest } from "@/lib/api"
import { ago } from "@/lib/format"
import { FLAT, GROUPS } from "@/lib/nav"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"


export function AppShell({ state, stage, children }: { state?: State; stage?: Stage; children: ReactNode }) {
  const { pathname } = useLocation()
  const { theme, toggle } = useTheme()
  const retest = useRetest()
  const [hover, setHover] = useState<string | null>(null)
  const report = state?.poligon.report
  const counts: Record<string, number> = {
    "/safeguards": stage?.rings.flatMap((r) => r.segments).filter((s) => s.state === "off").length ?? 0,
    "/attacks": report ? report.attacks.total - report.attacks.stopped : 0,
    "/traps": state?.tripwire.incidents ?? 0,
  }
  const down = !state || !!state.target.error || !!state.poligon.error
  const page = FLAT.find((i) => i.to === pathname) ?? FLAT[1]
  const PageIcon = page.icon

  return (
    <div className="grid min-h-svh grid-cols-1 bg-background md:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-5 border-b bg-sidebar p-4 md:sticky md:top-0 md:h-svh md:border-r md:border-b-0">
        <div className="flex items-center gap-2.5 px-2">
          <span className="relative grid size-8 place-items-center rounded-lg bg-foreground text-background">
            <Crosshair className="size-4.5" />
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-brand ring-2 ring-sidebar" />
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Shpont Shield</div>
            <div className="font-mono text-[11px] font-medium tracking-wider text-brand uppercase">Redteam</div>
          </div>
        </div>

        <Highlight as="nav" controlledItems hover value={pathname} className="rounded-lg bg-muted" mode="parent"
          containerClassName="flex gap-1 overflow-x-auto md:-mx-1 md:min-h-0 md:flex-col md:overflow-y-auto md:px-1">
          {GROUPS.map((g) => [
            g.label ? <div key={g.label} className="hidden px-2.5 pt-4 pb-1 font-mono text-[10px] font-medium tracking-widest text-muted-foreground/70 uppercase md:block">{g.label}</div> : null,
            ...g.items.map(({ to, label, icon: Icon }) => (
              <HighlightItem key={to} value={to} asChild>
                <NavLink to={to} end={to === "/"} onMouseEnter={() => setHover(to)} onMouseLeave={() => setHover(null)}
                  className={({ isActive }) => cn(
                    "relative z-10 flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                    isActive && "text-foreground")}>
                  {({ isActive }) => (
                    <>
                      {isActive ? <motion.span layoutId="nav-bar" className="absolute top-1.5 bottom-1.5 -left-1 hidden w-0.5 rounded-full bg-brand md:block" transition={{ type: "spring", stiffness: 500, damping: 40 }} /> : null}
                      <Icon className={cn("size-4 shrink-0", isActive && "text-brand")} animate={hover === to} />
                      {label}
                      {counts[to] ? <span className="ml-auto rounded-full bg-red-600 px-1.5 font-mono text-[10px] font-semibold text-white tabular-nums">{counts[to]}</span> : null}
                    </>
                  )}
                </NavLink>
              </HighlightItem>
            )),
          ])}
        </Highlight>

        <div className="mt-auto hidden px-1 md:block">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="relative flex size-2">
              {down ? null : <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
              <span className={cn("relative inline-flex size-2 rounded-full", down ? "bg-red-500" : "bg-emerald-500")} />
            </span>
            <span className="truncate font-mono">{down ? "Shield unreachable" : state.target.name.replace(/^https?:\/\//, "")}</span>
          </div>
        </div>
      </aside>

      <div className="relative min-w-0">
        <DotPattern width={18} height={18} cr={0.8} className="pointer-events-none fixed inset-0 -z-0 text-foreground/[0.07] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b bg-background/80 px-6 py-3 backdrop-blur-md">
          <motion.span key={pathname} initial={{ scale: 0.6, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="hidden size-9 shrink-0 place-items-center rounded-lg border bg-card text-brand shadow-sm sm:grid">
            <PageIcon className="size-4.5" animate />
          </motion.span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-lg font-semibold tracking-tight">
              {page.group ? <span className="hidden font-mono text-[11px] font-medium tracking-widest text-muted-foreground uppercase sm:inline">{page.group} /</span> : null}
              <h1>{page.label}</h1>
            </div>
            <p className="truncate text-sm text-muted-foreground">{page.sub}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {report && state ? (
              <span className="hidden font-mono text-[11px] text-muted-foreground lg:inline">
                policy {state.target.policy?.version ?? "?"} · run {state.poligon.runs} · tested {ago(report.started, state.now)}
              </span>
            ) : null}
            <Button variant="outline" size="sm" disabled={retest.isPending}
              onClick={() => retest.mutate(undefined, { onSuccess: () => toast.success("Test repeated"), onError: (e) => toast.error(e.message) })}>
              <RefreshCw className="size-3.5" animate={retest.isPending} loop />Re-test
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={toggle}>
              {theme === "dark" ? <Sun className="size-4" animateOnHover /> : <Moon className="size-4" animateOnHover />}
            </Button>
          </div>
        </header>
        <motion.main key={pathname} className="relative p-6" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.045 } } }}>
          {children}
        </motion.main>
      </div>
    </div>
  )
}
