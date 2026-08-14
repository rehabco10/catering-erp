import test from "node:test"
import assert from "node:assert/strict"

import {
  apQtyFor,
  apUnitCost,
  epUnitCost,
  explodeRecipe,
  menuCost,
  menuVerdict,
  priceForTarget,
  recipeCost,
} from "../.tmp-test/engine/costing.js"
import { inventoryValue, reorderList, shiftDate } from "../.tmp-test/engine/inventory.js"
import { validateCatalogue } from "../.tmp-test/engine/validation.js"

/**
 * The engine's arithmetic, asserted.
 *
 * Every number checked here is a claim `docs/catering-engine.md` makes, so a
 * failure means either the code drifted or the doc is wrong — and both are
 * worth stopping for. Add a case here whenever you add a rule to the engine.
 *
 * Run with `pnpm test` (compiles src/engine first — see tsconfig.test.json).
 */

const POLICY = { target_food_cost_pct: 30, q_factor_pct: 7, vat_pct: 15 }

const ing = (over) => ({
  name_ar: over.id,
  name_en: over.id,
  category: "dry_goods",
  storage: "dry",
  base_unit: "kg",
  pack_unit: "sack",
  pack_size: 20,
  ap_cost_sar: 100,
  yield_pct: 100,
  allergens: [],
  on_hand: 0,
  par_level: 0,
  supplier: "sup",
  halal_critical: false,
  ...over,
})

const recipe = (over) => ({
  name_ar: over.id,
  name_en: over.id,
  station: "hot",
  service_temp: "hot",
  yield_portions: 40,
  portion_size_g: 400,
  prep_minutes: 0,
  shelf_life_hours: 4,
  lines: [],
  ...over,
})

/** A catalogue with one sub-recipe, one dish that uses it, and one menu. */
function fixture(overrides = {}) {
  const ingredients = new Map([
    // 10 kg case at 185 → 18.50/kg as purchased; 72% yield → 25.694/kg edible
    ["chicken", ing({ id: "chicken", pack_size: 10, ap_cost_sar: 185, yield_pct: 72, category: "protein", halal_critical: true })],
    ["rice", ing({ id: "rice", pack_size: 20, ap_cost_sar: 96 })],
    ["spice", ing({ id: "spice", pack_size: 1, ap_cost_sar: 45 })],
  ])
  const recipes = new Map([
    ["mix", recipe({ id: "mix", yield_portions: 200, prep_minutes: 25, lines: [{ id: "a", kind: "ingredient", ref: "spice", qty: 0.9 }] })],
    ["kabsa", recipe({
      id: "kabsa", yield_portions: 40, prep_minutes: 95,
      lines: [
        { id: "b", kind: "ingredient", ref: "rice", qty: 6 },
        { id: "c", kind: "ingredient", ref: "chicken", qty: 9 },
        { id: "d", kind: "recipe", ref: "mix", qty: 40 },
      ],
    })],
  ])
  const menus = new Map([
    ["m1", {
      id: "m1", name_ar: "m", name_en: "m", tier: "standard", meal_period: "lunch",
      price_per_cover_sar: 46,
      items: [{ id: "i1", recipe: "kabsa", portions_per_cover: 1 }],
    }],
  ])
  return { ingredients, recipes, menus, policy: POLICY, ...overrides }
}

const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol

/* ── yield: as-purchased vs edible portion ──────────────────────── */

test("pack price divides down to a unit price", () => {
  assert.ok(near(apUnitCost(ing({ id: "x", pack_size: 10, ap_cost_sar: 185 })), 18.5))
})

test("EP cost is AP cost divided by the yield", () => {
  const chicken = ing({ id: "x", pack_size: 10, ap_cost_sar: 185, yield_pct: 72 })
  assert.ok(near(epUnitCost(chicken), 18.5 / 0.72))
})

test("an unpriced ingredient costs null, not zero", () => {
  assert.equal(apUnitCost(ing({ id: "x", ap_cost_sar: null })), null)
  assert.equal(epUnitCost(ing({ id: "x", ap_cost_sar: null })), null)
})

test("buying back the trim: 100 kg on the plate at 68% needs ~147 kg bought", () => {
  assert.ok(near(apQtyFor({ yield_pct: 68 }, 100), 100 / 0.68))
})

/* ── explosion through sub-recipes ──────────────────────────────── */

