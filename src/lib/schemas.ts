import { z } from "zod"

/**
 * The catering domain, as schemas.
 *
 * Mirrors what an operating caterer actually keeps records of, in the order the
 * money moves through it:
 *
 *   supplier → ingredient → recipe → menu → service order (BEO) → contract
 *                                       ↘ production plan → purchase list
 *
 * Every field here exists because some downstream calculation needs it — see
 * `docs/catering-engine.md` for the sourcing of each rule. Anything a caterer
 * *would* keep but nothing computes (marketing copy, client addresses, crockery
 * inventories) is deliberately absent from the MVP.
 *
 * Pure module — no React, no i18next — so the engine, the store and any future
 * node tests can all read it.
 */

/* ── shared vocabulary ──────────────────────────────────────────── */

/** The physical unit an ingredient is measured in once it is in the kitchen. */
export const BaseUnit = z.enum(["kg", "l", "ea"])
export type BaseUnitValue = z.infer<typeof BaseUnit>

/**
 * How a purchase is packed. `pack_size` converts it to base units — a caterer
 * buys a 20 kg sack, not 20 separate kilos, and the purchase list has to round
 * up to whole packs or it produces an order the supplier cannot fill.
 */
export const PackUnit = z.enum(["kg", "l", "ea", "box", "case", "sack", "tray"])
export type PackUnitValue = z.infer<typeof PackUnit>

export const StorageClass = z.enum(["dry", "chilled", "frozen"])
export type StorageClassValue = z.infer<typeof StorageClass>

export const IngredientCategory = z.enum([
  "protein",
  "produce",
  "dairy",
  "dry_goods",
  "bakery",
  "beverage",
  "disposable",
])
export type IngredientCategoryValue = z.infer<typeof IngredientCategory>

/**
 * The nine allergens that have to be declared. Kept as a flat enum rather than
 * free text so a menu can be checked mechanically against a client's stated
 * restrictions.
 */
export const Allergen = z.enum([
  "gluten",
  "dairy",
  "egg",
  "nuts",
  "peanut",
  "sesame",
  "soy",
  "fish",
  "shellfish",
])
export type AllergenValue = z.infer<typeof Allergen>

/** Where a recipe is produced. Drives the production sheet's grouping. */
export const Station = z.enum(["hot", "cold", "bakery", "beverage", "assembly"])
export type StationValue = z.infer<typeof Station>

/** Holding temperature — the axis every food-safety rule turns on. */
export const ServiceTemp = z.enum(["hot", "cold", "ambient"])
export type ServiceTempValue = z.infer<typeof ServiceTemp>

export const MealPeriod = z.enum(["breakfast", "lunch", "dinner", "snack"])
export type MealPeriodValue = z.infer<typeof MealPeriod>

/**
 * Service style is the single biggest driver of both staffing and overproduction,
 * so it is modelled on the service order, not just described in a note.
 */
export const ServiceStyle = z.enum(["buffet", "plated", "boxed", "grab_and_go"])
export type ServiceStyleValue = z.infer<typeof ServiceStyle>

export const MenuTier = z.enum(["economy", "standard", "premium"])
export type MenuTierValue = z.infer<typeof MenuTier>

/* ── suppliers ──────────────────────────────────────────────────── */

/**
 * `halal_cert_no` / `halal_cert_expiry` are first-class rather than a note:
 * meat has to come from a certified supplier, and an expired certificate is a
 * blocking finding, not a reminder.
 */
export const Supplier = z.object({
  id: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
  categories: z.array(IngredientCategory),
  /** Working days between placing an order and receiving it. */
  lead_time_days: z.number().int().min(0),
  halal_cert_no: z.string().nullable(),
  /** ISO date. Null = not applicable (produce, disposables). */
  halal_cert_expiry: z.string().nullable(),
})
export type Supplier = z.infer<typeof Supplier>

/* ── ingredients ────────────────────────────────────────────────── */

