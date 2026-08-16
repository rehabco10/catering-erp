import { z } from "zod"

/**
 * The domain, as schemas.
 *
 * Scope is the raw-to-menu chain and the stock behind it — nothing else:
 *
 *   supplier → item → variant → recipe ⇄ sub-recipe → menu → package
 *
 * Every field here exists because some downstream calculation needs it; see
 * `docs/catering-engine.md` for the sourcing of each rule. Anything a caterer
 * *would* keep but nothing computes is deliberately absent.
 *
 * The commercial and operations half — contracts, service orders, guarantees,
 * production plans, staffing — lived here until the slim/mvp cut and is on
 * `main` if it is wanted back.
 *
 * Pure module — no React, no i18next — so the engine, the store and the node
 * tests can all read it.
 */

/* ── shared vocabulary ──────────────────────────────────────────── */

/** The physical unit an ingredient is measured in once it is in the kitchen. */
export const BaseUnit = z.enum(["kg", "l", "ea"])
export type BaseUnitValue = z.infer<typeof BaseUnit>

/**
 * How a purchase is packed. `pack_size` converts it to base units — a caterer
 * buys a 20 kg sack, not 20 separate kilos, and a reorder has to round up to
 * whole packs or it produces an order the supplier cannot fill.
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
 * The nine allergens that have to be declared. A flat enum rather than free
 * text so a menu can be checked mechanically against a stated restriction.
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

/** Where a recipe is produced. */
export const Station = z.enum(["hot", "cold", "bakery", "beverage", "assembly"])
export type StationValue = z.infer<typeof Station>

/** Holding temperature — the axis every food-safety rule turns on. */
export const ServiceTemp = z.enum(["hot", "cold", "ambient"])
export type ServiceTempValue = z.infer<typeof ServiceTemp>

export const MealPeriod = z.enum(["breakfast", "lunch", "dinner", "snack"])
export type MealPeriodValue = z.infer<typeof MealPeriod>

/**
 * How the food reaches the guest.
 *
 * Not four styles of one thing — each is its own production and handling chain
 * (see `docs/source/company-profile.md`), which is why it is a field rather
 * than a note. Frozen in particular runs pack → store → thaw → reheat, and dry
 * skips refrigeration entirely.
 */
export const ServiceLine = z.enum(["buffet", "traditional", "frozen", "dry", "station"])
export type ServiceLineValue = z.infer<typeof ServiceLine>

/**
 * Where a dish sits on the buffet.
 *
 * The sections the packages are actually written in — see
 * `docs/source/buffet-packages.md`. This is a *menu* concern, not a kitchen
 * one: the same dish can be a main in one package and part of a station in
 * another, so the course lives on the menu item and `Station` stays on the
 * recipe.
 */
export const MenuCourse = z.enum([
  "cold_appetiser",
  "hot_appetiser",
  "main",
  "dessert",
  "bread",
  "beverage",
  /** The box, tray or wrap. Not a dish, but a real cost on every boxed cover. */
  "packaging",
])
export type MenuCourseValue = z.infer<typeof MenuCourse>

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

/* ── items and their purchase variants ──────────────────────────── */

/**
 * What a recipe consumes — a kitchen fact.
 *
 * Deliberately carries nothing about buying. Supplier, pack, price, yield and
 * stock all differ per purchase option, which is why they live on the variant:
 * flattening them onto the item is what made a second source impossible and
 * pinned the yield to the wrong thing (whole chicken trims to ~72%, boned
 * breast to ~98% — same item, different form).
 */
export const Item = z.object({
  id: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
  category: IngredientCategory,
  /** The unit recipes are written in. */
  base_unit: BaseUnit,
  /** A property of the food, not of the pack. */
  allergens: z.array(Allergen),
  /** Meat/poultry: the halal certificate check applies to each variant's supplier. */
  halal_critical: z.boolean(),
  /**
   * Base units to keep on the shelf between deliveries, summed across every
   * variant. The kitchen runs out of *rice*, not of *Al-Moun rice*.
   */
  par_level: z.number().nonnegative(),
  /**
   * The variant that prices this item, chosen explicitly.
   *
   * Deterministic and auditable: a recipe's cost changes only when someone
   * decides it does. A "cheapest wins" rule would silently re-cost every menu
   * that touches the item the moment a supplier lists a cheap SKU — and menu
   * prices are quoted to clients. `cheaperVariantAvailable` surfaces the
   * better option instead of applying it.
   */
  preferred_variant: z.string().nullable(),
})
export type Item = z.infer<typeof Item>

/**
 * What you buy — a purchasing fact.
 *
 * One item, many variants: Al-Moun's 20 kg sack and Haramain's 10 kg bag are
 * both basmati rice; fresh and frozen lamb are both lamb.
 */