test("a sub-recipe's raw ingredients reach the requirement", () => {
  // 40 portions of a 200-portion mix = 0.2 batches × 0.9 kg = 0.18 kg
  const ex = explodeRecipe("kabsa", 40, fixture())
  assert.ok(near(ex.requirements.get("spice"), 0.18, 1e-12))
  assert.ok(near(ex.requirements.get("chicken"), 9))
})

test("prep minutes accumulate through the tree", () => {
  const ex = explodeRecipe("kabsa", 40, fixture())
  assert.ok(near(ex.prepMinutes, 95 + 25 * 0.2))
})

test("scaling is linear in portions", () => {
  const one = explodeRecipe("kabsa", 40, fixture())
  const two = explodeRecipe("kabsa", 80, fixture())
  assert.ok(near(two.requirements.get("chicken"), one.requirements.get("chicken") * 2))
})

test("a reference cycle is cut and reported, not thrown", () => {
  const cat = fixture()
  cat.recipes.set("a", recipe({ id: "a", yield_portions: 10, lines: [{ id: "x", kind: "recipe", ref: "b", qty: 10 }] }))
  cat.recipes.set("b", recipe({ id: "b", yield_portions: 10, lines: [{ id: "y", kind: "recipe", ref: "a", qty: 10 }] }))
  const cost = recipeCost("a", cat)
  assert.ok(cost.gaps.cycles.includes("a"))
})

test("a dangling reference is reported rather than silently skipped", () => {
  const cat = fixture()
  cat.recipes.get("kabsa").lines.push({ id: "z", kind: "ingredient", ref: "ghost", qty: 1 })
  assert.ok(recipeCost("kabsa", cat).gaps.missingRefs.includes("ghost"))
})

/* ── recipe and menu cost ───────────────────────────────────────── */

const EXPECTED_BATCH = 6 * (96 / 20) + 9 * (18.5 / 0.72) + 0.18 * 45

test("batch cost sums the exploded lines at EP prices", () => {
  assert.ok(near(recipeCost("kabsa", fixture()).perBatch, EXPECTED_BATCH))
})

test("portion cost is the batch divided by its yield", () => {
  assert.ok(near(recipeCost("kabsa", fixture()).perPortion, EXPECTED_BATCH / 40))
})

test("the Q factor is a percentage of the raw plate cost", () => {
  const cost = menuCost("m1", fixture())
  assert.ok(near(cost.qFactorPerCover, cost.rawPerCover * 0.07))
  assert.ok(near(cost.perCover, cost.rawPerCover + cost.qFactorPerCover))
})

test("food cost % is cost over price", () => {
  const cost = menuCost("m1", fixture())
  assert.ok(near(cost.foodCostPct, (cost.perCover / 46) * 100))
})

test("price for target inverts the food cost percentage", () => {
  assert.ok(near(priceForTarget(30, 30), 100))
  assert.ok(near(priceForTarget(9.26, 30), 9.26 / 0.3))
})

test("an unpriced ingredient makes the cost incomplete, not wrong", () => {
  const cat = fixture()
  cat.ingredients.set("rice", ing({ id: "rice", pack_size: 20, ap_cost_sar: null }))
  const cost = menuCost("m1", cat)
  assert.deepEqual(cost.gaps.unpricedIngredients, ["rice"])
  // The rice contributes nothing rather than poisoning the total with NaN.
  assert.ok(Number.isFinite(cost.perCover))
})

test("menuVerdict reads a price against the target", () => {
  const cheap = fixture()
  assert.equal(menuVerdict(menuCost("m1", cheap), POLICY), "under_target")

  const priced = fixture()
  priced.menus.get("m1").price_per_cover_sar = null
  assert.equal(menuVerdict(menuCost("m1", priced), POLICY), "unpriced")

  const loss = fixture()
  loss.menus.get("m1").price_per_cover_sar = 1
  assert.equal(menuVerdict(menuCost("m1", loss), POLICY), "loss")
})

/* ── inventory ──────────────────────────────────────────────────── */

