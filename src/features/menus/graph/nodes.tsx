import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { useTranslation } from "react-i18next"
import { ChevronDown, ChevronLeft, Pin, Plus, TriangleAlert } from "lucide-react"

import { useLocale } from "@/i18n/LocaleProvider"
import { LOCALE_DIR } from "@/i18n/locale"
import { dec2, money } from "@/lib/display"
import type { ServiceLineValue, StationValue } from "@/engine/schemas"
import { cn } from "@/lib/utils"

/**
 * The canvas cards.
 *
 * Every node is a fixed box whose dimensions are also handed to React Flow, so
 * nothing has to be measured and the layout can never disagree with what is
 * painted. Handles are invisible — the edges are the story, not the ports.
 *
 * Tint carries meaning and nothing else does: a card's colour is its service
 * line on the menu family, its station on the dish family, and ruby whenever
 * the number on it is wrong.
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

/**
 * One hue per service line — the axis the catalogue is actually grouped on.
 *
 * Replaces an economy/standard/premium tint, which coloured an invented field.
 * Buffet, cooked-to-order, pre-prepared, dry and station are four different
 * production chains plus a station, and that is worth a colour; a made-up
 * quality ladder was not.
 */
export const LINE_TINT: Record<ServiceLineValue, Tint> = {
  buffet: "navy",
  traditional: "amber",
  frozen: "green",
  dry: "stone",
  station: "ruby",
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

/* ── service-line grouping ──────────────────────────────────────── */

export interface LineData extends Record<string, unknown> {
  line: ServiceLineValue
  label: string
  count: number
  onAdd: () => void
}

export const LINE_W = 150
export const LINE_H = 72

/**
 * Derived grouping node — no stored entity behind it. It exists so the canvas
 * reads catalogue → service line → package, and so «إضافة» under a line
 * creates a menu already carrying it.
 */
export function LineNode({ data }: NodeProps<Node<LineData>>) {
  const { t } = useTranslation()
  const tint = LINE_TINT[data.line]
  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Card tint={tint} selected={false} width={LINE_W} height={LINE_H}>
        <div className={cn("text-[13px] font-bold", TINT_FG[tint])}>{data.label}</div>
        <div className="text-[10px] text-foreground/60">
          {t("graph.package_count", { n: data.count })}
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
  line: ServiceLineValue
  /** Meal period and package number, already resolved — both are optional. */
  subtitle: string
  dishCount: number
  /** Dishes on this package that nobody has costed yet. */
  uncosted: number
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
  const tint = LINE_TINT[data.line]
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
            <div className="mt-0.5 truncate text-[10px] text-foreground/60">{data.subtitle}</div>
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
            {t("field.cost")}{" "}
            <b className="font-semibold text-foreground">
              {/* A package whose dishes are all uncosted costs an unknown
                  amount, not zero. Printing 0.00 reads as free. */}
              {data.costPerCover === 0 && (data.uncosted > 0 || data.dishCount === 0)
                ? "—"
                : money(data.costPerCover)}
            </b>
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
          <span className="flex items-center gap-2">
            {/* An uncosted count, not a cost, is the honest headline on a
                package transcribed from a proposal: the price is missing
                because the dishes are, and saying so beats showing 0.00. */}
            {data.uncosted > 0 && (
              <span className="font-semibold text-[color:var(--brand-amber-deep)] tabular-nums">
                {t("field.uncosted")} {data.uncosted}
              </span>
            )}
            {data.errorCount > 0 && (
              <span className="flex items-center gap-1 font-semibold text-[color:var(--brand-ruby-deep)] tabular-nums">
                <TriangleAlert className="size-3" />
                {data.errorCount}
              </span>
            )}
          </span>
        </div>

        <AddButton visible={data.selected} title={t("action.add_dish")} onClick={data.onAdd} />
      </Card>
      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </>
  )
}

/* ── course (قسم) ───────────────────────────────────────────────── */

export interface CourseData extends Record<string, unknown> {
  label: string
  dishCount: number
  uncosted: number
  /** What this whole section contributes to one cover. */
  costPerCover: number
  /** Its share of the package's raw plate cost, 0–100. */
  sharePct: number
  expanded: boolean
  selected: boolean
  pinned: boolean
  onToggle: () => void
  onAdd: () => void
}

export const COURSE_W = 200
export const COURSE_H = 92

/**
 * A buffet section — «المقبلات الباردة», «الأطباق الرئيسية».
 *
 * This rank exists to keep the canvas usable. A transcribed package carries up
 * to 81 dishes; hanging them off the package put 81 cards on screen at once.
 * Five section cards say the same thing — and say it better, because "this
 * package is 28 cold appetisers and 20 mains" is the shape you actually want
 * to see, and a wall of dish names hides it.
 */