export const Ingredient = z.object({
  id: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
  category: IngredientCategory,
  storage: StorageClass,
  /** The unit recipes are written in. */
  base_unit: BaseUnit,
  /** The unit it is bought in, and how many base units one pack holds. */
  pack_unit: PackUnit,
  pack_size: z.number().positive(),
  /** As-purchased cost of ONE PACK, in SAR. Null while unpriced. */
  ap_cost_sar: z.number().nonnegative().nullable(),
  /**
   * Usable share after trimming, peeling, boning, draining or cooking loss,
   * as a percentage. 100 = no loss. This is what turns an as-purchased price
   * into an edible-portion price; costing a recipe at AP cost understates it
   * by exactly the trim.
   */
  yield_pct: z.number().min(1).max(100),
  allergens: z.array(Allergen),
  /** Base units currently in store. */
  on_hand: z.number().nonnegative(),
  /** Base units to keep on the shelf between deliveries. */
  par_level: z.number().nonnegative(),
  supplier: z.string().nullable(),
  /** Meat/poultry: the halal certificate check applies to its supplier. */
  halal_critical: z.boolean(),
})
export type Ingredient = z.infer<typeof Ingredient>

/* ── recipes ────────────────────────────────────────────────────── */

/**
 * A recipe line is either raw stock or another recipe.
 *
 * Sub-recipes are what make this a bill of materials rather than a shopping
 * list: a biryani references a spice mix which references cardamom, and the
 * purchase list has to see the cardamom. `explodeRecipe` walks the tree.
 */
export const RecipeLine = z.object({
  id: z.string(),
  kind: z.enum(["ingredient", "recipe"]),
  /** Ingredient id or recipe id, per `kind`. */
  ref: z.string(),
  /**
   * Quantity for ONE BATCH of the parent recipe, in the referent's base unit
   * (for a sub-recipe: in portions of it).
   */
  qty: z.number().nonnegative(),
})
export type RecipeLine = z.infer<typeof RecipeLine>

export const Recipe = z.object({
  id: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
  station: Station,
  service_temp: ServiceTemp,
  /** Portions ONE batch produces. Everything scales off this. */
  yield_portions: z.number().positive(),
  /** Grams (or ml) per portion — the spec the line checks plating against. */
  portion_size_g: z.number().positive(),
  /** Hands-on minutes per batch. Feeds the kitchen labour estimate. */
  prep_minutes: z.number().nonnegative(),
  /**
   * Hours the finished product may be held before service. Drives the
   * "cook this on the day" vs "this can be made ahead" split on the
   * production plan.
   */
  shelf_life_hours: z.number().positive(),
  lines: z.array(RecipeLine),
})
export type Recipe = z.infer<typeof Recipe>

/* ── menus ──────────────────────────────────────────────────────── */

export const MenuItem = z.object({
  id: z.string(),
  recipe: z.string(),
  /**
   * Portions of this dish per cover. Fractional on purpose: a shared mezze
   * plate between four is 0.25, and a buffet salad that half the room takes
   * is 0.5. Rounding these to 1 is the classic way a buffet menu over-costs.
   */
  portions_per_cover: z.number().positive(),
})
export type MenuItem = z.infer<typeof MenuItem>

export const Menu = z.object({
  id: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
  tier: MenuTier,
  meal_period: MealPeriod,
  items: z.array(MenuItem),
  /** What one cover sells for, before VAT. Null = not priced yet. */
  price_per_cover_sar: z.number().nonnegative().nullable(),
})
export type Menu = z.infer<typeof Menu>

/* ── contracts & service orders ─────────────────────────────────── */

export const ContractStatus = z.enum(["draft", "proposed", "signed", "cancelled"])
export type ContractStatusValue = z.infer<typeof ContractStatus>

export const Contract = z.object({
  id: z.string(),
  client_ar: z.string(),
  client_en: z.string(),
  contract_no: z.string(),
  starts_on: z.string(),
  ends_on: z.string(),
  /**
   * Covers the client committed to over the whole contract. The sum of the
   * service orders' billable covers is checked against it — the single most
   * common way a season goes wrong is orders quietly exceeding the commitment.
   */
  covers_committed: z.number().int().nonnegative(),
  status: ContractStatus,
})
export type Contract = z.infer<typeof Contract>