test("only ingredients under par are reordered, in whole packs", () => {
  const cat = fixture()
  cat.ingredients.set("rice", ing({ id: "rice", pack_size: 20, ap_cost_sar: 96, on_hand: 5, par_level: 50 }))
  cat.ingredients.set("spice", ing({ id: "spice", pack_size: 1, ap_cost_sar: 45, on_hand: 10, par_level: 10 }))
  const lines = reorderList(cat, new Map([["sup", { lead_time_days: 3 }]]), "2026-09-01")
  const ids = lines.map((l) => l.ingredient.id)
  assert.ok(!ids.includes("spice"), "at par is not short")
  const rice = lines.find((l) => l.ingredient.id === "rice")
  assert.equal(rice.shortfall, 45)
  assert.equal(rice.packs, 3) // ceil(45 / 20)
  assert.equal(rice.cost, 3 * 96)
  assert.equal(rice.arrivesOn, "2026-09-04")
})

test("stock is valued at edible-portion prices", () => {
  const cat = fixture()
  cat.ingredients.set("chicken", ing({ id: "chicken", pack_size: 10, ap_cost_sar: 185, yield_pct: 72, on_hand: 100 }))
  cat.ingredients.set("rice", ing({ id: "rice", on_hand: 0, ap_cost_sar: null }))
  cat.ingredients.set("spice", ing({ id: "spice", on_hand: 0, ap_cost_sar: null }))
  assert.ok(near(inventoryValue(cat), 100 * (18.5 / 0.72)))
})

test("shiftDate walks dates in both directions across a month edge", () => {
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28")
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01")
})

/* ── validation ─────────────────────────────────────────────────── */

const codes = (issues) => issues.map((i) => i.code)

const SUPPLIER = {
  id: "sup", name_ar: "s", name_en: "s", categories: ["protein"],
  lead_time_days: 3, halal_cert_no: "OK-1", halal_cert_expiry: "2030-01-01",
}
const NOW = new Date("2026-08-15T00:00:00Z")

test("a clean catalogue reports nothing blocking", () => {
  const cat = fixture()
  cat.menus.get("m1").price_per_cover_sar = 30
  const issues = validateCatalogue({ catalog: cat, suppliers: [SUPPLIER], now: NOW })
  assert.deepEqual(issues.filter((i) => i.level === "error"), [])
})

test("a lapsed halal certificate blocks", () => {
  const cat = fixture()
  const expired = { ...SUPPLIER, halal_cert_expiry: "2026-08-01" }
  const issues = validateCatalogue({ catalog: cat, suppliers: [expired], now: NOW })
  const hit = issues.find((i) => i.code === "ingredient.halal_cert_expired")
  assert.ok(hit)
  assert.equal(hit.level, "error")
  assert.equal(hit.entityId, "chicken")
})

test("halal certification is only checked on halal-critical items", () => {
  const cat = fixture()
  cat.ingredients.get("chicken").halal_critical = false
  const expired = { ...SUPPLIER, halal_cert_expiry: "2026-08-01" }
  const issues = validateCatalogue({ catalog: cat, suppliers: [expired], now: NOW })
  assert.ok(!codes(issues).includes("ingredient.halal_cert_expired"))
})

test("an unpriced ingredient warns but does not block", () => {
  const cat = fixture()
  cat.ingredients.get("rice").ap_cost_sar = null
  const issues = validateCatalogue({ catalog: cat, suppliers: [SUPPLIER], now: NOW })
  const hit = issues.find((i) => i.code === "ingredient.no_cost")
  assert.equal(hit.level, "warning")
})

test("a menu selling under its own cost blocks", () => {
  const cat = fixture()
  cat.menus.get("m1").price_per_cover_sar = 1
  const issues = validateCatalogue({ catalog: cat, suppliers: [SUPPLIER], now: NOW })
  const hit = issues.find((i) => i.code === "menu.loss")
  assert.equal(hit.level, "error")
})

test("stock under par warns", () => {
  const cat = fixture()
  cat.ingredients.get("rice").par_level = 50
  const issues = validateCatalogue({ catalog: cat, suppliers: [SUPPLIER], now: NOW })
  assert.ok(codes(issues).includes("ingredient.below_par"))
})

test("a 100% yield on meat or produce is questioned", () => {
  const cat = fixture()
  cat.ingredients.get("chicken").yield_pct = 100
  const issues = validateCatalogue({ catalog: cat, suppliers: [SUPPLIER], now: NOW })
  assert.ok(codes(issues).includes("ingredient.suspicious_yield"))
  // ...but not on dry goods, where 100 is normal.
  assert.equal(codes(issues).filter((c) => c === "ingredient.suspicious_yield").length, 1)
})
