import { ArrowRight, BookOpen, FlaskConical, GitCompareArrows, LayoutDashboard, Network, ShieldCheck, Siren, Swords, Wand2 } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { Panel } from "@/components/bits"
import { type Stage, type State, useReach } from "@/lib/api"
import { cn } from "@/lib/utils"

type Lang = "en" | "pl"

const T = {
  en: {
    projectTitle: "What the team is building",
    project: [
      "Companies let people and AI agents use models, tools and company data. That is how customer data, passwords and secrets leak, and how an agent gets tricked by a planted instruction in an email.",
      "The team built the guard: a gateway that every AI request passes through. It checks each request and blocks the dangerous ones.",
    ],
    mineTitle: "What I add",
    mineLead: "The guard can look fine and still let attacks through. Nobody measures it, and nobody notices when one settings change opens a hole.",
    mineQuote: "The team built the guard. I built the system that keeps testing it, catches whoever misbehaves, shows who is dangerous before anything happens, previews every change, and fixes the holes it finds.",
    live: (s: string, a: string, f: number, i: number) => `Right now: score ${s}/100 · ${a} attacks still get through · ${f} identities could leak data · ${i} trap incidents`,
    tabsTitle: "The tabs, one line each",
    tabs: {
      "/": ["Overview", "How good is the guard right now? 73 attacks and 30 normal requests, sent every few seconds, scored 0 to 100."],
      "/safeguards": ["Safeguards", "The guard's individual protections. Switch one off and watch the score drop."],
      "/attacks": ["Attacks", "Which attacks get through, which normal requests get blocked, and whether disguised attacks are caught."],
      "/traps": ["Traps", "Fake passwords and fake customers nobody honest touches. Whoever uses one is caught, by name."],
      "/reach": ["Reach map", "Who could leak data: anyone who reads private data, reads outside content and can send data out, all at once."],
      "/whatif": ["What-if", "Try a settings change on a copy of the guard first. See the damage before it happens."],
      "/autopatch": ["Autopatch", "For each attack that gets through, the system writes a rule, proves it blocks no normal work, and applies it in one click."],
      "/playground": ["Playground", "Type any message and see whether the guard lets it through."],
    } as Record<string, [string, string]>,
    demoTitle: "Two-minute demo",
    demo: [
      ["Overview", "This is the guard's score, measured live by attacking it."],
      ["Safeguards", "Switch Secrets off: the score drops and the attacks that now pass are listed. Switch it back on."],
      ["Traps", "Press Simulate theft: an agent used a fake customer record and is named."],
      ["Reach map", "Click alice-coder: this agent could leak data. Taking away one tool fixes it."],
      ["Autopatch", "Press Apply patch: the system closed a hole itself and proved it."],
    ],
    howTitle: "How it works, technically",
    how: [
      "The guard (Shpont Shield) runs as its own server. This is a second server next to it; the guard's code is not changed.",
      "Tests go through the guard's admin playground, so they spend no budget and raise no one's risk score.",
      "Traps are added to the list of attack patterns the guard already downloads.",
      "What-if and Autopatch start a private in-memory copy of the guard with different settings and compare the results.",
      "The dashboard is React and TypeScript and reads everything live every two seconds.",
    ],
  },
  pl: {
    projectTitle: "Co buduje zespół",
    project: [
      "Firmy dają ludziom i agentom AI dostęp do modeli, narzędzi i danych. Tak wyciekają dane klientów, hasła i tajemnice, a agent daje się oszukać instrukcji podrzuconej w mailu.",
      "Zespół zbudował ochroniarza: bramkę, przez którą przechodzi każde zapytanie do AI. Sprawdza je i blokuje groźne.",
    ],
    mineTitle: "Co ja wnoszę",
    mineLead: "Ochroniarz może wyglądać dobrze, a i tak przepuszczać ataki. Nikt tego nie mierzy i nikt nie zauważa, gdy jedna zmiana ustawień otwiera dziurę.",
    mineQuote: "Zespół zbudował ochroniarza. Ja zbudowałem system, który go non stop testuje, łapie winnych, pokazuje, kto jest groźny, zanim coś się stanie, sprawdza każdą zmianę przed wdrożeniem i sam łata znalezione dziury.",
    live: (s: string, a: string, f: number, i: number) => `Teraz: ocena ${s}/100 · przechodzi ${a} ataków · ${f} tożsamości może wynieść dane · ${i} incydentów z pułapek`,
    tabsTitle: "Zakładki, po jednym zdaniu",
    tabs: {
      "/": ["Overview", "Jak dobry jest ochroniarz teraz? 73 ataki i 30 zwykłych próśb wysyłane co kilka sekund, ocena od 0 do 100."],
      "/safeguards": ["Safeguards", "Pojedyncze zabezpieczenia ochroniarza. Wyłącz jedno i patrz, jak spada ocena."],
      "/attacks": ["Attacks", "Które ataki przechodzą, które zwykłe prośby są blokowane i czy przebrane ataki są łapane."],
      "/traps": ["Traps", "Fałszywe hasła i fałszywi klienci, których nikt uczciwy nie dotknie. Kto użyje, jest złapany z nazwiska."],
      "/reach": ["Reach map", "Kto mógłby wynieść dane: ktoś, kto naraz czyta prywatne dane, czyta treści z zewnątrz i może wysyłać na zewnątrz."],
      "/whatif": ["What-if", "Zmianę ustawień najpierw sprawdzasz na kopii ochroniarza. Widzisz szkody, zanim się wydarzą."],
      "/autopatch": ["Autopatch", "Dla ataku, który przechodzi, system pisze regułę, udowadnia, że nie blokuje zwykłej pracy, i wdraża ją jednym kliknięciem."],
      "/playground": ["Playground", "Wpisz dowolną wiadomość i zobacz, czy ochroniarz ją przepuści."],
    } as Record<string, [string, string]>,
    demoTitle: "Demo na dwie minuty",
    demo: [
      ["Overview", "To ocena ochroniarza, mierzona na żywo przez atakowanie go."],
      ["Safeguards", "Wyłącz Secrets: ocena spada, widać ataki, które przechodzą. Włącz z powrotem."],
      ["Traps", "Kliknij Simulate theft: agent użył fałszywego klienta i jest wskazany z nazwy."],
      ["Reach map", "Kliknij alice-coder: ten agent mógłby wynieść dane. Zabranie jednego narzędzia to naprawia."],
      ["Autopatch", "Kliknij Apply patch: system sam załatał dziurę i to udowodnił."],
    ],
    howTitle: "Jak to działa technicznie",
    how: [
      "Ochroniarz (Shpont Shield) działa jako osobny serwer. To jest drugi serwer obok niego; kod ochroniarza nie jest zmieniany.",
      "Testy idą przez panel administracyjny ochroniarza, więc nie zużywają budżetów i nikomu nie podnoszą oceny ryzyka.",
      "Pułapki są dopisywane do listy wzorców ataków, którą ochroniarz i tak pobiera.",
      "What-if i Autopatch uruchamiają prywatną kopię ochroniarza w pamięci z innymi ustawieniami i porównują wyniki.",
      "Dashboard to React i TypeScript, czyta wszystko na żywo co dwie sekundy.",
    ],
  },
}

