import type { Item, ItemVariant, Menu, Policy, Recipe } from "./schemas.js"

/**
 * The costing engine: as-purchased price in, cost-per-cover out.
 *
 * Three ideas do all the work, and each one is a place caterers routinely lose
 * money by skipping it:
 *
 *  1. **Yield.** A recipe consumes edible portions, but invoices are for
 *     as-purchased weight. EP cost = AP cost ÷ yield. Costing at AP price
 *     understates every trimmed item by exactly its trim — 15% on a chicken
 *     breast, 40%+ on leaf produce.
 *  2. **Explosion.** A menu is a bill of materials, not a list. Sub-recipes
 *     nest, so the cost (and the purchase list) has to walk the tree.
 *  3. **Q factor.** Bread, condiments, oil and seasoning never appear on a
 *     recipe card but are on every cover. A flat percentage of raw plate cost
 *     is added rather than itemised, because itemising costs more bookkeeping
 *     than it saves.
 *
 * Pure module — maps in, numbers out, no store and no React — so the same
 * functions serve the UI, a future export and any node tests.
 */

export interface Catalog {
  items: Map<string, Item>
  variants: Map<string, ItemVariant>
  /** Every variant of an item, indexed once so lookups are not O(n) per call. */
  variantsByItem: Map<string, ItemVariant[]>
  recipes: Map<string, Recipe>
  menus: Map<string, Menu>
  policy: Policy
}

/** Anything the engine could not resolve, reported instead of silently zeroed. */
export interface CostingGaps {
  /** Recipe lines pointing at an id that no longer exists. */
  missingRefs: string[]
  /** Items whose costing basis carries no price — contribution is 0, not unknown. */
  unpricedItems: string[]
  /**
   * Items with no preferred variant. Nothing can price them, which is a
   * different failure from "priced at zero" and has a different fix.
   */
  itemsWithoutPreferred: string[]
  /** Recipe ids that take part in a reference cycle; their branch is cut. */
  cycles: string[]
}

const GAP_KEYS = ["missingRefs", "unpricedItems", "itemsWithoutPreferred", "cycles"] as const

const noGaps = (): CostingGaps => ({
  missingRefs: [],
  unpricedItems: [],
  itemsWithoutPreferred: [],
  cycles: [],
})

const mergeGaps = (into: CostingGaps, from: CostingGaps): CostingGaps => {
  for (const k of GAP_KEYS) {
    for (const v of from[k]) if (!into[k].includes(v)) into[k].push(v)
  }
  return into
}

/* ── variant level: price and yield ─────────────────────────────── */

/**
 * The functions below take only the fields they read, as readonly.
 *
 * That is not fussiness: components hand them variants straight off a valtio
 * snapshot, which is deeply readonly, and demanding a full mutable
 * `ItemVariant` would force a cast at every call site — the kind of cast that
 * eventually hides a real type error.
 */
type Priced = {
  readonly ap_cost_sar: number | null
  readonly pack_size: number
  readonly yield_pct: number
}

/**
 * As-purchased cost of one base unit. `ap_cost_sar` prices a whole pack, so a
 * 20 kg sack at 96 SAR is 4.80 SAR/kg.
 */
export function apUnitCost(variant: Priced): number | null {
  if (variant.ap_cost_sar === null) return null
  if (variant.pack_size <= 0) return null
  return variant.ap_cost_sar / variant.pack_size
}

/**
 * Edible-portion cost of one base unit — what a recipe actually consumes.
 *
 *     EP cost = AP cost ÷ yield%
 *
 * Chicken breast at 4.50/kg yielding 85% costs 5.29/kg on the plate. Yield is
 * a variant field, so two ways of buying the same item legitimately cost
 * different amounts per usable kilo.
 */
export function epUnitCost(variant: Priced): number | null {
  const ap = apUnitCost(variant)
  if (ap === null) return null
  return ap / (variant.yield_pct / 100)
}

/**
 * As-purchased quantity needed to end up with `epQty` on the plate — the
 * inverse of the yield, and the number the purchase order must carry. Ordering
 * the recipe quantity of a 60%-yield vegetable buys two-thirds of a service.
 */
export function apQtyFor(variant: Pick<Priced, "yield_pct">, epQty: number): number {
  return epQty / (variant.yield_pct / 100)
}

/* ── item level: the costing basis ──────────────────────────────── */

/**
 * The variant an item is priced through, or null if it has none.
 *
 * A dangling `preferred_variant` resolves to null rather than falling back to
 * some other variant: the fallback would be a silent decision about money.
 */
