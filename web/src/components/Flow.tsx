import { useMemo } from "react"
import { ResponsiveContainer, Sankey, Tooltip } from "recharts"

import type { Stage } from "@/lib/api"
import { segLabel } from "@/lib/format"

const GOOD = "#10b981", BAD = "#ef4444", WARN = "#f59e0b", BLUE = "#3b82f6"

interface NodeDatum { name: string; color: string; seg?: string }
interface LinkDatum { source: number; target: number; value: number; color: string }

/** Where every test message goes: source, the safeguard that caught it (or none), outcome. */
function build(stage: Stage) {
  const nodes: NodeDatum[] = [], links: LinkDatum[] = []
  const at = (name: string, color: string, seg?: string) => {
    let i = nodes.findIndex((n) => n.name === name)
    if (i < 0) { nodes.push({ name, color, seg }); i = nodes.length - 1 }
    return i
  }
  const aStop: Record<string, number> = {}, nStop: Record<string, number> = {}
  let aPass = 0, nPass = 0
  for (const o of stage.outcomes) {
    if (o.rewrite) continue
    if (o.stopped) (o.attack ? aStop : nStop)[o.seg] = ((o.attack ? aStop : nStop)[o.seg] ?? 0) + 1
    else if (o.attack) aPass++
    else nPass++
  }
  const attacks = at("Attacks", BAD), normal = at("Normal requests", BLUE)
  for (const s of stage.rings.flatMap((r) => r.segments)) {
    if (!aStop[s.id] && !nStop[s.id]) continue
    const mid = at(segLabel(stage.rings, s.id), "#52525b", s.id)
    if (aStop[s.id]) { links.push({ source: attacks, target: mid, value: aStop[s.id], color: GOOD }); links.push({ source: mid, target: at("Attack stopped", GOOD), value: aStop[s.id], color: GOOD }) }
    if (nStop[s.id]) { links.push({ source: normal, target: mid, value: nStop[s.id], color: WARN }); links.push({ source: mid, target: at("Blocked by mistake", WARN), value: nStop[s.id], color: WARN }) }
  }
  if (aPass) { const mid = at("No safeguard reacted", BAD); links.push({ source: attacks, target: mid, value: aPass, color: BAD }); links.push({ source: mid, target: at("Attack got through", BAD), value: aPass, color: BAD }) }
  if (nPass) { const mid = at("Allowed", BLUE); links.push({ source: normal, target: mid, value: nPass, color: BLUE }); links.push({ source: mid, target: at("Delivered", BLUE), value: nPass, color: BLUE }) }
  return { nodes, links }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Node({ x, y, width, height, payload, onPick }: any) {
  const right = payload.depth === 2
  const clickable = !!payload.seg
  return (
    <g onClick={clickable ? () => onPick(payload.seg, payload.name) : undefined} style={{ cursor: clickable ? "pointer" : "default" }}>
      <rect x={x} y={y} width={width} height={Math.max(height, 2)} rx={3} fill={payload.color} />
      <text x={right ? x - 8 : x + width + 8} y={y + height / 2} textAnchor={right ? "end" : "start"} dominantBaseline="middle" className="fill-foreground" style={{ font: "500 12px var(--font-sans)" }}>
        {payload.name} <tspan className="fill-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>{payload.value}</tspan>
      </text>
    </g>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Link({ sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload }: any) {
  return (
    <path d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none" stroke={payload.color} strokeWidth={Math.max(linkWidth, 1)} strokeOpacity={0.28} />
  )
}

export function Flow({ stage, onPick }: { stage: Stage; onPick: (seg: string, name: string) => void }) {
  const data = useMemo(() => build(stage), [stage])
  if (!data.links.length) return null
  return (
    <ResponsiveContainer width="100%" height={340}>
      <Sankey data={data} nodeWidth={10} nodePadding={14} iterations={0} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        node={<Node onPick={onPick} />} link={<Link />}>
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, background: "var(--popover)", border: "1px solid var(--border)", color: "var(--popover-foreground)" }} />
      </Sankey>
    </ResponsiveContainer>
  )
}
