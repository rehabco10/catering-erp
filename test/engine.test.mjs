import test from "node:test"
import assert from "node:assert/strict"

import {
  apQtyFor,
  apUnitCost,
  cheapestVariant,
  costingVariant,
  epUnitCost,
  explodeRecipe,
  itemUnitCost,
  menuCost,
  menuVerdict,
  priceForTarget,
  recipeCost,
} from "../.tmp-test/engine/costing.js"
import {
  inventoryValue,
  itemOnHand,
  preferredPremium,
  reorderList,
  shiftDate,
} from "../.tmp-test/engine/inventory.js"
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

const item = (over) => ({
  name_ar: over.id,
  name_en: over.id,
  category: "dry_goods",
  base_unit: "kg",
  allergens: [],
  halal_critical: false,
  par_level: 0,
  preferred_variant: null,
  ...over,
})

const variant = (over) => ({
  name_ar: over.id,
  name_en: over.id,
  supplier: "sup",
  supplier_ref: null,
  pack_unit: "sack",
  pack_size: 20,
  ap_cost_sar: 100,
  yield_pct: 100,
  storage: "dry",
  on_hand: 0,
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
  draft: false,
  lines: [],
  ...over,
})

const menu = (over) => ({
  name_ar: over.id,
  name_en: over.id,
  service_line: "buffet",
  level: null,
  meal_period: null,
  items: [],
  inclusions: [],
  price_per_cover_sar: null,
  ...over,
})

/** Build a catalog from flat item/variant lists, indexing as the store does. */
function build(items, variants, recipes, menus) {
  const variantsByItem = new Map()
  for (const v of variants) {
    const list = variantsByItem.get(v.item)
    if (list) list.push(v)
    else variantsByItem.set(v.item, [v])
  }
  return {
    items: new Map(items.map((i) => [i.id, i])),
    variants: new Map(variants.map((v) => [v.id, v])),
    variantsByItem,
    recipes: new Map(recipes.map((r) => [r.id, r])),
    menus: new Map(menus.map((m) => [m.id, m])),
    policy: POLICY,
  }
}

/**
 * One dish, one sub-recipe, one menu — plus chicken carrying two purchase
 * variants, which is what most of the item/variant assertions turn on.
 */
function fixture() {
  const items = [
    item({ id: "chicken", category: "protein", halal_critical: true, preferred_variant: "chicken_fresh" }),
    item({ id: "rice", preferred_variant: "rice_20" }),
    item({ id: "spice", preferred_variant: "spice_1" }),
  ]
  const variants = [
    // 10 kg case at 185 → 18.50/kg as purchased; 72% yield → 25.694/kg edible
    variant({ id: "chicken_fresh", item: "chicken", pack_size: 10, ap_cost_sar: 185, yield_pct: 72, storage: "chilled" }),
    // Dearer per pack but a better yield: 210/12 = 17.50 → /0.74 = 23.65/kg edible
    variant({ id: "chicken_frozen", item: "chicken", pack_size: 12, ap_cost_sar: 210, yield_pct: 74, storage: "frozen" }),
    variant({ id: "rice_20", item: "rice", pack_size: 20, ap_cost_sar: 96 }),
    variant({ id: "spice_1", item: "spice", pack_size: 1, ap_cost_sar: 45 }),
  ]
  const recipes = [
    recipe({ id: "mix", yield_portions: 200, prep_minutes: 25, lines: [{ id: "a", kind: "item", ref: "spice", qty: 0.9 }] }),
    recipe({
      id: "kabsa", yield_portions: 40, prep_minutes: 95,
      lines: [
        { id: "b", kind: "item", ref: "rice", qty: 6 },
        { id: "c", kind: "item", ref: "chicken", qty: 9 },
        { id: "d", kind: "recipe", ref: "mix", qty: 40 },
      ],
    }),
  ]
  const menus = [
    menu({
      id: "m1",
      price_per_cover_sar: 46,
      items: [{ id: "i1", recipe: "kabsa", course: "main", portions_per_cover: 1 }],
    }),
  ]
  return build(items, variants, recipes, menus)
}

const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol

/* ── yield: as-purchased vs edible portion ──────────────────────── */

test("pack price divides down to a unit price", () => {
  assert.ok(near(apUnitCost(variant({ id: "x", pack_size: 10, ap_cost_sar: 185 })), 18.5))
})

