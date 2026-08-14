import { explodeRecipe, apQtyFor, epUnitCost, menuCost, type Catalog } from "./costing.js"
import {
  STAFF_RATIOS,
  type Ingredient,
  type Policy,
  type ServiceOrder,
  type ServiceStyleValue,
  type StationValue,
} from "./schemas.js"

/**
 * The operations engine: what to bill, what to cook, what to buy, who to roster.
 *
 * Everything here derives from one distinction that the schema makes explicit
 * and most spreadsheets blur — the *guarantee* is not the *forecast* and
 * neither is the *head count*:
 *
 *   expected   what the client thinks, at quoting time. Plans nothing on its own.
 *   guaranteed what the client has committed to by the cutoff. Billing floor,
 *              and the number the kitchen buys against.
 *   actual     who turned up. Bills above the guarantee, never below it.
 *
 * Production sits above all three, at the guarantee plus an overset, so late
 * arrivals eat without the client being charged for food nobody asked for.
 *
 * Pure module — orders and a catalog in, plans out.
 */

/* ── covers ─────────────────────────────────────────────────────── */

/**
 * The number the invoice uses.
 *
 * The industry convention is asymmetric and deliberately so: the guarantee is
 * a floor, not an estimate. Under-attendance still bills the guarantee (the
 * food was bought); over-attendance bills what was served (it was eaten). A
 * mean or a plain `actual` would hand the downside to the caterer both ways.
 */
export function billableCovers(order: ServiceOrder): number {
  const floor = order.guaranteed_covers ?? order.expected_covers
  return Math.max(floor, order.actual_covers ?? 0)
}

/** The base the kitchen plans from — the guarantee once given, the forecast before. */
export const planningCovers = (order: ServiceOrder): number =>
  order.guaranteed_covers ?? order.expected_covers

/**
 * What the kitchen actually produces: the guarantee plus the overset.
 *
 * Convention is to set ~5% over and bill it only if consumed. Modelled as
 * policy rather than a constant because a mass-feeding contract with a fixed
 * quota may run it at 0 and a VIP function at 10.
 */
export function productionCovers(order: ServiceOrder, policy: Policy): number {
  return Math.ceil(planningCovers(order) * (1 + policy.overset_pct / 100))
}

/** Covers produced but not billed — the cost of the overset, per order. */
export const oversetCovers = (order: ServiceOrder, policy: Policy): number =>
  Math.max(0, productionCovers(order, policy) - billableCovers(order))

/* ── the guarantee cutoff ───────────────────────────────────────── */

/** `serves_on` + `serves_at` as one instant. Null if either is unparseable. */
export function serviceInstant(order: ServiceOrder): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(order.serves_on)
  if (!d) return null
  const t = /^(\d{1,2}):(\d{2})/.exec(order.serves_at)
  return new Date(
    Date.UTC(+d[1], +d[2] - 1, +d[3], t ? +t[1] : 12, t ? +t[2] : 0),
  )
}

/**
 * The moment the client's guarantee is due — service time minus the lead.
 *
 * The lead is what the kitchen needs to shop and prep, so it is an operating
 * parameter, not a courtesy: 48–72 hours where a hotel banquet desk draws on
 * standing supply, 5–7 days for an operation that buys per event.
 */
export function guaranteeDeadline(order: ServiceOrder, policy: Policy): Date | null {
  const at = serviceInstant(order)
  if (!at) return null
  return new Date(at.getTime() - policy.guarantee_lead_hours * 3_600_000)
}

export type GuaranteeState = "not_required" | "locked" | "open" | "due_soon" | "overdue"

/**
 * Where an order sits against its cutoff.
 *
 * `due_soon` fires inside the last quarter of the lead window — enough runway
 * to chase the client, close enough that it is worth interrupting someone for.
 */
export function guaranteeState(order: ServiceOrder, policy: Policy, now: Date): GuaranteeState {
  if (order.status === "cancelled" || order.status === "closed") return "not_required"
  if (order.guaranteed_covers !== null) return "locked"
  const due = guaranteeDeadline(order, policy)
  if (!due) return "open"
  const msLeft = due.getTime() - now.getTime()
  if (msLeft <= 0) return "overdue"
  if (msLeft <= policy.guarantee_lead_hours * 3_600_000 * 0.25) return "due_soon"
  return "open"
}

