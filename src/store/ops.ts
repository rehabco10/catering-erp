import { proxy } from "valtio"

import type { Catalog } from "@/lib/costing"
import { menuCost } from "@/lib/costing"
import { billableCovers, orderEconomics, productionCovers, serviceDates } from "@/lib/planning"
import type {
  Contract,
  Ingredient,
  Menu,
  MealPeriodValue,
  Policy,
  Recipe,
  Season,
  ServiceOrder,
  ServiceStyleValue,
  Supplier,
} from "@/lib/schemas"
import { validateOperations, type Issue } from "@/lib/validation"
import {
  SEED_CONTRACTS,
  SEED_INGREDIENTS,
  SEED_MENUS,
  SEED_ORDERS,
  SEED_POLICY,
  SEED_RECIPES,
  SEED_SEASON,
  SEED_SUPPLIERS,
  day,
} from "./seed"

/**
 * The operating draft, held in memory.
 *
 * PocketBase persistence comes later — the shapes here are exactly
 * `src/lib/schemas.ts`, so the mapping is 1:1 and the engine never learns where
 * the data came from. That separation is the point: `lib/` is pure functions
 * over plain records, `store/` is the mutable draft plus the actions that edit
 * it, and every screen reads derived numbers rather than storing them.
 */

export interface OpsState {
  season: Season
  policy: Policy
  suppliers: Supplier[]
  ingredients: Ingredient[]
  recipes: Recipe[]
  menus: Menu[]
  contracts: Contract[]
  orders: ServiceOrder[]
  /** Entity currently inspected — an id, or "" for none. */
  selectedId: string
  /**
   * Costs and prices render masked («••••») until toggled. The book is
   * routinely on screen in meetings with the very suppliers and clients being
   * negotiated with, and the margin is the one thing that must not be in the
   * room. One global flag, deliberately: revealing any figure reveals them all,
   * so a presenter always knows which state the screen is in.
   */
  showPrices: boolean
}

export const state = proxy<OpsState>({
  season: { ...SEED_SEASON },
  policy: { ...SEED_POLICY },
  suppliers: SEED_SUPPLIERS,
  ingredients: SEED_INGREDIENTS,
  recipes: SEED_RECIPES,
  menus: SEED_MENUS,
  contracts: SEED_CONTRACTS,
  orders: SEED_ORDERS,
  selectedId: "",
  showPrices: false,
})

/* ── ids ────────────────────────────────────────────────────────── */

