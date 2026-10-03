import { AlertTriangle } from "lucide-react"
import { Route, Routes } from "react-router-dom"

import { AppShell } from "@/components/AppShell"
import { Skeleton } from "@/components/ui/skeleton"
import { useLive } from "@/lib/api"
import { About } from "@/pages/About"
import { Attacks } from "@/pages/Attacks"
import { Autopatch } from "@/pages/Autopatch"
import { Overview } from "@/pages/Overview"
import { Playground } from "@/pages/Playground"
import { Reach } from "@/pages/Reach"
import { Safeguards } from "@/pages/Safeguards"
import { Traps } from "@/pages/Traps"
import { WhatIf } from "@/pages/WhatIf"

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-700 dark:text-red-400"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{children}</span></div>
}

export default function App() {
  const { data, isLoading, error } = useLive()
  const state = data?.state, stage = data?.stage
  return (
    <AppShell state={state} stage={stage}>
      {error ? <Notice>The Redteam service is not answering ({error.message}). Start it with <code>demo/up.sh</code>.</Notice> : null}
      {state?.target.error || state?.poligon.error ? <Notice>Shield is unreachable: {state.target.error || state.poligon.error}. The numbers below are from the last successful run.</Notice> : null}
      {state?.target.policy?.last_error ? <Notice>Shield rejected the last policy edit and kept the previous one: {state.target.policy.last_error}</Notice> : null}
      {isLoading || !state || !stage ? (
        error ? null : <div className="grid grid-cols-12 gap-4"><Skeleton className="col-span-12 h-24" /><Skeleton className="col-span-4 h-80" /><Skeleton className="col-span-8 h-80" /></div>
      ) : (
        <Routes>
          <Route path="/about" element={<About state={state} stage={stage} />} />
          <Route path="/" element={<Overview state={state} stage={stage} />} />
          <Route path="/safeguards" element={<Safeguards state={state} stage={stage} />} />
          <Route path="/attacks" element={<Attacks state={state} stage={stage} />} />
          <Route path="/traps" element={<Traps state={state} stage={stage} />} />
          <Route path="/playground" element={<Playground />} />
          <Route path="/reach" element={<Reach />} />
          <Route path="/whatif" element={<WhatIf stage={stage} />} />
          <Route path="/autopatch" element={<Autopatch state={state} />} />
        </Routes>
      )}
    </AppShell>
  )
}