export function CourseNode({ data }: NodeProps<Node<CourseData>>) {
  const { t } = useTranslation()
  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Card
        tint="stone"
        variant="gradient"
        selected={data.selected}
        width={COURSE_W}
        height={COURSE_H}
      >
        <PinnedMark pinned={data.pinned} />

        <div className="truncate text-[12px] leading-tight font-bold text-foreground">
          {data.label}
        </div>

        <div className="flex items-baseline justify-between text-[11px] tabular-nums">
          <span className="text-foreground/70">
            {t("graph.dish_count", { n: data.dishCount })}
          </span>
          {data.uncosted > 0 ? (
            <span className="font-semibold text-[color:var(--brand-amber-deep)]">
              {t("field.uncosted")} {data.uncosted}
            </span>
          ) : (
            <b className="font-semibold text-foreground">{money(data.costPerCover)}</b>
          )}
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/70">
          <div
            className={cn("h-full transition-all duration-300", TINT_BAR.stone)}
            style={{ width: `${Math.min(100, data.sharePct)}%` }}
          />
        </div>

        <button
          type="button"
          // `nodrag nopan`: this is the accordion, not a handle for the card.
          className="nodrag nopan mt-auto flex items-center gap-1 self-start rounded px-1 py-0.5 text-[10px] text-foreground/70 hover:bg-white/60"
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
          {data.expanded ? t("graph.collapse") : t("graph.expand")}
        </button>

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
  /** Its share of its section's cost, 0–100. */
  sharePct: number
  /** No bill of materials yet — a name transcribed from a package. */
  uncosted: boolean
  selected: boolean
  pinned: boolean
  invalid: boolean
}

export const DISH_W = 196
export const DISH_H = 40

/**
 * A dish, as a chip.
 *
 * Deliberately a fraction of the other cards. A section can hold 28 dishes, and
 * at the 216×104 card the rest of the family uses that was a 3,000px column of
 * mostly whitespace — unreadable at fit-view zoom and exhausting to pan. What a
 * dish actually needs to say in a tree is its name, what it costs, and how big
 * a slice of the section that is; everything else (station, portions) belongs
 * on the form, which is one click away.
 *
 * Not built on `Card`: the shared chrome carries padding and a gap sized for a
 * card, and fighting it with overrides would be worse than a purpose-built row.
 */
export function DishNode({ data }: NodeProps<Node<DishData>>) {
  const tint = STATION_TINT[data.station]
  const locale = useLocale()

  return (
    <>
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <div
        dir={LOCALE_DIR[locale]}
        style={{ width: DISH_W, height: DISH_H }}
        title={`${data.name} · ${data.stationLabel} · ${dec2(data.portionsPerCover)}`}
        className={cn(
          "group relative flex items-center gap-2 overflow-hidden rounded-lg border bg-surface-raised ps-2 pe-2.5 shadow-sm transition-shadow hover:shadow-md",
          "border-surface-line",
          data.selected &&
            "ring-2 ring-[color:var(--brand-navy)] ring-offset-2 ring-offset-background",
          data.invalid && "border-[color:var(--brand-ruby)]",
        )}
      >
        <PinnedMark pinned={data.pinned} />

        {/* Station as a colour stripe rather than a line of text — it is a
            category, and a category only needs to be distinguishable. */}
        <span
          aria-label={data.stationLabel}
          className={cn("h-5 w-1 shrink-0 rounded-full", TINT_BAR[tint])}
        />

        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
          {data.name}
        </span>

        {data.uncosted ? (
          <span className="shrink-0 rounded bg-[color:var(--brand-amber-soft)] px-1 text-[9px] font-bold text-[color:var(--brand-amber-deep)]">
            —
          </span>
        ) : (
          <span className={cn("shrink-0 text-[11px] font-semibold tabular-nums", TINT_FG[tint])}>
            {money(data.costPerCover)}
          </span>
        )}

        {/* Share of the section, as a hairline along the bottom edge: visible
            as a length without spending a row on it. */}
        <span
          aria-hidden
          className={cn("absolute inset-x-0 bottom-0 h-[3px]", TINT_BAR[tint], "opacity-70")}
          style={{ width: `${Math.min(100, data.sharePct)}%` }}
        />
      </div>
    </>
  )
}

export const nodeTypes = {
  catalogue: CatalogueNode,
  line: LineNode,
  menu: MenuNode,
  course: CourseNode,
  dish: DishNode,
} as const