export function costingVariant(itemId: string, catalog: Catalog): ItemVariant | null {
  const item = catalog.items.get(itemId)
  if (!item?.preferred_variant) return null
  return catalog.variants.get(item.preferred_variant) ?? null
}

/** Edible-portion cost of one base unit of an item, through its preferred variant. */
export function itemUnitCost(itemId: string, catalog: Catalog): number | null {
  const variant = costingVariant(itemId, catalog)
  return variant ? epUnitCost(variant) : null
}

/**
 * The variant that would cost least per usable base unit.
 *
 * Reported, never applied — see `Item.preferred_variant`. Unpriced variants are
 * not candidates: "free" is missing data, not a bargain.
 */
export function cheapestVariant(itemId: string, catalog: Catalog): ItemVariant | null {
  let best: ItemVariant | null = null
  let bestCost = Infinity
  for (const variant of catalog.variantsByItem.get(itemId) ?? []) {
    const cost = epUnitCost(variant)
    if (cost === null) continue
    if (cost < bestCost) {
      best = variant
      bestCost = cost
    }
  }
  return best
}

/* ── recipe explosion ───────────────────────────────────────────── */

export interface Explosion {
  /** item id → edible-portion quantity in that item's base unit. */
  requirements: Map<string, number>
  /** recipe id → batches required, including sub-recipes. */
  batches: Map<string, number>
  /** Hands-on minutes across every batch in the tree. */
  prepMinutes: number
  gaps: CostingGaps
}

const emptyExplosion = (): Explosion => ({
  requirements: new Map(),
  batches: new Map(),
  prepMinutes: 0,
  gaps: noGaps(),
})

function add(map: Map<string, number>, key: string, qty: number) {
  map.set(key, (map.get(key) ?? 0) + qty)
}

/**
 * Walk a recipe tree, accumulating raw-item requirements for `portions` of it.
 *
 * `portions`, not batches, is the entry point on purpose: the caller knows how
 * many people are eating, and fractional batches are normal — you do not cook
 * 1.4 batches, but you do buy for 1.4 (see `batchesFor` for the rounding used
 * on the production sheet, which is a separate decision from the costing one).
 *
 * `seen` cuts reference cycles. A recipe that reaches itself would otherwise
 * recurse until the stack goes; here the branch stops and the recipe is named
 * in `gaps.cycles` so the validation page can report it.
 */
export function explodeRecipe(
  recipeId: string,
  portions: number,
  catalog: Catalog,
  seen: readonly string[] = [],
): Explosion {
  const out = emptyExplosion()
  const recipe = catalog.recipes.get(recipeId)
  if (!recipe) {
    out.gaps.missingRefs.push(recipeId)
    return out
  }
  if (seen.includes(recipeId)) {
    out.gaps.cycles.push(recipeId)
    return out
  }
  if (recipe.yield_portions <= 0 || portions <= 0) return out

  const batches = portions / recipe.yield_portions
  add(out.batches, recipeId, batches)
  out.prepMinutes += recipe.prep_minutes * batches

  const trail = [...seen, recipeId]
  for (const line of recipe.lines) {
    const qty = line.qty * batches
    if (qty <= 0) continue
    if (line.kind === "item") {
      if (!catalog.items.has(line.ref)) {
        out.gaps.missingRefs.push(line.ref)
        continue
      }
      add(out.requirements, line.ref, qty)
      continue
    }
    // Sub-recipe: `qty` is portions of the child, so it recurses unchanged.
    const child = explodeRecipe(line.ref, qty, catalog, trail)
    for (const [id, q] of child.requirements) add(out.requirements, id, q)
    for (const [id, b] of child.batches) add(out.batches, id, b)
    out.prepMinutes += child.prepMinutes
    mergeGaps(out.gaps, child.gaps)
  }
  return out
}

/* ── recipe cost ────────────────────────────────────────────────── */

export interface RecipeCost {
  /** SAR for one batch, at edible-portion prices. */
  perBatch: number
  perPortion: number
  gaps: CostingGaps
}

/**
 * Cost one batch of a recipe, including everything its sub-recipes pull in.
 *
 * An item that cannot be priced — no preferred variant, or a preferred variant
 * with no price — contributes nothing and is named in `gaps`. The two cases are
 * reported separately because they have different fixes: pick a variant, or
 * fill in a price.
 */
