import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronLeft, Pin, Plus, TriangleAlert } from "lucide-react"

import { useLocale } from "@/i18n/LocaleProvider"
import { LOCALE_DIR } from "@/i18n/locale"
import { dec2, money } from "@/lib/display"
import type { MenuTierValue, StationValue } from "@/engine/schemas"
import { cn } from "@/lib/utils"

/**
 * The canvas cards.
 *
 * Every node is a fixed box whose dimensions are also handed to React Flow, so
 * nothing has to be measured and the layout can never disagree with what is
 * painted. Handles are invisible — the edges are the story, not the ports.
 *
 * Tint carries meaning and nothing else does: a card's colour is its tier on
 * the menu family, its station on the dish family, and ruby whenever the
 * number on it is wrong.
 */

export type Tint = "navy" | "green" | "amber" | "ruby" | "stone"

const TINT_BG: Record<Tint, string> = {
  navy: "bg-[color:var(--brand-navy-soft)] border-[color:color-mix(in_srgb,var(--brand-navy)_35%,transparent)]",
  green:
    "bg-[color:var(--brand-green-soft)] border-[color:color-mix(in_srgb,var(--brand-green)_35%,transparent)]",
  amber:
    "bg-[color:var(--brand-amber-soft)] border-[color:color-mix(in_srgb,var(--brand-amber)_40%,transparent)]",
  ruby: "bg-[color:var(--brand-ruby-soft)] border-[color:color-mix(in_srgb,var(--brand-ruby)_35%,transparent)]",
  stone:
    "bg-[color:var(--brand-stone-soft)] border-[color:color-mix(in_srgb,var(--brand-stone)_30%,transparent)]",
}
const TINT_FG: Record<Tint, string> = {
  navy: "text-[color:var(--brand-navy-deep)]",
  green: "text-[color:var(--brand-green-deep)]",
  amber: "text-[color:var(--brand-amber-deep)]",
  ruby: "text-[color:var(--brand-ruby-deep)]",
  stone: "text-[color:var(--brand-stone-deep)]",
}
const TINT_BAR: Record<Tint, string> = {
  navy: "bg-[color:var(--brand-navy)]",
  green: "bg-[color:var(--brand-green)]",
  amber: "bg-[color:var(--brand-amber)]",
  ruby: "bg-[color:var(--brand-ruby)]",
  stone: "bg-[color:var(--brand-stone)]",
}
/** Dishes get a gradient so they read apart from the flat menu cards. */
const TINT_GRADIENT: Record<Tint, string> = {
  navy: "bg-gradient-to-b from-[color:var(--brand-navy-soft)] to-white border-[color:color-mix(in_srgb,var(--brand-navy)_55%,transparent)]",
  green:
    "bg-gradient-to-b from-[color:var(--brand-green-soft)] to-white border-[color:color-mix(in_srgb,var(--brand-green)_55%,transparent)]",
  amber:
    "bg-gradient-to-b from-[color:var(--brand-amber-soft)] to-white border-[color:color-mix(in_srgb,var(--brand-amber)_60%,transparent)]",
  ruby: "bg-gradient-to-b from-[color:var(--brand-ruby-soft)] to-white border-[color:color-mix(in_srgb,var(--brand-ruby)_55%,transparent)]",
  stone:
    "bg-gradient-to-b from-[color:var(--brand-stone-soft)] to-white border-[color:color-mix(in_srgb,var(--brand-stone)_50%,transparent)]",
}

export const TIER_TINT: Record<MenuTierValue, Tint> = {
  premium: "amber",
  standard: "navy",
  economy: "stone",
}

export const STATION_TINT: Record<StationValue, Tint> = {
  hot: "ruby",
  cold: "navy",
  bakery: "amber",
  beverage: "green",
  assembly: "stone",
}

/* ── shared chrome ──────────────────────────────────────────────── */

/**
 * The floating (+). Sits half over the card's end edge so it reads as "grow the
 * tree from here".
 *
 * Visibility is pure CSS (`group-hover`), never React state: routing hover
 * through state would re-render every node and re-run the layout on each
 * mouse-over, which reads as a flicker across the whole canvas.
 */
function AddButton({
  visible,
  title,
  onClick,
}: {
  visible: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cn(
        // `nodrag nopan` keeps a click here from starting a node drag or a pan.
        "nodrag nopan absolute top-1/2 -right-3.5 z-10 -translate-y-1/2",
        "grid size-7 place-items-center rounded-full border shadow-sm",
        "cursor-pointer border-[color:var(--brand-navy)] bg-card text-[color:var(--brand-navy-deep)]",
        "transition-[opacity,transform,background-color,color] duration-150",
        "hover:bg-[color:var(--brand-navy)] hover:text-white",
        visible
          ? "scale-100 opacity-100"
          : "pointer-events-none scale-75 opacity-0 group-hover:pointer-events-auto group-hover:scale-100 group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:scale-100 focus-visible:opacity-100",
      )}
    >
      <Plus className="size-4" strokeWidth={2.5} />
    </button>
  )
}

