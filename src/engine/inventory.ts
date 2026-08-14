import { epUnitCost, type Catalog } from "./costing.js"
import type { Ingredient, Supplier } from "./schemas.js"

/**
 * Stock, and what it is worth.
 *
 * Deliberately small. Its predecessor (`planning.ts`, on `main`) derived
 * requirements from booked service orders — how much to buy for Tuesday's
 * 3,400 covers. With the commercial half out of scope there is no demand
 * signal, so the only honest reorder rule left is the par level: keep enough
 * on the shelf to cover the gap between deliveries.
 *
 * That is a real rule, not a placeholder — a par level *is* how a kitchen
 * without a forecast decides what to buy. But it answers "what is missing",
 * never "what is coming", and nothing here should pretend otherwise.
 *
 * Pure module — records in, numbers out.
 */

/** `date` shifted by `days`, as an ISO date string. */
export function shiftDate(date: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!m) return date
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

export interface ReorderLine {
  ingredient: Ingredient
  /** Base units short of the par level. Zero once stock is at or above it. */
  shortfall: number
  /** Whole packs to order — suppliers ship sacks, not kilos. */
  packs: number
  /** What those packs cost. Null while the ingredient is unpriced. */
  cost: number | null
  /**
   * When an order placed today would land. Not a deadline — there is no
   * booked service to be late for — but it is what tells a buyer whether the
   * gap closes this week or next.
   */
  arrivesOn: string | null
  supplierId: string | null
}

/**
 * Everything sitting below its par level, as an order.
 *
 * Note the two quantities that are *not* the same and are easy to conflate:
 * `on_hand` and `par_level` are as-purchased stock, so the shortfall needs no
 * yield conversion. Yield only enters when recipes consume the stock — see
 * `costing.ts :: apQtyFor`, which is the direction a demand-driven purchase
 * list would need.
 */
export function reorderList(
  catalog: Catalog,
  suppliers: Map<string, Pick<Supplier, "lead_time_days">>,
  today: string,
): ReorderLine[] {
  const lines: ReorderLine[] = []
  for (const ing of catalog.ingredients.values()) {
    const shortfall = Math.max(0, ing.par_level - ing.on_hand)
    if (shortfall <= 0) continue
    const packs = ing.pack_size > 0 ? Math.ceil(shortfall / ing.pack_size) : 0
    const lead = ing.supplier ? (suppliers.get(ing.supplier)?.lead_time_days ?? 0) : 0
    lines.push({
      ingredient: ing,
      shortfall,
      packs,
      cost: ing.ap_cost_sar === null ? null : packs * ing.ap_cost_sar,
      arrivesOn: shiftDate(today, lead),
      supplierId: ing.supplier,
    })
  }
  // Biggest spend first — the order a buyer checks the sheet in.
  lines.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
  return lines
}

/**
 * Value of what is in store, at edible-portion prices.
 *
 * EP rather than AP on purpose: a store holding 100 kg of a 68%-yield item is
 * holding 68 kg of usable food, and valuing it at the invoice price overstates
 * what the kitchen can actually get out of it.
 */
export function inventoryValue(catalog: Catalog): number {
  let total = 0
  for (const ing of catalog.ingredients.values()) {
    const unit = epUnitCost(ing)
    if (unit !== null) total += unit * ing.on_hand
  }
  return total
}

/** How far above (>1) or below (<1) par a line is sitting. */
export const parRatio = (ing: Pick<Ingredient, "on_hand" | "par_level">): number =>
  ing.par_level > 0 ? ing.on_hand / ing.par_level : 1