test("EP cost is AP cost divided by the yield", () => {
  assert.ok(
    near(epUnitCost(variant({ id: "x", pack_size: 10, ap_cost_sar: 185, yield_pct: 72 })), 18.5 / 0.72),
  )
})

test("an unpriced variant costs null, not zero", () => {
  assert.equal(apUnitCost(variant({ id: "x", ap_cost_sar: null })), null)
  assert.equal(epUnitCost(variant({ id: "x", ap_cost_sar: null })), null)
})

test("buying back the trim: 100 kg on the plate at 68% needs ~147 kg bought", () => {
  assert.ok(near(apQtyFor({ yield_pct: 68 }, 100), 100 / 0.68))
})

/* ── the costing basis ──────────────────────────────────────────── */

test("an item is priced through its preferred variant", () => {
  const cat = fixture()
  assert.equal(costingVariant("chicken", cat).id, "chicken_fresh")
  assert.ok(near(itemUnitCost("chicken", cat), 18.5 / 0.72))
})

test("changing the preferred variant changes the item cost", () => {
  const cat = fixture()
  const before = itemUnitCost("chicken", cat)
  cat.items.get("chicken").preferred_variant = "chicken_frozen"
  const after = itemUnitCost("chicken", cat)
  assert.ok(near(after, 210 / 12 / 0.74))
  assert.ok(after < before, "the frozen variant is cheaper per usable kilo")
})

test("two variants of one item cost differently because yield is per variant", () => {
  const cat = fixture()
  assert.ok(
    !near(epUnitCost(cat.variants.get("chicken_fresh")), epUnitCost(cat.variants.get("chicken_frozen"))),
  )
})

test("no preferred variant means no cost, and it is not a zero price", () => {
  const cat = fixture()
  cat.items.get("chicken").preferred_variant = null
  assert.equal(itemUnitCost("chicken", cat), null)
  const cost = recipeCost("kabsa", cat)
  assert.deepEqual(cost.gaps.itemsWithoutPreferred, ["chicken"])
  assert.deepEqual(cost.gaps.unpricedItems, [], "a missing basis is not an unpriced one")
  assert.ok(Number.isFinite(cost.perBatch))
})

test("a dangling preferred variant resolves to null rather than a sibling", () => {
  const cat = fixture()
  cat.items.get("chicken").preferred_variant = "gone"
  assert.equal(costingVariant("chicken", cat), null)
})

test("cheapest ignores unpriced variants — free is missing data, not a bargain", () => {
  const cat = fixture()
  cat.variants.get("chicken_frozen").ap_cost_sar = null
  assert.equal(cheapestVariant("chicken", cat).id, "chicken_fresh")
})

test("preferredPremium measures how much dearer the basis is", () => {
  const cat = fixture()
  // fresh 25.694 vs frozen 23.649 → ~8.6% premium
  const premium = preferredPremium("chicken", cat)
  assert.ok(premium > 0.08 && premium < 0.09, `got ${premium}`)
  // Null once the cheapest IS the basis.
  cat.items.get("chicken").preferred_variant = "chicken_frozen"
  assert.equal(preferredPremium("chicken", cat), null)
})

/* ── explosion through sub-recipes ──────────────────────────────── */

test("a sub-recipe's raw items reach the requirement", () => {
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
  assert.ok(recipeCost("a", cat).gaps.cycles.includes("a"))
})

