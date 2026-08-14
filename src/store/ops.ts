import { proxy } from "valtio"

import type { Catalog } from "@/engine/costing"
import { menuCost } from "@/engine/costing"
import type { Ingredient, Menu, Policy, Recipe, Supplier } from "@/engine/schemas"
import { validateCatalogue, type Issue } from "@/engine/validation"
import {
  SEED_INGREDIENTS,
  SEED_MENUS,
  SEED_POLICY,
  SEED_RECIPES,
  SEED_SUPPLIERS,
} from "./seed"

/**
 * The catalogue draft, held in memory.
 *
 * PocketBase persistence comes later — the shapes here are exactly
 * `src/lib/schemas.ts`, so the mapping is 1:1 and the engine never learns
 * where the data came from. That separation is the point: `lib/` is pure
 * functions over plain records, `store/` is the mutable draft plus the actions
 * that edit it, and every screen reads derived numbers rather than storing them.
 */

export interface OpsState {
  policy: Policy
  suppliers: Supplier[]
  ingredients: Ingredient[]
  recipes: Recipe[]
  menus: Menu[]
}

export const state = proxy<OpsState>({
  policy: { ...SEED_POLICY },
  suppliers: SEED_SUPPLIERS,
  ingredients: SEED_INGREDIENTS,
  recipes: SEED_RECIPES,
  menus: SEED_MENUS,
})

/* ── ids ────────────────────────────────────────────────────────── */

let counter = 0
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`

/* ── the catalog the engine reads ───────────────────────────────── */

/**
 * Arrays in the store, maps for the engine.
 *
 * Rebuilt per call rather than memoised: the engine's own walks dominate, and
 * a stale map is a far worse failure than a rebuilt one. `useCatalog` is where
 * the React-level caching lives.
 */
export function catalogFrom(s: OpsState = state): Catalog {
  return {
    ingredients: new Map(s.ingredients.map((i) => [i.id, i])),
    recipes: new Map(s.recipes.map((r) => [r.id, r])),
    menus: new Map(s.menus.map((m) => [m.id, m])),
    policy: s.policy,
  }
}

export const supplierMap = (s: OpsState = state) => new Map(s.suppliers.map((x) => [x.id, x]))

/** Run the shared rules over the draft. Draft in, issues out. */
export function issuesFor(s: OpsState = state, now: Date = new Date()): Issue[] {
  return validateCatalogue({ catalog: catalogFrom(s), suppliers: s.suppliers, now })
}

/* ── lookups ────────────────────────────────────────────────────── */

export const ingredientById = (id: string, s: OpsState = state) =>
  s.ingredients.find((i) => i.id === id)
export const recipeById = (id: string, s: OpsState = state) => s.recipes.find((r) => r.id === id)
export const menuById = (id: string, s: OpsState = state) => s.menus.find((m) => m.id === id)
export const supplierById = (id: string | null, s: OpsState = state) =>
  id ? s.suppliers.find((x) => x.id === id) : undefined

/* ── actions: ingredients ───────────────────────────────────────── */

/**
 * The add-an-ingredient payload. Collected in full by the wizard, so no
 * half-built row ever reaches the store — which is what keeps
 * `ingredient.no_cost` a finding about real data rather than about typing.
 * Stock starts at zero: an ingredient is created, then received.
 */
export type NewIngredient = Omit<Ingredient, "id" | "on_hand">

export function addIngredient(data: NewIngredient): string {
  const id = nextId("ing")
  state.ingredients.push({ id, on_hand: 0, ...data })
  return id
}

/** Receive a delivery: stock in, at as-purchased quantity. */
export function receiveStock(ingId: string, packs: number) {
  const ing = ingredientById(ingId)
  if (!ing || packs <= 0) return
  ing.on_hand += packs * ing.pack_size
}

/** Refuses to remove an ingredient any recipe still calls for. */
export function removeIngredient(ingId: string): { ok: boolean; usedBy: number } {
  const usedBy = state.recipes.filter((r) =>
    r.lines.some((l) => l.kind === "ingredient" && l.ref === ingId),
  ).length
  if (usedBy > 0) return { ok: false, usedBy }
  const i = state.ingredients.findIndex((x) => x.id === ingId)
  if (i >= 0) state.ingredients.splice(i, 1)
  return { ok: true, usedBy: 0 }
}

/* ── actions: recipes ───────────────────────────────────────────── */

export function addRecipeLine(
  recipeId: string,
  kind: "ingredient" | "recipe",
  ref: string,
  qty: number,
) {
  const recipe = recipeById(recipeId)
  if (!recipe) return
  // Self-reference is the one cycle cheap enough to refuse outright; deeper
  // ones are caught by the explosion and reported, not blocked at entry.
  if (kind === "recipe" && ref === recipeId) return
  recipe.lines.push({ id: nextId("rl"), kind, ref, qty })
}

export function removeRecipeLine(recipeId: string, lineId: string) {
  const recipe = recipeById(recipeId)
  if (!recipe) return
  const i = recipe.lines.findIndex((l) => l.id === lineId)
  if (i >= 0) recipe.lines.splice(i, 1)
}

/** Refuses to remove a recipe still used by a menu or another recipe. */
export function removeRecipe(recipeId: string): { ok: boolean; usedBy: number } {
  const usedBy =
    state.menus.filter((m) => m.items.some((i) => i.recipe === recipeId)).length +
    state.recipes.filter((r) => r.lines.some((l) => l.kind === "recipe" && l.ref === recipeId))
      .length
  if (usedBy > 0) return { ok: false, usedBy }
  const i = state.recipes.findIndex((r) => r.id === recipeId)
  if (i >= 0) state.recipes.splice(i, 1)
  return { ok: true, usedBy: 0 }
}

/* ── actions: menus ─────────────────────────────────────────────── */

export function addMenuItem(menuId: string, recipeId: string, portionsPerCover = 1) {
  const menu = menuById(menuId)
  if (!menu || menu.items.some((i) => i.recipe === recipeId)) return
  menu.items.push({ id: nextId("mi"), recipe: recipeId, portions_per_cover: portionsPerCover })
}

export function removeMenuItem(menuId: string, itemId: string) {
  const menu = menuById(menuId)
  if (!menu) return
  const i = menu.items.findIndex((x) => x.id === itemId)
  if (i >= 0) menu.items.splice(i, 1)
}

/**
 * Price the menu at the target food cost. This is the direction menu
 * engineering actually runs in — cost is discovered, the target is policy, and
 * the price falls out — so it is one click rather than a calculator on paper.
 */
export function priceMenuAtTarget(menuId: string) {
  const menu = menuById(menuId)
  if (!menu) return
  const cost = menuCost(menuId, catalogFrom())
  const target = state.policy.target_food_cost_pct
  if (target <= 0) return
  // Rounded to the riyal: a menu priced at 43.71 is a price nobody quotes.
  menu.price_per_cover_sar = Math.ceil(cost.perCover / (target / 100))
}
