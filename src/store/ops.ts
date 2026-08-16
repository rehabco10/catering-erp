import { proxy } from "valtio"

import type { Catalog } from "@/engine/costing"
import { menuCost } from "@/engine/costing"
import type {
  Item,
  ItemVariant,
  Menu,
  MenuCourseValue,
  MenuItem,
  Policy,
  Recipe,
  Supplier,
} from "@/engine/schemas"
import { validateCatalogue, type Issue } from "@/engine/validation"
import {
  SEED_ITEMS,
  SEED_MENUS,
  SEED_POLICY,
  SEED_RECIPES,
  SEED_SUPPLIERS,
  SEED_VARIANTS,
} from "./seed"

/**
 * The catalogue draft, held in memory.
 *
 * PocketBase persistence comes later — the shapes here are exactly
 * `src/engine/schemas.ts`, so the mapping is 1:1 and the engine never learns
 * where the data came from. That separation is the point: `engine/` is pure
 * functions over plain records, `store/` is the mutable draft plus the actions
 * that edit it, and every screen reads derived numbers rather than storing them.
 */

export interface OpsState {
  policy: Policy
  suppliers: Supplier[]
  items: Item[]
  /** Flat, with an `item` foreign key — the shape PocketBase will want. */
  variants: ItemVariant[]
  recipes: Recipe[]
  menus: Menu[]
  /* ── canvas state ──────────────────────────────────────────────
   * Only the graph mode on /menus reads these. They live in the store
   * rather than in the canvas component so that switching to form mode and
   * back does not discard where the user parked their cards. */
  /** Node currently inspected — a menu id, a dish id, or `"root"`. */
  selectedId: string
  /**
   * The one menu whose *sections* render on the canvas — accordion, not a set.
   */
  expandedMenuId: string | null
  /**
   * The one section, within that menu, whose dishes render.
   *
   * Two levels of accordion rather than one, because a transcribed package
   * carries up to 81 dishes: opening a package shows five section cards, and
   * opening a section shows only that section's dishes. The widest the canvas
   * ever gets is one section.
   */
  expandedCourse: MenuCourseValue | null
  /** Nodes the user has dragged; re-layout leaves these alone. */
  pinned: Record<string, { x: number; y: number }>
}

