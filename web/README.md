# Redteam dashboard (web)

React 19, TypeScript, Vite, Tailwind CSS 4, shadcn/ui components (Base UI), Recharts, TanStack Query.

```bash
npm install
npm run dev      # http://localhost:5173/app/ , proxies /api to the Redteam service on :8799
npm run build    # type-checks, then writes the bundle to ../shield_redteam/server/static/app
npm run lint
```

The built bundle is committed, so `shield-redteam serve` shows the dashboard with no Node at runtime. After changing anything under `src/`, run `npm run build` and commit the result.

| Path | What |
|---|---|
| `src/lib/api.ts` | types for `/api/state` and `/api/stage`, the 2-second live query, the three actions (switch, steal, re-test) |
| `src/components/AppShell.tsx` | sidebar, header, theme toggle |
| `src/components/Pipeline.tsx` | the pipeline drawing: two lanes that narrow at every stage by what it caught, with the safeguards under each stage |
| `src/pages/*` | Overview, Safeguards, Attacks, Traps, Playground |
| `src/components/ui/*` | shadcn/ui components, generated with `npx shadcn add` |