function PinnedMark({ pinned }: { pinned: boolean }) {
  const { t } = useTranslation()
  if (!pinned) return null
  return (
    <span
      title={t("graph.pinned_hint")}
      className="absolute -top-2 -start-2 grid size-5 place-items-center rounded-full border border-border bg-card shadow-sm"
    >
      <Pin className="size-3 text-muted-foreground" />
    </span>
  )
}

function Card({
  tint,
  selected,
  invalid,
  width,
  height,
  variant = "flat",
  children,
}: {
  tint: Tint
  selected: boolean
  invalid?: boolean
  width: number
  height: number
  variant?: "flat" | "gradient"
  children: React.ReactNode
}) {
  // The canvas itself never flips — React Flow's transform math needs LTR —
  // but the text inside a card must read in the interface language.
  const locale = useLocale()
  return (
    <div
      dir={LOCALE_DIR[locale]}
      style={{ width, height }}
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-xl px-3 py-2.5 shadow-sm",
        "transition-shadow hover:shadow-md",
        variant === "flat" ? cn("border-2", TINT_BG[tint]) : cn("border", TINT_GRADIENT[tint]),
        selected &&
          "shadow-lg ring-2 ring-[color:var(--brand-navy)] ring-offset-2 ring-offset-background",
        invalid && "border-[color:var(--brand-ruby)]",
      )}
    >
      {children}
    </div>
  )
}

/* ── catalogue root ─────────────────────────────────────────────── */

export interface CatalogueData extends Record<string, unknown> {
  menuCount: number
  /** Menus whose food cost sits above the target. */
  overTarget: number
  /** Weighted mean food cost across priced menus, or null if none are priced. */
  avgFoodCostPct: number | null
  targetPct: number
  selected: boolean
  onAdd: () => void
}

export const ROOT_W = 300
export const ROOT_H = 132

export function CatalogueNode({ data }: NodeProps<Node<CatalogueData>>) {
  const { t } = useTranslation()
  const { menuCount, overTarget, avgFoodCostPct, targetPct } = data
  const over = avgFoodCostPct !== null && avgFoodCostPct > targetPct
  // The bar reads as "how much of the target is used up" — the same shape as
  // a budget, which is what a food-cost target is.
  const pct = avgFoodCostPct === null ? 0 : Math.min(100, (avgFoodCostPct / targetPct) * 100)

  return (
    <>
      <Card tint="navy" selected={data.selected} invalid={over} width={ROOT_W} height={ROOT_H}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[10px] font-semibold tracking-wider text-foreground/70 uppercase">
              {t("policy.target_food_cost_pct")}
            </div>
            <div className="mt-0.5 text-base leading-tight font-bold text-foreground">
              {t("nav.menus")}
            </div>
          </div>
          <div className="text-end">
            <div className={cn("text-lg font-bold tabular-nums", TINT_FG.navy)}>
              {dec2(targetPct)}%
            </div>
            <div className="text-[10px] text-foreground/60">{t("field.food_cost_pct")}</div>
          </div>
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-white/70">
          <div
            className={cn("h-full transition-all duration-300", over ? TINT_BAR.ruby : TINT_BAR.navy)}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] tabular-nums">
          <span className="text-foreground/70">
            {t("graph.avg_food_cost")}{" "}
            <b className="font-semibold text-foreground">
              {avgFoodCostPct === null ? "—" : `${dec2(avgFoodCostPct)}%`}
            </b>
          </span>
          {overTarget > 0 && (
            <span className="font-semibold text-[color:var(--brand-ruby-deep)]">
              {t("graph.over_target", { n: overTarget })}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/60 pt-1.5 text-[10px] text-foreground/60">
          <span>{t("graph.menu_count", { n: menuCount })}</span>
        </div>

        <AddButton visible={data.selected} title={t("action.add_menu")} onClick={data.onAdd} />
      </Card>
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </>
  )
}

/* ── tier grouping ──────────────────────────────────────────────── */

export interface TierData extends Record<string, unknown> {
  tier: MenuTierValue
  label: string
  count: number
  onAdd: () => void
}

export const TIER_W = 150
export const TIER_H = 72

/**
 * Derived grouping node — no stored entity behind it. It exists so the canvas
 * reads catalogue → tier → menu, and so «إضافة» under a tier creates a menu
 * already carrying that tier.
 */
export function TierNode({ data }: NodeProps<Node<TierData>>) {
  const { t } = useTranslation()
  const tint = TIER_TINT[data.tier]
  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Card tint={tint} selected={false} width={TIER_W} height={TIER_H}>
        <div className={cn("text-[13px] font-bold", TINT_FG[tint])}>{data.label}</div>
        <div className="text-[10px] text-foreground/60">
          {t("graph.menu_count", { n: data.count })}
        </div>
        <AddButton visible={false} title={t("action.add_menu")} onClick={data.onAdd} />
      </Card>
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </>
  )
}

