import { BookOpen, Crosshair, FlaskConical, GitCompareArrows, LayoutDashboard, Moon, Network, RefreshCw, ShieldCheck, Siren, Sun, Swords, Wand2 } from "lucide-react"
import type { ReactNode } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { type Stage, type State, useRetest } from "@/lib/api"
import { ago } from "@/lib/format"
import { useTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/about", label: "Start here", icon: BookOpen },
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/safeguards", label: "Safeguards", icon: ShieldCheck },
  { to: "/attacks", label: "Attacks", icon: Swords },
  { to: "/traps", label: "Traps", icon: Siren },
  { to: "/reach", label: "Reach map", icon: Network },
  { to: "/whatif", label: "What-if", icon: GitCompareArrows },
  { to: "/autopatch", label: "Autopatch", icon: Wand2 },
  { to: "/playground", label: "Playground", icon: FlaskConical },
]
const TITLE: Record<string, [string, string]> = {
  "/about": ["Start here", "What this project is and what I add, in two minutes"],
  "/": ["Overview", "Is the AI firewall holding, right now?"],
  "/safeguards": ["Safeguards", "Switch a protection off and see what it was stopping"],
  "/attacks": ["Attacks", "What gets through, and how attackers disguise it"],
  "/traps": ["Traps", "Fake secrets that expose whoever uses them"],
  "/playground": ["Playground", "Send your own message through the firewall"],
  "/reach": ["Reach map", "Who could move private data out if one instruction were planted"],
  "/whatif": ["What-if", "Preview a settings change before it reaches the live firewall"],
  "/autopatch": ["Autopatch", "Rules written from attacks that got through, proven before they are offered"],
}

export function AppShell({ state, stage, children }: { state?: State; stage?: Stage; children: ReactNode }) {
  const { pathname } = useLocation()
  const { theme, toggle } = useTheme()
  const retest = useRetest()
  const report = state?.poligon.report
  const counts: Record<string, number> = {
    "/safeguards": stage?.rings.flatMap((r) => r.segments).filter((s) => s.state === "off").length ?? 0,
    "/attacks": report ? report.attacks.total - report.attacks.stopped : 0,
    "/traps": state?.tripwire.incidents ?? 0,
  }
  const down = !state || !!state.target.error || !!state.poligon.error
  const [title, sub] = TITLE[pathname] ?? TITLE["/"]

  return (
    <div className="grid min-h-svh grid-cols-1 bg-muted/40 md:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-6 border-b bg-background p-4 md:sticky md:top-0 md:h-svh md:border-r md:border-b-0">
        <div className="flex items-center gap-2.5 px-2">
          <span className="grid size-8 place-items-center rounded-lg bg-foreground text-background"><Crosshair className="size-4.5" /></span>
          <div className="leading-tight">
            <div className="text-sm font-semibold">Shpont Shield</div>
            <div className="text-xs font-medium text-red-600 dark:text-red-400">Redteam</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto md:flex-col">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === "/"}
              className={({ isActive }) => cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive && "bg-muted text-foreground")}>
              <Icon className="size-4 shrink-0" />
              {label}
              {counts[to] ? <span className="ml-auto rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white tabular-nums">{counts[to]}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden space-y-3 md:block">
          <ol className="space-y-2 rounded-xl border bg-muted/50 p-3 text-xs text-muted-foreground">
            {[`Fire ${state ? state.poligon.corpus.attacks + state.poligon.corpus.benign : "test"} messages at Shield`, "Its safeguards react", "Score what got through"].map((t, i) => (
              <li key={t} className="flex items-center gap-2">
                <span className="grid size-4.5 shrink-0 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">{i + 1}</span>{t}
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <span className={cn("size-2 rounded-full", down ? "bg-red-500" : "bg-emerald-500")} />
            <span className="truncate">{down ? "Shield unreachable" : state.target.name.replace(/^https?:\/\//, "")}</span>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b bg-background/85 px-6 py-3 backdrop-blur">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
            <p className="truncate text-sm text-muted-foreground">{sub}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {report && state ? (
              <span className="hidden text-xs text-muted-foreground lg:inline">
                policy {state.target.policy?.version ?? "?"} · run {state.poligon.runs} · tested {ago(report.started, state.now)}
              </span>
            ) : null}
            <Button variant="outline" size="sm" disabled={retest.isPending}
              onClick={() => retest.mutate(undefined, { onSuccess: () => toast.success("Test repeated"), onError: (e) => toast.error(e.message) })}>
              <RefreshCw className={cn("size-3.5", retest.isPending && "animate-spin")} />Re-test
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Toggle theme" onClick={toggle}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