export function recipeCost(recipeId: string, catalog: Catalog): RecipeCost {
  const recipe = catalog.recipes.get(recipeId)
  if (!recipe) {
    return { perBatch: 0, perPortion: 0, gaps: { ...noGaps(), missingRefs: [recipeId] } }
  }
  const exploded = explodeRecipe(recipeId, recipe.yield_portions, catalog)
  const gaps = exploded.gaps
  let total = 0
  for (const [itemId, qty] of exploded.requirements) {
    const item = catalog.items.get(itemId)
    if (!item) {
      if (!gaps.missingRefs.includes(itemId)) gaps.missingRefs.push(itemId)
      continue
    }
    const variant = costingVariant(itemId, catalog)
    if (!variant) {
      if (!gaps.itemsWithoutPreferred.includes(itemId)) gaps.itemsWithoutPreferred.push(itemId)
      continue
    }
    const unit = epUnitCost(variant)
    if (unit === null) {
      if (!gaps.unpricedItems.includes(itemId)) gaps.unpricedItems.push(itemId)
      continue
    }
    total += unit * qty
  }
  return {
    perBatch: total,
    perPortion: recipe.yield_portions > 0 ? total / recipe.yield_portions : 0,
    gaps,
  }
}

/* ── menu cost ──────────────────────────────────────────────────── */

export interface MenuCost {
  /** Sum of the dishes, before the Q factor. */
  rawPerCover: number
  /** `q_factor_pct` of the raw cost — bread, condiments, oil, seasoning. */
  qFactorPerCover: number
  /** What one cover actually costs to put out. */
  perCover: number
  /** Selling price per cover, or null while unpriced. */
  pricePerCover: number | null
  /** `perCover / pricePerCover`, as a percentage. Null while unpriced. */
  foodCostPct: number | null
  /** Contribution per cover: price − cost. Null while unpriced. */
  marginPerCover: number | null
  gaps: CostingGaps
}

export function menuCost(menuId: string, catalog: Catalog): MenuCost {
  const menu = catalog.menus.get(menuId)
  const gaps = noGaps()
  if (!menu) {
    gaps.missingRefs.push(menuId)
    return {
      rawPerCover: 0,
      qFactorPerCover: 0,
      perCover: 0,
      pricePerCover: null,
      foodCostPct: null,
      marginPerCover: null,
      gaps,
    }
  }
  let raw = 0
  for (const item of menu.items) {
    const rc = recipeCost(item.recipe, catalog)
    mergeGaps(gaps, rc.gaps)
    raw += rc.perPortion * item.portions_per_cover
  }
  const q = raw * (catalog.policy.q_factor_pct / 100)
  const perCover = raw + q
  const price = menu.price_per_cover_sar
  return {
    rawPerCover: raw,
    qFactorPerCover: q,
    perCover,
    pricePerCover: price,
    foodCostPct: price && price > 0 ? (perCover / price) * 100 : null,
    marginPerCover: price === null ? null : price - perCover,
    gaps,
  }
}

/**
 * The price a cover has to sell at to land on the target food-cost percentage.
 *
 *     price = cost ÷ target%
 *
 * This is the menu-engineering direction of travel: cost is discovered, the
 * target is policy, and the price falls out. Quoting a price first and hoping
 * the cost fits is how a signed contract turns out to be unprofitable.
 */
export function priceForTarget(costPerCover: number, targetPct: number): number {
  if (targetPct <= 0) return 0
  return costPerCover / (targetPct / 100)
}

/* ── policy-aware helpers ───────────────────────────────────────── */

/**
 * How a menu sits against the operation's target. `over` is the finding the
 * validation page raises; `under` is a pricing opportunity, not a defect.
 */
export function menuVerdict(
  cost: MenuCost,
  policy: Policy,
): "unpriced" | "loss" | "over_target" | "on_target" | "under_target" {
  if (cost.pricePerCover === null || cost.pricePerCover <= 0) return "unpriced"
  if (cost.marginPerCover !== null && cost.marginPerCover < 0) return "loss"
  const pct = cost.foodCostPct
  if (pct === null) return "unpriced"
  // A two-point band either side of target — tighter than that and every menu
  // reads as off-target from ordinary ingredient price drift.
  if (pct > policy.target_food_cost_pct + 2) return "over_target"
  if (pct < policy.target_food_cost_pct - 2) return "under_target"
  return "on_target"
}

export const withVat = (net: number, policy: Policy): number => net * (1 + policy.vat_pct / 100)