/* ── menu ───────────────────────────────────────────────────────── */

export interface MenuNodeData extends Record<string, unknown> {
  name: string
  tier: MenuTierValue
  mealLabel: string
  dishCount: number
  costPerCover: number
  pricePerCover: number | null
  foodCostPct: number | null
  targetPct: number
  selected: boolean
  pinned: boolean
  invalid: boolean
  errorCount: number
  expanded: boolean
  onToggle: () => void
  onAdd: () => void
}

export const MENU_W = 268
export const MENU_H = 112

export function MenuNode({ data }: NodeProps<Node<MenuNodeData>>) {
  const { t } = useTranslation()
  const tint = TIER_TINT[data.tier]
  const over = data.foodCostPct !== null && data.foodCostPct > data.targetPct + 2
  const pctTint: Tint = data.foodCostPct === null ? "stone" : over ? "ruby" : "green"

  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Card
        tint={tint}
        selected={data.selected}
        invalid={data.invalid}
        width={MENU_W}
        height={MENU_H}
      >
        <PinnedMark pinned={data.pinned} />

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[13px] leading-tight font-bold text-foreground">
              {data.name}
            </div>
            <div className="mt-0.5 text-[10px] text-foreground/60">{data.mealLabel}</div>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
              TINT_BG[pctTint],
              TINT_FG[pctTint],
            )}
          >
            {data.foodCostPct === null ? "—" : `${dec2(data.foodCostPct)}%`}
          </span>
        </div>

        <div className="flex items-baseline justify-between text-[11px] tabular-nums">
          <span className="text-foreground/70">
            {t("field.cost")} <b className="font-semibold text-foreground">{money(data.costPerCover)}</b>
          </span>
          <span className="text-foreground/70">
            {t("field.price")}{" "}
            <b className="font-semibold text-foreground">
              {data.pricePerCover === null ? "—" : money(data.pricePerCover)}
            </b>
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-white/60 pt-1.5 text-[10px]">
          <button
            type="button"
            // `nodrag nopan`: this is the accordion, not a handle for the card.
            className="nodrag nopan flex items-center gap-1 rounded px-1 py-0.5 text-foreground/70 hover:bg-white/60"
            onClick={(e) => {
              e.stopPropagation()
              data.onToggle()
            }}
          >
            {data.expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronLeft className="size-3 rtl:rotate-180" />
            )}
            {t("graph.dish_count", { n: data.dishCount })}
          </button>
          {data.errorCount > 0 && (
            <span className="flex items-center gap-1 font-semibold text-[color:var(--brand-ruby-deep)] tabular-nums">
              <TriangleAlert className="size-3" />
              {data.errorCount}
            </span>
          )}
        </div>

        <AddButton visible={data.selected} title={t("action.add_dish")} onClick={data.onAdd} />
      </Card>
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </>
  )
}

/* ── dish ───────────────────────────────────────────────────────── */

export interface DishData extends Record<string, unknown> {
  name: string
  station: StationValue
  stationLabel: string
  portionsPerCover: number
  /** What this dish contributes to one cover. */
  costPerCover: number
  /** Its share of the menu's raw plate cost, 0–100. */
  sharePct: number
  selected: boolean
  pinned: boolean
  invalid: boolean
}

export const DISH_W = 216
export const DISH_H = 104

export function DishNode({ data }: NodeProps<Node<DishData>>) {
  const { t } = useTranslation()
  const tint = STATION_TINT[data.station]

  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Card
        tint={tint}
        variant="gradient"
        selected={data.selected}
        invalid={data.invalid}
        width={DISH_W}
        height={DISH_H}
      >
        <PinnedMark pinned={data.pinned} />

        <div className="truncate text-[12px] leading-tight font-bold text-foreground">
          {data.name}
        </div>
        <div className="text-[10px] text-foreground/60">{data.stationLabel}</div>

        <div className="flex items-baseline justify-between text-[11px] tabular-nums">
          <span className="text-foreground/70">
            {dec2(data.portionsPerCover)} {t("unit.portion")}
          </span>
          <b className={cn("font-semibold", TINT_FG[tint])}>{money(data.costPerCover)}</b>
        </div>

        {/* Share of the plate cost — what makes an expensive dish obvious
            without reading four numbers and doing the division. */}
        <div className="mt-auto h-1.5 w-full overflow-hidden rounded-full bg-white/70">
          <div
            className={cn("h-full transition-all duration-300", TINT_BAR[tint])}
            style={{ width: `${Math.min(100, data.sharePct)}%` }}
          />
        </div>
      </Card>
    </>
  )
}

export const nodeTypes = {
  catalogue: CatalogueNode,
  tier: TierNode,
  menu: MenuNode,
  dish: DishNode,
} as const