/* ── per-order economics ────────────────────────────────────────── */

export interface OrderEconomics {
  billable: number
  production: number
  /** Net of VAT — what the contract earns on this service. */
  revenue: number
  /** Cost of everything produced, including the overset that is not billed. */
  foodCost: number
  margin: number
  /** `foodCost / revenue`, as a percentage. Null when nothing is priced. */
  foodCostPct: number | null
}

export function orderEconomics(
  order: ServiceOrder,
  catalog: Catalog,
): OrderEconomics {
  const billable = billableCovers(order)
  const production = productionCovers(order, catalog.policy)
  if (!order.menu) {
    return { billable, production, revenue: 0, foodCost: 0, margin: 0, foodCostPct: null }
  }
  const cost = menuCost(order.menu, catalog)
  const revenue = (cost.pricePerCover ?? 0) * billable
  // Costed on production, not on billing: the overset is real food, and an
  // operation that costs on billable covers reports a margin it never earned.
  const foodCost = cost.perCover * production
  return {
    billable,
    production,
    revenue,
    foodCost,
    margin: revenue - foodCost,
    foodCostPct: revenue > 0 ? (foodCost / revenue) * 100 : null,
  }
}

/* ── staffing ───────────────────────────────────────────────────── */

export interface StaffPlan {
  servers: number
  bussers: number
  /**
   * Kitchen heads, from the prep minutes the production plan needs rather than
   * from a cover ratio — a 400-cover buffet of three dishes is not the same
   * kitchen load as 400 covers of twelve.
   */
  kitchen: number
  total: number
}

/**
 * Front-of-house from the service-style ratio, kitchen from the prep load.
 *
 * Ratios live in `STAFF_RATIOS` (schemas.ts) so the numbers a client
 * negotiates over sit next to the enum they belong to.
 */
export function staffPlan(
  style: ServiceStyleValue,
  covers: number,
  prepMinutes: number,
  /** Productive minutes one kitchen head contributes to this service. */
  shiftMinutes = 420,
): StaffPlan {
  const ratio = STAFF_RATIOS[style]
  const servers = covers > 0 ? Math.ceil(covers / ratio.covers_per_server) : 0
  const bussers =
    ratio.covers_per_busser > 0 && covers > 0 ? Math.ceil(covers / ratio.covers_per_busser) : 0
  const kitchen = prepMinutes > 0 ? Math.max(1, Math.ceil(prepMinutes / shiftMinutes)) : 0
  return { servers, bussers, kitchen, total: servers + bussers + kitchen }
}

/* ── production plan ────────────────────────────────────────────── */

export interface ProductionLine {
  recipeId: string
  station: StationValue
  /** Portions the day needs, across every order. */
  portions: number
  /** Whole batches to cook. */
  batches: number
  prepMinutes: number
  /**
   * Whether the dish can be made ahead. Anything whose shelf life is shorter
   * than the run-up has to be produced on the day, which is what turns a
   * production plan into a schedule instead of a list.
   */
  sameDayOnly: boolean
}

export interface ProductionPlan {
  date: string
  orders: ServiceOrder[]
  covers: number
  lines: ProductionLine[]
  /** ingredient id → edible-portion quantity in base units. */
  requirements: Map<string, number>
  prepMinutes: number
}

/**
 * Everything one service date has to produce, aggregated across its orders.
 *
 * Aggregation is the whole point: three orders each needing 40 portions of the
 * same rice is one 120-portion production run, and planning them separately is
 * how a kitchen ends up with three part-batches and a shortfall.
 */
