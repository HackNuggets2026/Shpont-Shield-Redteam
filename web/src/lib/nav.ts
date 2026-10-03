import type { ComponentType } from "react"

import { BellRing } from "@/components/animate-ui/icons/bell-ring"
import { Blend } from "@/components/animate-ui/icons/blend"
import { CircuitBoard } from "@/components/animate-ui/icons/circuit-board"
import { Fingerprint } from "@/components/animate-ui/icons/fingerprint"
import { Gavel } from "@/components/animate-ui/icons/gavel"
import { LayoutDashboard } from "@/components/animate-ui/icons/layout-dashboard"
import { Lightbulb } from "@/components/animate-ui/icons/lightbulb"
import { MessageSquareWarning } from "@/components/animate-ui/icons/message-square-warning"
import { Route } from "@/components/animate-ui/icons/route"
import { SlidersHorizontal } from "@/components/animate-ui/icons/sliders-horizontal"
import { Sparkles } from "@/components/animate-ui/icons/sparkles"
import { Terminal } from "@/components/animate-ui/icons/terminal"

export type AnimatedIcon = ComponentType<{ className?: string; animate?: boolean; animateOnHover?: boolean }>
export interface Item { to: string; label: string; icon: AnimatedIcon; sub: string }

export const GROUPS: { label?: string; items: Item[] }[] = [
  {
    items: [
      { to: "/about", label: "Start here", icon: Lightbulb, sub: "What this project is and what I add, in two minutes" },
      { to: "/", label: "Overview", icon: LayoutDashboard, sub: "Is the AI firewall holding, right now?" },
    ],
  },
  {
    label: "Find holes",
    items: [
      { to: "/attacks", label: "Attacks", icon: MessageSquareWarning, sub: "What gets through, and how attackers disguise it" },
      { to: "/safeguards", label: "Safeguards", icon: SlidersHorizontal, sub: "Switch a protection off and see what it was stopping" },
      { to: "/playground", label: "Playground", icon: Terminal, sub: "Send your own message through the firewall" },
      { to: "/referee", label: "Referee", icon: Gavel, sub: "The same test against every control layer the team built" },
    ],
  },
  {
    label: "Catch leaks",
    items: [
      { to: "/traps", label: "Traps", icon: BellRing, sub: "Fake secrets that expose whoever uses them" },
      { to: "/trail", label: "Data trail", icon: Fingerprint, sub: "Values agents read, followed to where they try to go" },
      { to: "/memory", label: "Memory guard", icon: CircuitBoard, sub: "What agents remember, where it came from, and what is held back" },
      { to: "/reach", label: "Reach map", icon: Route, sub: "Who could move private data out if one instruction were planted" },
    ],
  },
  {
    label: "Fix",
    items: [
      { to: "/whatif", label: "What-if", icon: Blend, sub: "Preview a settings change before it reaches the live firewall" },
      { to: "/autopatch", label: "Autopatch", icon: Sparkles, sub: "Rules written from attacks that got through, proven before they are offered" },
    ],
  },
]
export const FLAT = GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))