test("a dangling item reference is reported rather than silently skipped", () => {
  const cat = fixture()
  cat.recipes.get("kabsa").lines.push({ id: "z", kind: "item", ref: "ghost", qty: 1 })
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

test("an unpriced basis makes the cost incomplete, not wrong", () => {
  const cat = fixture()
  cat.variants.get("rice_20").ap_cost_sar = null
  const cost = menuCost("m1", cat)
  assert.deepEqual(cost.gaps.unpricedItems, ["rice"])
  // The rice contributes nothing rather than poisoning the total with NaN.
  assert.ok(Number.isFinite(cost.perCover))
})

test("menuVerdict reads a price against the target", () => {
  assert.equal(menuVerdict(menuCost("m1", fixture()), POLICY), "under_target")

  const unpriced = fixture()
  unpriced.menus.get("m1").price_per_cover_sar = null
  assert.equal(menuVerdict(menuCost("m1", unpriced), POLICY), "unpriced")

  const loss = fixture()
  loss.menus.get("m1").price_per_cover_sar = 1
  assert.equal(menuVerdict(menuCost("m1", loss), POLICY), "loss")
})

/* ── inventory ──────────────────────────────────────────────────── */

test("stock on hand sums every way of buying the item", () => {
  const cat = fixture()
  cat.variants.get("chicken_fresh").on_hand = 30
  cat.variants.get("chicken_frozen").on_hand = 12
  assert.equal(itemOnHand("chicken", cat), 42)
})

test("reorder measures against summed stock and buys packs of the preferred variant", () => {
  const cat = fixture()
  cat.items.get("rice").par_level = 50
  cat.variants.get("rice_20").on_hand = 5
  cat.items.get("chicken").par_level = 10
  // Split across variants, together over par — so chicken is not short.
  cat.variants.get("chicken_fresh").on_hand = 6
  cat.variants.get("chicken_frozen").on_hand = 6

  const lines = reorderList(cat, new Map([["sup", { lead_time_days: 3 }]]), "2026-09-01")
  assert.deepEqual(
    lines.map((l) => l.item.id),
    ["rice"],
    "chicken is covered across its variants",
  )

  const rice = lines[0]
  assert.equal(rice.variant.id, "rice_20")
  assert.equal(rice.shortfall, 45)
  assert.equal(rice.packs, 3) // ceil(45 / 20)
  assert.equal(rice.cost, 3 * 96)
  assert.equal(rice.arrivesOn, "2026-09-04")
})

test("an item with no costing basis is skipped by the reorder rather than guessed at", () => {
  const cat = fixture()
  cat.items.get("rice").par_level = 50
  cat.items.get("rice").preferred_variant = null
  assert.deepEqual(reorderList(cat, new Map(), "2026-09-01").map((l) => l.item.id), [])
})

test("stock is valued per variant at its own price and yield, never blended", () => {
  const cat = fixture()
  cat.variants.get("chicken_fresh").on_hand = 100
  cat.variants.get("chicken_frozen").on_hand = 100
  cat.variants.get("rice_20").ap_cost_sar = null
  cat.variants.get("spice_1").ap_cost_sar = null
  assert.ok(near(inventoryValue(cat), 100 * (18.5 / 0.72) + 100 * (210 / 12 / 0.74)))
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

const check = (cat, suppliers = [SUPPLIER]) =>
  validateCatalogue({ catalog: cat, suppliers, now: NOW })

test("a clean catalogue reports nothing blocking", () => {
  const cat = fixture()
  // The fixture's default basis is the dearer chicken variant; make it the
  // cheap one so the premium warning does not fire either.
  cat.items.get("chicken").preferred_variant = "chicken_frozen"
  cat.menus.get("m1").price_per_cover_sar = 30
  assert.deepEqual(
    check(cat).filter((i) => i.level === "error"),
    [],
  )
})

test("an item with no variants blocks", () => {
  const cat = fixture()
  cat.variantsByItem.delete("rice")
  cat.variants.delete("rice_20")
  const hit = check(cat).find((i) => i.code === "item.no_variants")
  assert.equal(hit.level, "error")
  assert.equal(hit.entityId, "rice")
})

test("an item with variants but no costing basis blocks", () => {
  const cat = fixture()
  cat.items.get("rice").preferred_variant = null
  assert.equal(check(cat).find((i) => i.code === "item.no_preferred").level, "error")
})

test("an unpriced basis warns but does not block", () => {
  const cat = fixture()
  cat.variants.get("rice_20").ap_cost_sar = null
  assert.equal(check(cat).find((i) => i.code === "item.preferred_unpriced").level, "warning")
})

test("a cheaper variant on file is surfaced, not applied", () => {
  const cat = fixture() // basis is fresh chicken, ~8.6% over the frozen one
  const hit = check(cat).find((i) => i.code === "item.cheaper_variant_available")
  assert.equal(hit.level, "warning")
  assert.equal(hit.entityId, "chicken")
  // Still priced through the basis — reporting must not change the number.
  assert.ok(near(itemUnitCost("chicken", cat), 18.5 / 0.72))
})

test("a lapsed certificate blocks, on every variant that carries it", () => {
  const cat = fixture()
  const expired = { ...SUPPLIER, halal_cert_expiry: "2026-08-01" }
  const hits = check(cat, [expired]).filter((i) => i.code === "variant.halal_cert_expired")
  // Both chicken variants point at this supplier; an uncertified pack is stock
  // you may hold, whichever one prices the recipes.
  assert.equal(hits.length, 2)
  assert.ok(hits.every((h) => h.level === "error"))
})

test("halal certification is only checked on halal-critical items", () => {
  const cat = fixture()
  cat.items.get("chicken").halal_critical = false
  const expired = { ...SUPPLIER, halal_cert_expiry: "2026-08-01" }
  assert.ok(!codes(check(cat, [expired])).includes("variant.halal_cert_expired"))
})

test("stock under par warns, measured across variants", () => {
  const cat = fixture()
  cat.items.get("rice").par_level = 50
  assert.ok(codes(check(cat)).includes("item.below_par"))
})

test("a 100% yield on meat or produce is questioned, per variant", () => {
  const cat = fixture()
  cat.variants.get("chicken_fresh").yield_pct = 100
  const hits = codes(check(cat)).filter((c) => c === "variant.suspicious_yield")
  assert.equal(hits.length, 1, "the frozen variant at 74% is not questioned")
})

/* ── packages transcribed from a proposal ───────────────────────── */

/**
 * The catalogue carries ~120 dish names imported from the client's package
 * document, none of them costed. These rules keep that honest without burying
 * every real finding under a wall of them.
 */

test("a draft with no lines is not a defect — it is a name nobody has costed", () => {
  const cat = fixture()
  cat.recipes.set("stub", recipe({ id: "stub", draft: true, lines: [] }))
  assert.ok(!codes(check(cat)).includes("recipe.no_lines"))
})

test("a NON-draft with no lines still blocks — someone emptied it", () => {
  const cat = fixture()
  cat.recipes.set("emptied", recipe({ id: "emptied", draft: false, lines: [] }))
  const hit = check(cat).find((i) => i.code === "recipe.no_lines")
  assert.equal(hit.entityId, "emptied")
  assert.equal(hit.level, "error")
})

test("uncosted dishes are rolled up onto the menu, once, not per dish", () => {
  const cat = fixture()
  cat.recipes.set("d1", recipe({ id: "d1", draft: true }))
  cat.recipes.set("d2", recipe({ id: "d2", draft: true }))
  cat.menus.set(
    "pkg",
    menu({
      id: "pkg",
      items: [
        { id: "a", recipe: "d1", course: "cold_appetiser", portions_per_cover: 0.2 },
        { id: "b", recipe: "d2", course: "main", portions_per_cover: 0.3 },
      ],
    }),
  )
  const hits = check(cat).filter((i) => i.code === "menu.uncosted_dishes")
  assert.equal(hits.length, 1)
  assert.equal(hits[0].entityId, "pkg")
  assert.match(hits[0].message, /2/)
})

test("an unpriced package is not a pricing defect while its dishes are uncosted", () => {
  const cat = fixture()
  cat.recipes.set("d1", recipe({ id: "d1", draft: true }))
  cat.menus.set(
    "pkg",
    menu({
      id: "pkg",
      items: [{ id: "a", recipe: "d1", course: "main", portions_per_cover: 1 }],
    }),
  )
  const priced = check(cat).filter((i) => i.code === "menu.unpriced" && i.entityId === "pkg")
  assert.deepEqual(priced, [], "the missing price is a consequence, not a decision")

  // Once the dish is costed, the missing price IS the outstanding decision.
  cat.recipes.get("d1").draft = false
  cat.recipes.get("d1").lines = [{ id: "x", kind: "item", ref: "rice", qty: 1 }]
  assert.ok(
    check(cat).some((i) => i.code === "menu.unpriced" && i.entityId === "pkg"),
  )
})

test("a station is defined by its inclusions, so no dishes is not empty", () => {
  const cat = fixture()
  cat.menus.set(
    "station",
    menu({ id: "station", service_line: "station", items: [], inclusions: ["الذبيحة", "الطاولات"] }),
  )
  assert.ok(!codes(check(cat)).includes("menu.no_items"))

  // A package with neither dishes nor inclusions genuinely is empty.
  cat.menus.set("hollow", menu({ id: "hollow", items: [], inclusions: [] }))
  const hit = check(cat).find((i) => i.code === "menu.no_items")
  assert.equal(hit.entityId, "hollow")
})

test("a station still has to be priced — it is sold for money", () => {
  const cat = fixture()
  cat.menus.set(
    "station",
    menu({ id: "station", service_line: "station", items: [], inclusions: ["الذبيحة"] }),
  )
  const hit = check(cat).find((i) => i.code === "menu.unpriced" && i.entityId === "station")
  assert.ok(hit, "an inclusion-only package with no price is a blocking finding")
  assert.equal(hit.level, "error")
})
