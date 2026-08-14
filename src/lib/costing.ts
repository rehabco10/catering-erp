import type { Ingredient, Menu, Policy, Recipe } from "./schemas.js"

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
  ingredients: Map<string, Ingredient>
  recipes: Map<string, Recipe>
  menus: Map<string, Menu>
  policy: Policy
}

/** Anything the engine could not resolve, reported instead of silently zeroed. */
export interface CostingGaps {
  /** Recipe lines pointing at an id that no longer exists. */
  missingRefs: string[]
  /** Ingredients with no purchase price — their contribution is 0, not unknown. */
  unpricedIngredients: string[]
  /** Recipe ids that take part in a reference cycle; their branch is cut. */
  cycles: string[]
}

const noGaps = (): CostingGaps => ({ missingRefs: [], unpricedIngredients: [], cycles: [] })

const mergeGaps = (into: CostingGaps, from: CostingGaps): CostingGaps => {
  for (const k of ["missingRefs", "unpricedIngredients", "cycles"] as const) {
    for (const v of from[k]) if (!into[k].includes(v)) into[k].push(v)
  }
  return into
}

/* ── ingredient level ───────────────────────────────────────────── */

/**
 * The three functions below take only the fields they read, as readonly.
 *
 * That is not fussiness: components hand them ingredients straight off a valtio
 * snapshot, which is deeply readonly, and demanding a full mutable `Ingredient`
 * would force a cast at every call site — the kind of cast that eventually
 * hides a real type error.
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
export function apUnitCost(ing: Priced): number | null {
  if (ing.ap_cost_sar === null) return null
  if (ing.pack_size <= 0) return null
  return ing.ap_cost_sar / ing.pack_size
}

/**
 * Edible-portion cost of one base unit — what a recipe actually consumes.
 *
 *     EP cost = AP cost ÷ yield%
 *
 * Chicken breast at 4.50/kg yielding 85% costs 5.29/kg on the plate.
 */
export function epUnitCost(ing: Priced): number | null {
  const ap = apUnitCost(ing)
  if (ap === null) return null
  return ap / (ing.yield_pct / 100)
}

/**
 * As-purchased quantity needed to end up with `epQty` on the plate — the
 * inverse of the yield, and the number the purchase order must carry. Ordering
 * the recipe quantity of a 60%-yield vegetable buys two-thirds of a service.
 */
export function apQtyFor(ing: Pick<Priced, "yield_pct">, epQty: number): number {
  return epQty / (ing.yield_pct / 100)
}

/* ── recipe explosion ───────────────────────────────────────────── */

export interface Explosion {
  /** ingredient id → edible-portion quantity in that ingredient's base unit. */
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
 * Walk a recipe tree, accumulating raw-ingredient requirements for `portions`
 * of it.
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
    if (line.kind === "ingredient") {
      if (!catalog.ingredients.has(line.ref)) {
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

/** Whole batches to actually cook for a required number of portions. */
export function batchesFor(recipe: Recipe, portions: number): number {
  if (recipe.yield_portions <= 0) return 0
  return Math.ceil(portions / recipe.yield_portions)
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
 * Unpriced ingredients contribute nothing and are named in `gaps` — a zero
 * that announces itself, rather than a total that quietly reads as cheap.
 */
export function recipeCost(recipeId: string, catalog: Catalog): RecipeCost {
  const recipe = catalog.recipes.get(recipeId)
  if (!recipe) {
    return { perBatch: 0, perPortion: 0, gaps: { ...noGaps(), missingRefs: [recipeId] } }
  }
  const exploded = explodeRecipe(recipeId, recipe.yield_portions, catalog)
  const gaps = exploded.gaps
  let total = 0
  for (const [ingId, qty] of exploded.requirements) {
    const ing = catalog.ingredients.get(ingId)
    if (!ing) {
      if (!gaps.missingRefs.includes(ingId)) gaps.missingRefs.push(ingId)
      continue
    }
    const unit = epUnitCost(ing)
    if (unit === null) {
      if (!gaps.unpricedIngredients.includes(ingId)) gaps.unpricedIngredients.push(ingId)
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

export const foodCostPct = (cost: number, price: number): number | null =>
  price > 0 ? (cost / price) * 100 : null

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
