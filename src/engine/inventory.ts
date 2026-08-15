import { cheapestVariant, costingVariant, epUnitCost, type Catalog } from "./costing.js"
import type { Item, ItemVariant, Supplier } from "./schemas.js"

/**
 * Stock, and what it is worth.
 *
 * Two quantities live at different levels and conflating them is the trap:
 * **par is on the item**, because the kitchen runs out of *rice*, not of
 * *Al-Moun rice*; **stock is on the variant**, because the shelf holds specific
 * packs. So a shortfall is measured against summed stock and then bought as
 * packs of the item's preferred variant — the one already decided on.
 *
 * Deliberately small. Its predecessor (`planning.ts`, on `main`) derived
 * requirements from booked service orders. With the commercial half out of
 * scope there is no demand signal, so the only honest reorder rule left is the
 * par level. That is a real rule — a par level *is* how a kitchen without a
 * forecast decides what to buy — but it answers "what is missing", never "what
 * is coming", and nothing here should pretend otherwise.
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

/** Base units of an item in store, across every way of buying it. */
export function itemOnHand(itemId: string, catalog: Catalog): number {
  let total = 0
  for (const variant of catalog.variantsByItem.get(itemId) ?? []) total += variant.on_hand
  return total
}

export interface ReorderLine {
  item: Item
  /** The variant the order is placed against — the item's costing basis. */
  variant: ItemVariant
  onHand: number
  /** Base units short of the par level. */
  shortfall: number
  /** Whole packs of `variant` to order — suppliers ship sacks, not kilos. */
  packs: number
  /** What those packs cost. Null while the variant is unpriced. */
  cost: number | null
  /**
   * When an order placed today would land. Not a deadline — there is no booked
   * service to be late for — but it is what tells a buyer whether the gap
   * closes this week or next.
   */
  arrivesOn: string | null
  supplierId: string | null
}

/**
 * Everything sitting below its par level, as an order.
 *
 * Items with no preferred variant are skipped rather than guessed at: there is
 * no defensible answer to "which of these three do we buy", and the omission is
 * already a blocking finding (`item.no_preferred`), so it will not pass
 * unnoticed.
 *
 * Note the quantities that are *not* converted here. `on_hand` and `par_level`
 * are both as-purchased base units, so the shortfall needs no yield step. Yield
 * only enters when recipes consume the stock — see `costing.ts :: apQtyFor`,
 * which is the direction a demand-driven purchase list would need.
 */
export function reorderList(
  catalog: Catalog,
  suppliers: Map<string, Pick<Supplier, "lead_time_days">>,
  today: string,
): ReorderLine[] {
  const lines: ReorderLine[] = []
  for (const item of catalog.items.values()) {
    const onHand = itemOnHand(item.id, catalog)
    const shortfall = Math.max(0, item.par_level - onHand)
    if (shortfall <= 0) continue
    const variant = costingVariant(item.id, catalog)
    if (!variant) continue
    const packs = variant.pack_size > 0 ? Math.ceil(shortfall / variant.pack_size) : 0
    const lead = variant.supplier ? (suppliers.get(variant.supplier)?.lead_time_days ?? 0) : 0
    lines.push({
      item,
      variant,
      onHand,
      shortfall,
      packs,
      cost: variant.ap_cost_sar === null ? null : packs * variant.ap_cost_sar,
      arrivesOn: shiftDate(today, lead),
      supplierId: variant.supplier,
    })
  }
  // Biggest spend first — the order a buyer checks the sheet in.
  lines.sort((a, b) => (b.cost ?? 0) - (a.cost ?? 0))
  return lines
}

/**
 * Value of what is in store, at edible-portion prices.
 *
 * Summed per variant at that variant's own price and yield, which is stricter
 * than it looks: two ways of buying one item can sit on the shelf together at
 * different costs, and blending them would misstate both.
 *
 * EP rather than AP on purpose: a store holding 100 kg of a 68%-yield item is
 * holding 68 kg of usable food, and valuing it at the invoice price overstates
 * what the kitchen can get out of it.
 */
export function inventoryValue(catalog: Catalog): number {
  let total = 0
  for (const variant of catalog.variants.values()) {
    const unit = epUnitCost(variant)
    if (unit !== null) total += unit * variant.on_hand
  }
  return total
}

/** How far above (>1) or below (<1) par an item is sitting. */
export const parRatio = (item: Item, catalog: Catalog): number =>
  item.par_level > 0 ? itemOnHand(item.id, catalog) / item.par_level : 1

/**
 * How much dearer the costing basis is than the cheapest option, as a fraction.
 *
 * Null when there is nothing to compare — no preferred variant, no priced
 * alternative, or the preferred one *is* the cheapest. Positive means money is
 * being left on the table.
 */
export function preferredPremium(itemId: string, catalog: Catalog): number | null {
  const preferred = costingVariant(itemId, catalog)
  const cheapest = cheapestVariant(itemId, catalog)
  if (!preferred || !cheapest || preferred.id === cheapest.id) return null
  const preferredCost = epUnitCost(preferred)
  const cheapestCost = epUnitCost(cheapest)
  if (preferredCost === null || cheapestCost === null || cheapestCost <= 0) return null
  if (preferredCost <= cheapestCost) return null
  return preferredCost / cheapestCost - 1
}