export function productionPlan(
  date: string,
  orders: ServiceOrder[],
  catalog: Catalog,
): ProductionPlan {
  const forDate = orders.filter(
    (o) => o.serves_on.slice(0, 10) === date && o.status !== "cancelled",
  )
  const portionsByRecipe = new Map<string, number>()
  const requirements = new Map<string, number>()
  let covers = 0

  for (const order of forDate) {
    const produce = productionCovers(order, catalog.policy)
    covers += produce
    const menu = order.menu ? catalog.menus.get(order.menu) : undefined
    if (!menu) continue
    for (const item of menu.items) {
      const portions = item.portions_per_cover * produce
      portionsByRecipe.set(item.recipe, (portionsByRecipe.get(item.recipe) ?? 0) + portions)
    }
  }

  const lines: ProductionLine[] = []
  let prepMinutes = 0
  for (const [recipeId, portions] of portionsByRecipe) {
    const recipe = catalog.recipes.get(recipeId)
    if (!recipe) continue
    const batches = Math.ceil(portions / recipe.yield_portions)
    // Explode on the batches actually cooked, not the portions needed — the
    // shopping has to cover the part-batch that gets rounded up.
    const exploded = explodeRecipe(recipeId, batches * recipe.yield_portions, catalog)
    for (const [ingId, qty] of exploded.requirements) {
      requirements.set(ingId, (requirements.get(ingId) ?? 0) + qty)
    }
    prepMinutes += exploded.prepMinutes
    lines.push({
      recipeId,
      station: recipe.station,
      portions,
      batches,
      prepMinutes: exploded.prepMinutes,
      sameDayOnly: recipe.shelf_life_hours < 24,
    })
  }

  lines.sort((a, b) => a.station.localeCompare(b.station) || b.portions - a.portions)
  return { date, orders: forDate, covers, lines, requirements, prepMinutes }
}

/** Every distinct service date in the book, ascending. */
export function serviceDates(orders: ServiceOrder[]): string[] {
  return [...new Set(orders.filter((o) => o.status !== "cancelled").map((o) => o.serves_on.slice(0, 10)))].sort()
}

/* ── procurement ────────────────────────────────────────────────── */

export interface PurchaseLine {
  ingredient: Ingredient
  /** Edible-portion quantity the recipes consume, in base units. */
  neededEp: number
  /** As-purchased quantity that yields it — `neededEp ÷ yield%`. */
  neededAp: number
  /** Already in store, in base units (as-purchased basis). */
  onHand: number
  /** What has to be bought after netting off stock and holding the par level. */
  shortfallAp: number
  /** Whole packs to order — suppliers ship sacks, not kilos. */
  packs: number
  /** SAR at as-purchased prices. Null while the ingredient is unpriced. */
  cost: number | null
  /** Last date the order can be placed and still arrive — service minus lead. */
  orderBy: string | null
  supplierId: string | null
}

/** `date` shifted by `days`, as an ISO date string. */
export function shiftDate(date: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!m) return date
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Turn a requirement map into an order.
 *
 * Three conversions happen here, in this order, and each is load-bearing:
 *   EP → AP (buy the trim back), net off stock and the par level, then round
 *   up to whole packs. Doing them in any other order either under-buys or
 *   orders fractions of a sack.
 *
 * `neededBy` is the earliest service date the requirement serves; the order-by
 * date walks the supplier's lead time back from it.
 */
export function purchaseList(
  requirements: Map<string, number>,
  catalog: Catalog,
  suppliers: Map<string, { lead_time_days: number }>,
  neededBy: string | null,
): PurchaseLine[] {
  const lines: PurchaseLine[] = []
  for (const [ingId, neededEp] of requirements) {
    const ing = catalog.ingredients.get(ingId)
    if (!ing) continue
    const neededAp = apQtyFor(ing, neededEp)
    // Hold the par level back: consuming into the buffer is what leaves the
    // next service short before anyone notices.
    const shortfallAp = Math.max(0, neededAp + ing.par_level - ing.on_hand)
    const packs = ing.pack_size > 0 ? Math.ceil(shortfallAp / ing.pack_size) : 0
    const lead = ing.supplier ? (suppliers.get(ing.supplier)?.lead_time_days ?? 0) : 0
    lines.push({
      ingredient: ing,
      neededEp,
      neededAp,
      onHand: ing.on_hand,
      shortfallAp,
      packs,
      cost: ing.ap_cost_sar === null ? null : packs * ing.ap_cost_sar,
      orderBy: neededBy ? shiftDate(neededBy, -lead) : null,
      supplierId: ing.supplier,
    })
  }
  // Biggest spend first — that is the order a buyer checks the sheet in.
  lines.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
  return lines
}

/** Value of what is sitting in store, at edible-portion prices. */
export function inventoryValue(catalog: Catalog): number {
  let total = 0
  for (const ing of catalog.ingredients.values()) {
    const unit = epUnitCost(ing)
    if (unit !== null) total += unit * ing.on_hand
  }
  return total
}