let counter = 0
const nextId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}`

/* ── the catalog the engine reads ───────────────────────────────── */

/**
 * Arrays in the store, maps for the engine.
 *
 * Rebuilt per call rather than memoised: the engine's own walks dominate, and
 * a stale map is a far worse failure than a rebuilt one. `useOps` below is
 * where the React-level caching lives.
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

/** Run the shared rules over the draft. Snapshot in, issues out. */
export function issuesFor(s: OpsState = state, now: Date = new Date()): Issue[] {
  return validateOperations({
    catalog: catalogFrom(s),
    orders: s.orders,
    contracts: s.contracts,
    suppliers: s.suppliers,
    now,
  })
}

/* ── lookups ────────────────────────────────────────────────────── */

export const ingredientById = (id: string, s: OpsState = state) =>
  s.ingredients.find((i) => i.id === id)
export const recipeById = (id: string, s: OpsState = state) => s.recipes.find((r) => r.id === id)
export const menuById = (id: string, s: OpsState = state) => s.menus.find((m) => m.id === id)
export const contractById = (id: string, s: OpsState = state) =>
  s.contracts.find((c) => c.id === id)
export const orderById = (id: string, s: OpsState = state) => s.orders.find((o) => o.id === id)
export const supplierById = (id: string | null, s: OpsState = state) =>
  id ? s.suppliers.find((x) => x.id === id) : undefined

export const ordersOf = (contractId: string, s: OpsState = state) =>
  s.orders.filter((o) => o.contract === contractId)

/* ── season-level rollups ───────────────────────────────────────── */

export interface SeasonTotals {
  /** Covers that will be invoiced across every live order. */
  billable: number
  /** Covers the kitchen has to produce, including the overset. */
  production: number
  revenue: number
  foodCost: number
  margin: number
  foodCostPct: number | null
  /** Distinct service days still ahead. */
  upcomingDays: number
}

export function seasonTotals(s: OpsState = state): SeasonTotals {
  const catalog = catalogFrom(s)
  const today = day(0)
  let billable = 0
  let production = 0
  let revenue = 0
  let foodCost = 0
  for (const order of s.orders) {
    if (order.status === "cancelled") continue
    const e = orderEconomics(order, catalog)
    billable += e.billable
    production += e.production
    revenue += e.revenue
    foodCost += e.foodCost
  }
  return {
    billable,
    production,
    revenue,
    foodCost,
    margin: revenue - foodCost,
    foodCostPct: revenue > 0 ? (foodCost / revenue) * 100 : null,
    upcomingDays: serviceDates(s.orders).filter((d) => d >= today).length,
  }
}

/** Covers per service day, for the dashboard's load chart. */
export function dailyLoad(s: OpsState = state): { date: string; covers: number }[] {
  const byDate = new Map<string, number>()
  for (const o of s.orders) {
    if (o.status === "cancelled") continue
    const d = o.serves_on.slice(0, 10)
    byDate.set(d, (byDate.get(d) ?? 0) + productionCovers(o, s.policy))
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, covers]) => ({ date, covers }))
}

/** What a contract has scheduled against what it committed to. */
export function contractUse(contractId: string, s: OpsState = state) {
  const contract = contractById(contractId, s)
  const scheduled = ordersOf(contractId, s)
    .filter((o) => o.status !== "cancelled")
    .reduce((t, o) => t + billableCovers(o), 0)
  const committed = contract?.covers_committed ?? 0
  return { scheduled, committed, remaining: committed - scheduled }
}

/* ── actions: display ───────────────────────────────────────────── */

export function togglePrices() {
  state.showPrices = !state.showPrices
}

export function select(id: string) {
  state.selectedId = id
}

/* ── actions: service orders ────────────────────────────────────── */

/**
 * The add-a-service flow's payload. Collected in full by the wizard, so no
 * half-built order ever reaches the store — which is what keeps
 * `order.no_covers` a finding about real data rather than about typing.
 */
export interface NewOrder {
  contract: string
  serves_on: string
  serves_at: string
  meal_period: MealPeriodValue
  service_style: ServiceStyleValue
  menu: string | null
  site_ar: string
  site_en: string
  expected_covers: number
}

export function addOrder(data: NewOrder): string {
  const id = nextId("so")
  state.orders.push({
    id,
    ...data,
    // A new service is a forecast: no guarantee, no head count, and the
    // guarantee clock starts running from its service time immediately.
    guaranteed_covers: null,
    actual_covers: null,
    status: "draft",
    notes: "",
  })
  state.selectedId = id
  return id
}

/**
 * Record the client's guarantee. This is a state transition, not a field edit:
 * it sets the billing floor and moves the order into the state the kitchen may
 * buy against, so both happen together or neither does.
 */
export function setGuarantee(orderId: string, covers: number) {
  const order = orderById(orderId)
  if (!order) return
  order.guaranteed_covers = Math.max(0, Math.round(covers))
  if (order.status === "draft" || order.status === "confirmed") order.status = "guaranteed"
}

export function clearGuarantee(orderId: string) {
  const order = orderById(orderId)
  if (!order) return
  order.guaranteed_covers = null
  if (order.status === "guaranteed") order.status = "confirmed"
}

/** Head count after service. Closes the order — nothing else is outstanding. */
export function setActualCovers(orderId: string, covers: number) {
  const order = orderById(orderId)
  if (!order) return
  order.actual_covers = Math.max(0, Math.round(covers))
  order.status = "closed"
}

export function setOrderStatus(orderId: string, status: ServiceOrder["status"]) {
  const order = orderById(orderId)
  if (order) order.status = status
}

export function removeOrder(orderId: string) {
  const i = state.orders.findIndex((o) => o.id === orderId)
  if (i >= 0) state.orders.splice(i, 1)
  if (state.selectedId === orderId) state.selectedId = ""
}

/* ── actions: menus ─────────────────────────────────────────────── */

export function addMenu(data: Omit<Menu, "id" | "items">): string {
  const id = nextId("menu")
  state.menus.push({ id, ...data, items: [] })
  state.selectedId = id
  return id
}

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

/** Refuses to remove a menu that a live service order still points at. */
export function removeMenu(menuId: string): { ok: boolean; usedBy: number } {
  const usedBy = state.orders.filter(
    (o) => o.menu === menuId && o.status !== "cancelled",
  ).length
  if (usedBy > 0) return { ok: false, usedBy }
  const i = state.menus.findIndex((m) => m.id === menuId)
  if (i >= 0) state.menus.splice(i, 1)
  return { ok: true, usedBy: 0 }
}

/* ── actions: recipes ───────────────────────────────────────────── */

export function addRecipe(data: Omit<Recipe, "id" | "lines">): string {
  const id = nextId("rec")
  state.recipes.push({ id, ...data, lines: [] })
  state.selectedId = id
  return id
}

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
    state.recipes.filter((r) =>
      r.lines.some((l) => l.kind === "recipe" && l.ref === recipeId),
    ).length
  if (usedBy > 0) return { ok: false, usedBy }
  const i = state.recipes.findIndex((r) => r.id === recipeId)
  if (i >= 0) state.recipes.splice(i, 1)
  return { ok: true, usedBy: 0 }
}

/* ── actions: ingredients & suppliers ───────────────────────────── */

export function addIngredient(data: Omit<Ingredient, "id">): string {
  const id = nextId("ing")
  state.ingredients.push({ id, ...data })
  state.selectedId = id
  return id
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

/** Receive a delivery: stock in, at as-purchased quantity. */
export function receiveStock(ingId: string, packs: number) {
  const ing = ingredientById(ingId)
  if (!ing || packs <= 0) return
  ing.on_hand += packs * ing.pack_size
}

export function addSupplier(data: Omit<Supplier, "id">): string {
  const id = nextId("sup")
  state.suppliers.push({ id, ...data })
  return id
}

/* ── actions: contracts ─────────────────────────────────────────── */

export function addContract(data: Omit<Contract, "id">): string {
  const id = nextId("ct")
  state.contracts.push({ id, ...data })
  state.selectedId = id
  return id
}

/** Refuses to remove a contract that still has services scheduled under it. */
export function removeContract(contractId: string): { ok: boolean; usedBy: number } {
  const usedBy = ordersOf(contractId).length
  if (usedBy > 0) return { ok: false, usedBy }
  const i = state.contracts.findIndex((c) => c.id === contractId)
  if (i >= 0) state.contracts.splice(i, 1)
  return { ok: true, usedBy: 0 }
}