const ICON: Record<string, typeof BookOpen> = {
  "/": LayoutDashboard, "/safeguards": ShieldCheck, "/attacks": Swords, "/traps": Siren,
  "/reach": Network, "/whatif": GitCompareArrows, "/autopatch": Wand2, "/playground": FlaskConical,
}
const ROUTE: Record<string, string> = { Overview: "/", Safeguards: "/safeguards", Traps: "/traps", "Reach map": "/reach", Autopatch: "/autopatch" }

export function About({ state }: { state: State; stage: Stage }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem("redteam-lang") === "en" ? "en" : "pl"))
  const t = T[lang]
  const r = state.poligon.report
  const { data: reach } = useReach()
  const pick = (l: Lang) => { setLang(l); localStorage.setItem("redteam-lang", l) }
  return (
    <div className="mx-auto grid max-w-5xl gap-4">
      <div className="flex justify-end">
        <div className="flex rounded-lg border p-0.5" role="group" aria-label="Language">
          {(["en", "pl"] as const).map((l) => (
            <button key={l} onClick={() => pick(l)} aria-pressed={lang === l}
              className={cn("rounded-md px-3 py-1 text-xs font-medium text-muted-foreground uppercase", lang === l && "bg-foreground text-background")}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t.projectTitle}>
          <div className="space-y-2 text-sm leading-relaxed">{t.project.map((p) => <p key={p}>{p}</p>)}</div>
        </Panel>
        <Panel title={t.mineTitle}>
          <p className="text-sm leading-relaxed text-muted-foreground">{t.mineLead}</p>
          <blockquote className="mt-3 border-l-4 border-red-500 pl-3 text-sm leading-relaxed font-medium">{t.mineQuote}</blockquote>
          {r ? <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs tabular-nums">
            {t.live(String(r.posture), String(r.attacks.total - r.attacks.stopped), reach?.flagged.length ?? 0, state.tripwire.incidents)}
          </p> : null}
        </Panel>
      </div>

      <Panel title={t.tabsTitle}>
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(t.tabs).map(([to, [name, line]]) => {
            const Icon = ICON[to]
            return (
              <li key={to}>
                <Link to={to} className="flex h-full gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/60">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm"><b>{name}</b><span className="block text-muted-foreground">{line}</span></span>
                </Link>
              </li>
            )
          })}
        </ul>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title={t.demoTitle}>
          <ol className="space-y-2.5">
            {t.demo.map(([tab, line], i) => (
              <li key={tab} className="flex gap-3 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-semibold text-background">{i + 1}</span>
                <span><Link to={ROUTE[tab]} className="inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline">{tab}<ArrowRight className="size-3" /></Link> <span className="text-muted-foreground">{line}</span></span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel title={t.howTitle}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">{t.how.map((h) => <li key={h}>{h}</li>)}</ul>
        </Panel>
      </div>
    </div>
  )
}