/**
 * Lifecycle of one meal service. `guaranteed` is a distinct state from
 * `confirmed` because the guarantee is a commercial event: once the client
 * gives a number, it becomes the billing floor and the kitchen may buy against
 * it. Before that the order is a forecast.
 */
export const OrderStatus = z.enum([
  "draft",
  "confirmed",
  "guaranteed",
  "produced",
  "served",
  "closed",
  "cancelled",
])
export type OrderStatusValue = z.infer<typeof OrderStatus>

/**
 * A service order — one menu, at one place, on one date, for one meal period.
 * This is the BEO: the single sheet the kitchen, the service team and the
 * invoice all read from.
 */
export const ServiceOrder = z.object({
  id: z.string(),
  contract: z.string(),
  /** ISO date of service. */
  serves_on: z.string(),
  /** 24h "HH:MM" — the moment food must be on the line. */
  serves_at: z.string(),
  meal_period: MealPeriod,
  service_style: ServiceStyle,
  menu: z.string().nullable(),
  site_ar: z.string(),
  site_en: z.string(),
  /** The planning number, from the contract or the client's estimate. */
  expected_covers: z.number().int().nonnegative(),
  /**
   * The number the client has committed to. Null until they give it. Once set
   * it is the billing floor and the production base.
   */
  guaranteed_covers: z.number().int().nonnegative().nullable(),
  /** Head count actually served. Null until after the event. */
  actual_covers: z.number().int().nonnegative().nullable(),
  status: OrderStatus,
  notes: z.string(),
})
export type ServiceOrder = z.infer<typeof ServiceOrder>

/* ── operating policy ───────────────────────────────────────────── */

/**
 * The numbers a caterer sets once and then runs the whole season against.
 * Every one of them is an input to the engine rather than a constant in it,
 * because they are exactly what changes between a hotel banquet operation and
 * a Hajj mass-feeding contract.
 */
export const Policy = z.object({
  /**
   * Hours before service by which the client must give a guarantee. Hotel
   * banquet desks work to 48–72; an independent caterer who shops for the
   * event needs 5–7 days.
   */
  guarantee_lead_hours: z.number().int().positive(),
  /**
   * Percent produced above the guarantee, so unexpected arrivals are fed. The
   * industry convention is to set ~5% over and never bill it unless it is
   * actually consumed.
   */
  overset_pct: z.number().min(0).max(50),
  /** Food cost as a share of revenue that the menus are engineered to hit. */
  target_food_cost_pct: z.number().min(1).max(100),
  /**
   * The unmodelled extras on every cover — bread, butter, condiments,
   * seasoning, oil. Added as a flat percentage of the raw plate cost because
   * itemising them costs more bookkeeping than it saves. Convention is 5–10%.
   */
  q_factor_pct: z.number().min(0).max(30),
  /** Portions one kitchen shift can physically produce in a day. */
  daily_capacity_covers: z.number().int().positive(),
  vat_pct: z.number().min(0).max(100),
})
export type Policy = z.infer<typeof Policy>

/**
 * Front-of-house cover per server, by service style. Plated service is
 * hands-on delivery to each seat; a buffet only needs the line replenished and
 * cleared, so it carries two to three times as many guests per server.
 */
export const STAFF_RATIOS: Record<ServiceStyleValue, { covers_per_server: number; covers_per_busser: number }> = {
  plated: { covers_per_server: 12, covers_per_busser: 24 },
  buffet: { covers_per_server: 25, covers_per_busser: 40 },
  boxed: { covers_per_server: 60, covers_per_busser: 0 },
  grab_and_go: { covers_per_server: 80, covers_per_busser: 0 },
}

export const Season = z.object({
  year_hijri: z.number().int(),
  year_gregorian: z.number().int(),
  starts_on: z.string(),
  ends_on: z.string(),
})
export type Season = z.infer<typeof Season>