export const ItemVariant = z.object({
  id: z.string(),
  item: z.string(),
  /** How this option is known, e.g. «كيس ٢٠ كجم» / "20 kg sack". */
  name_ar: z.string(),
  name_en: z.string(),
  supplier: z.string().nullable(),
  /** The supplier's own code. Groundwork for purchase orders; nothing reads it yet. */
  supplier_ref: z.string().nullable(),
  /** The unit it is bought in, and how many base units one pack holds. */
  pack_unit: PackUnit,
  pack_size: z.number().positive(),
  /** As-purchased cost of ONE PACK, in SAR. Null while unpriced. */
  ap_cost_sar: z.number().nonnegative().nullable(),
  /**
   * Usable share after trimming, peeling, boning, draining or cooking loss,
   * as a percentage. 100 = no loss. This is what turns an as-purchased price
   * into an edible-portion price; costing at AP cost understates it by exactly
   * the trim.
   */
  yield_pct: z.number().min(1).max(100),
  /** Fresh and frozen are two variants of one item, so storage belongs here. */
  storage: StorageClass,
  /** Base units of this variant currently in store. */
  on_hand: z.number().nonnegative(),
})
export type ItemVariant = z.infer<typeof ItemVariant>

/* ── recipes ────────────────────────────────────────────────────── */

/**
 * A recipe line is either raw stock or another recipe.
 *
 * Sub-recipes are what make this a bill of materials rather than a shopping
 * list: a biryani references a spice mix which references cardamom, and the
 * costing has to see the cardamom. `explodeRecipe` walks the tree.
 */
export const RecipeLine = z.object({
  id: z.string(),
  kind: z.enum(["item", "recipe"]),
  /**
   * Item id or recipe id, per `kind`. Never a variant id: a recipe calls for
   * rice, and which rice it is priced through is the item's decision.
   */
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
  /** Hands-on minutes per batch. */
  prep_minutes: z.number().nonnegative(),
  /** Hours the finished product may be held before service. */
  shelf_life_hours: z.number().positive(),
  /**
   * A name imported from the catalogue that nobody has costed yet.
   *
   * The company lists ~120 dishes; most of them exist as a name on a package
   * long before anyone writes the bill of materials. A draft with no lines is
   * honest incomplete data, so it warns; a *non*-draft with no lines is a
   * recipe someone emptied, which blocks.
   */
  draft: z.boolean(),
  lines: z.array(RecipeLine),
})
export type Recipe = z.infer<typeof Recipe>

/* ── menus ──────────────────────────────────────────────────────── */

export const MenuItem = z.object({
  id: z.string(),
  recipe: z.string(),
  /** Which section of the buffet this dish is laid out in. */
  course: MenuCourse,
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
  service_line: ServiceLine,
  /**
   * Package number, 1–4, ascending in richness — the ladder the buffet
   * packages are actually sold on. Null for anything that is not a numbered
   * package, such as the whole-lamb station.
   *
   * Replaces an economy/standard/premium tier, which was invented: the real
   * range has four levels and they are named by number.
   */
  level: z.number().int().min(1).nullable(),
  /**
   * Null where the package is not tied to one — a buffet package is sold by
   * occasion, not by breakfast/lunch/dinner. Hotel catering does use it.
   */
  meal_period: MealPeriod.nullable(),
  items: z.array(MenuItem),
  /**
   * Non-food service inclusions: tables, tablecloths, cutlery, napkins,
   * towels. Free text because they are quoted as a list, not costed as a bill
   * of materials — the whole-lamb station is defined almost entirely by these.
   */
  inclusions: z.array(z.string()),
  /** What one cover sells for, before VAT. Null = not priced yet. */
  price_per_cover_sar: z.number().nonnegative().nullable(),
})
export type Menu = z.infer<typeof Menu>

/* ── operating policy ───────────────────────────────────────────── */

/**
 * The numbers set once that the whole catalogue is costed against. Engine
 * inputs rather than constants, because they are exactly what changes between
 * one operation and another.
 */
export const Policy = z.object({
  /** Food cost as a share of revenue that the menus are engineered to hit. */
  target_food_cost_pct: z.number().min(1).max(100),
  /**
   * The unmodelled extras on every cover — bread, butter, condiments,
   * seasoning, oil. Added as a flat percentage of raw plate cost because
   * itemising them costs more bookkeeping than it saves. Convention is 5–10%.
   */
  q_factor_pct: z.number().min(0).max(30),
  vat_pct: z.number().min(0).max(100),
})
export type Policy = z.infer<typeof Policy>