export const state = proxy<OpsState>({
  policy: { ...SEED_POLICY },
  suppliers: SEED_SUPPLIERS,
  items: SEED_ITEMS,
  variants: SEED_VARIANTS,
  recipes: SEED_RECIPES,
  menus: SEED_MENUS,
  selectedId: "root",
  expandedMenuId: null,
  expandedCourse: null,
  pinned: {},
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
  const variantsByItem = new Map<string, ItemVariant[]>()
  for (const v of s.variants) {
    const list = variantsByItem.get(v.item)
    if (list) list.push(v)
    else variantsByItem.set(v.item, [v])
  }
  return {
    items: new Map(s.items.map((i) => [i.id, i])),
    variants: new Map(s.variants.map((v) => [v.id, v])),
    variantsByItem,
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

export const itemById = (id: string, s: OpsState = state) => s.items.find((i) => i.id === id)
export const variantById = (id: string | null, s: OpsState = state) =>
  id ? s.variants.find((v) => v.id === id) : undefined
export const variantsOf = (itemId: string, s: OpsState = state) =>
  s.variants.filter((v) => v.item === itemId)
export const recipeById = (id: string, s: OpsState = state) => s.recipes.find((r) => r.id === id)
export const menuById = (id: string, s: OpsState = state) => s.menus.find((m) => m.id === id)
export const supplierById = (id: string | null, s: OpsState = state) =>
  id ? s.suppliers.find((x) => x.id === id) : undefined

/* ── actions: items and their variants ──────────────────────────── */

/**
 * The add-an-item payload. The wizard collects the item and its first variant
 * together — an item with no way to buy it is a blocking finding the moment it
 * exists, so creating one on purpose would be creating a defect.
 */
export type NewItem = Omit<Item, "id" | "preferred_variant">
export type NewVariant = Omit<ItemVariant, "id" | "item" | "on_hand">

export function addItem(item: NewItem, firstVariant: NewVariant): string {
  const itemId = nextId("it")
  const variantId = nextId("v")
  state.items.push({ ...item, id: itemId, preferred_variant: variantId })
  // Stock starts at zero: an item is created, then received.
  state.variants.push({ ...firstVariant, id: variantId, item: itemId, on_hand: 0 })
  return itemId
}

export function addVariant(itemId: string, data: NewVariant): string | null {
  const item = itemById(itemId)
  if (!item) return null
  const id = nextId("v")
  state.variants.push({ ...data, id, item: itemId, on_hand: 0 })
  // First variant on an item becomes its costing basis by default; later ones
  // never displace a choice already made.
  if (!item.preferred_variant) item.preferred_variant = id
  return id
}

/** Choose the costing basis. Refuses a variant belonging to another item. */
export function setPreferredVariant(itemId: string, variantId: string) {
  const item = itemById(itemId)
  const variant = variantById(variantId)
  if (!item || variant?.item !== itemId) return
  item.preferred_variant = variantId
}

/**
 * Remove a purchase option.
 *
 * If it was the costing basis, the pointer is cleared rather than repointed at
 * a sibling: repointing would move every recipe cost touching this item without
 * anyone asking. The resulting `item.no_preferred` is blocking, which is the
 * correct amount of noise.
 */
export function removeVariant(variantId: string) {
  const variant = variantById(variantId)
  if (!variant) return
  const item = itemById(variant.item)
  if (item?.preferred_variant === variantId) item.preferred_variant = null
  const i = state.variants.findIndex((v) => v.id === variantId)
  if (i >= 0) state.variants.splice(i, 1)
}

/** Receive a delivery: stock in, against the variant that actually arrived. */
export function receiveStock(variantId: string, packs: number) {
  const variant = variantById(variantId)
  if (!variant || packs <= 0) return
  variant.on_hand += packs * variant.pack_size
}

/** Refuses to remove an item any recipe still calls for; takes its variants with it. */
export function removeItem(itemId: string): { ok: boolean; usedBy: number } {
  const usedBy = state.recipes.filter((r) =>
    r.lines.some((l) => l.kind === "item" && l.ref === itemId),
  ).length
  if (usedBy > 0) return { ok: false, usedBy }
  state.variants = state.variants.filter((v) => v.item !== itemId)
  const i = state.items.findIndex((x) => x.id === itemId)
  if (i >= 0) state.items.splice(i, 1)
  return { ok: true, usedBy: 0 }
}

/* ── actions: suppliers ─────────────────────────────────────────── */

export function addSupplier(data: Omit<Supplier, "id">): string {
  const id = nextId("sup")
  state.suppliers.push({ id, ...data })
  return id
}

/** Refuses to remove a supplier any purchase variant still points at. */
export function removeSupplier(supplierId: string): { ok: boolean; usedBy: number } {
  const usedBy = state.variants.filter((v) => v.supplier === supplierId).length
  if (usedBy > 0) return { ok: false, usedBy }
  const i = state.suppliers.findIndex((x) => x.id === supplierId)
  if (i >= 0) state.suppliers.splice(i, 1)
  return { ok: true, usedBy: 0 }
}

/* ── actions: recipes ───────────────────────────────────────────── */

export function addRecipeLine(
  recipeId: string,
  kind: "item" | "recipe",
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

/* ── actions: canvas ────────────────────────────────────────────── */

export function select(id: string) {
  state.selectedId = id
}

/** Accordion toggle: open this menu's branch, closing whichever was open. */
export function toggleExpandedMenu(id: string) {
  const opening = state.expandedMenuId !== id
  state.expandedMenuId = opening ? id : null
  // Switching packages closes the open section too: a section belongs to the
  // package it came from, and leaving it open would draw another package's
  // dishes under the same heading.
  state.expandedCourse = null
}

/** Accordion toggle for the section rank, within the open menu. */
export function toggleExpandedCourse(course: MenuCourseValue) {
  state.expandedCourse = state.expandedCourse === course ? null : course
}

export function pinNode(id: string, x: number, y: number) {
  state.pinned[id] = { x, y }
}

export function unpinNode(id: string) {
  delete state.pinned[id]
}

export function unpinAll() {
  state.pinned = {}
}

/* ── actions: menus ─────────────────────────────────────────────── */

/**
 * A new menu starts empty and unpriced: the price is derived from what goes
 * into it, so quoting before composing is the mistake the whole page exists to
 * prevent.
 */
export function addMenu(line: Menu["service_line"] = "buffet"): string {
  const id = nextId("menu")
  const n = state.menus.filter((m) => m.service_line === line).length + 1
  state.menus.push({
    id,
    name_ar: `قائمة ${n}`,
    name_en: `Menu ${n}`,
    service_line: line,
    level: null,
    meal_period: null,
    items: [],
    inclusions: [],
    price_per_cover_sar: null,
  })
  state.selectedId = id
  state.expandedMenuId = id
  return id
}

export function addMenuItem(
  menuId: string,
  recipeId: string,
  course: MenuItem["course"],
  portionsPerCover = 1,
) {
  const menu = menuById(menuId)
  if (!menu || menu.items.some((i) => i.recipe === recipeId)) return
  menu.items.push({ id: nextId("mi"), recipe: recipeId, course, portions_per_cover: portionsPerCover })
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
