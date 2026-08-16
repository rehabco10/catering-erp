import type { Item, ItemVariant, Policy, Recipe, RecipeLine, Supplier } from "@/engine/schemas"
import { DOC_MENUS, DOC_RECIPES } from "./seed-packages"

/**
 * The starting draft: a real raw-material catalogue under the real packages.
 *
 * ── Where the numbers come from ──────────────────────────────────────
 * **Prices** are anchored to published Saudi figures for 2025 and then taken
 * down ~15% to a catering wholesale level — a kitchen buying 20 kg sacks does
 * not pay shelf price. Each variant is marked `sourced` or `estimated` in a
 * trailing comment; the sourced anchors are:
 *
 *   rice     GASTAT: basmati white Indian, 96.70 SAR / 10 kg (Nov 2025)
 *   flour    GASTAT: local white wheat flour, 4.63 SAR / 2 kg
 *   sugar    GASTAT: soft sugar, 40.05 SAR / 10 kg
 *   chicken  Saudi retail 2025: fresh chicken 16.50–17.75 SAR/kg
 *   lamb     Saudi retail 2025: minced lamb 34.95 SAR/kg
 *   tomato   Saudi retail 2025: local tomato ~1.90 SAR/kg on offer, 4–6 typical
 *
 * Everything else is a plausible market value standing in until real supplier
 * quotes arrive, and is marked as such.
 *
 * **Suppliers are fabricated.** Names, certificate numbers and lead times are
 * invented; only their shape is real. Nothing here is a commercial record.
 *
 * **Yields** are standard trim and cooking-loss figures from the costing
 * literature (`docs/catering-engine.md` §1), not measured in this kitchen.
 *
 * ── What is deliberately imperfect ───────────────────────────────────
 * So the checks page has real findings on first run:
 *   · chicken sits below par, and its costing basis comes from a supplier
 *     whose halal certificate has lapsed — with a certified frozen variant on
 *     file beside it
 *   · Arabic bread carries no purchase price
 *   · tomato is bought as boxes when the crate is cheaper per kilo
 */

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const TODAY = new Date()
/** `n` days from today, as an ISO date. Negative is in the past. */
export const day = (n: number) => iso(new Date(TODAY.getTime() + n * DAY))

export const SEED_POLICY: Policy = {
  target_food_cost_pct: 30,
  // Bread, condiments, oil and seasoning — the 5–10% that never reaches a
  // recipe card but is on every cover.
  q_factor_pct: 7,
  vat_pct: 15,
}

/* ── suppliers (fabricated) ─────────────────────────────────────── */

export const SEED_SUPPLIERS: Supplier[] = [
  { id: "sup_meat", name_ar: "الشركة الوطنية للحوم", name_en: "National Meat Company", categories: ["protein"], lead_time_days: 3, halal_cert_no: "SFDA-HL-22914", halal_cert_expiry: day(210) },
  // Lapsed. Every meat variant traced to this supplier is a blocking finding.
  { id: "sup_poultry", name_ar: "دواجن الطائف", name_en: "Taif Poultry", categories: ["protein"], lead_time_days: 2, halal_cert_no: "SFDA-HL-17330", halal_cert_expiry: day(-11) },
  { id: "sup_sea", name_ar: "أسماك البحر الأحمر", name_en: "Red Sea Seafood", categories: ["protein"], lead_time_days: 2, halal_cert_no: null, halal_cert_expiry: null },
  { id: "sup_produce", name_ar: "خضار الحرمين", name_en: "Haramain Produce", categories: ["produce"], lead_time_days: 1, halal_cert_no: null, halal_cert_expiry: null },
  { id: "sup_dry", name_ar: "مؤسسة المؤن للتموين", name_en: "Al-Moun Provisions", categories: ["dry_goods", "bakery", "disposable"], lead_time_days: 5, halal_cert_no: null, halal_cert_expiry: null },
  { id: "sup_dairy", name_ar: "ألبان الوادي", name_en: "Wadi Dairy", categories: ["dairy", "beverage"], lead_time_days: 2, halal_cert_no: null, halal_cert_expiry: null },
]

/* ── items ──────────────────────────────────────────────────────── */

const item = (
  id: string,
  name_ar: string,
  name_en: string,
  category: Item["category"],
  base_unit: Item["base_unit"],
  par_level: number,
  preferred_variant: string,
  extra: Partial<Item> = {},
): Item => ({
  id,
  name_ar,
  name_en,
  category,
  base_unit,
  allergens: [],
  halal_critical: false,
  par_level,
  preferred_variant,
  ...extra,
})

export const SEED_ITEMS: Item[] = [
  // proteins
  item("it_chicken", "دجاج", "Chicken", "protein", "kg", 150, "v_chicken_fresh", { halal_critical: true }),
  item("it_lamb", "لحم ضأن", "Lamb", "protein", "kg", 120, "v_lamb_frozen", { halal_critical: true }),
  item("it_beef", "لحم بقر", "Beef", "protein", "kg", 80, "v_beef", { halal_critical: true }),
  item("it_shrimp", "جمبري", "Shrimp", "protein", "kg", 30, "v_shrimp", { allergens: ["shellfish"] }),
  item("it_fish", "فيليه سمك", "Fish fillet", "protein", "kg", 40, "v_fish", { allergens: ["fish"] }),
  item("it_egg", "بيض", "Eggs", "protein", "ea", 900, "v_egg", { allergens: ["egg"] }),
  // produce
  item("it_tomato", "طماطم", "Tomato", "produce", "kg", 80, "v_tomato_box"),
  item("it_onion", "بصل", "Onion", "produce", "kg", 60, "v_onion"),
  item("it_cucumber", "خيار", "Cucumber", "produce", "kg", 60, "v_cucumber"),
  item("it_lettuce", "خس", "Lettuce", "produce", "kg", 30, "v_lettuce"),
  item("it_parsley", "بقدونس", "Parsley", "produce", "kg", 15, "v_parsley"),
  item("it_lemon", "ليمون", "Lemon", "produce", "kg", 25, "v_lemon"),
  item("it_eggplant", "باذنجان", "Aubergine", "produce", "kg", 30, "v_eggplant"),
  item("it_potato", "بطاطس", "Potato", "produce", "kg", 90, "v_potato"),
  item("it_garlic", "ثوم", "Garlic", "produce", "kg", 10, "v_garlic"),
  item("it_mushroom", "فطر", "Mushroom", "produce", "kg", 15, "v_mushroom"),
  // dairy
  item("it_yogurt", "لبن زبادي", "Yoghurt", "dairy", "l", 180, "v_yogurt", { allergens: ["dairy"] }),
  item("it_cream", "كريمة طبخ", "Cooking cream", "dairy", "l", 60, "v_cream", { allergens: ["dairy"] }),
  item("it_cheese", "جبن", "Cheese", "dairy", "kg", 40, "v_cheese", { allergens: ["dairy"] }),
  item("it_butter", "زبدة", "Butter", "dairy", "kg", 25, "v_butter", { allergens: ["dairy"] }),
  // dry goods
  item("it_rice", "أرز بسمتي", "Basmati rice", "dry_goods", "kg", 200, "v_rice_moun"),
  item("it_flour", "دقيق", "Wheat flour", "dry_goods", "kg", 150, "v_flour", { allergens: ["gluten"] }),
  item("it_sugar", "سكر", "Sugar", "dry_goods", "kg", 120, "v_sugar"),
  item("it_burghul", "برغل", "Bulgur", "dry_goods", "kg", 40, "v_burghul", { allergens: ["gluten"] }),
  item("it_chickpea", "حمص جاف", "Dry chickpeas", "dry_goods", "kg", 60, "v_chickpea"),
  item("it_tahini", "طحينة", "Tahini", "dry_goods", "kg", 20, "v_tahini", { allergens: ["sesame"] }),
  item("it_oil", "زيت نباتي", "Vegetable oil", "dry_goods", "l", 64, "v_oil"),
  item("it_spice", "بهارات مشكّلة", "Mixed spices", "dry_goods", "kg", 12, "v_spice"),
  item("it_cardamom", "هيل", "Cardamom", "dry_goods", "kg", 4, "v_cardamom"),
  item("it_dates", "تمر", "Dates", "dry_goods", "kg", 100, "v_dates"),
  item("it_nuts", "مكسرات", "Mixed nuts", "dry_goods", "kg", 20, "v_nuts", { allergens: ["nuts"] }),
  // bakery, beverage, disposables
  item("it_bread", "خبز عربي", "Arabic bread", "bakery", "ea", 1200, "v_bread", { allergens: ["gluten"] }),
  item("it_water", "مياه ٢٠٠ مل", "Water 200ml", "beverage", "ea", 4800, "v_water"),
  item("it_juice", "عصير", "Juice", "beverage", "ea", 960, "v_juice"),
  item("it_mealbox", "علبة وجبة", "Meal box", "disposable", "ea", 3000, "v_mealbox"),
]

/* ── purchase variants ──────────────────────────────────────────── */

const variant = (
  id: string,
  itemId: string,
  name_ar: string,
  name_en: string,
  supplier: string | null,
  pack_unit: ItemVariant["pack_unit"],
  pack_size: number,
  ap_cost_sar: number | null,
  yield_pct: number,
  storage: ItemVariant["storage"],
  on_hand: number,
): ItemVariant => ({
  id,
  item: itemId,
  name_ar,
  name_en,
  supplier,
  supplier_ref: null,
  pack_unit,
  pack_size,
  ap_cost_sar,
  yield_pct,
  storage,
  on_hand,
})

/**
 * Four items carry a second variant, each one there to make the model
 * demonstrate itself rather than to pad the list:
 *
 *   · **rice** — the healthy case: two suppliers, and the costing basis is
 *     already the cheaper per kilo, so nothing is flagged.
 *   · **chicken** — the argument for the whole item/variant split. The basis
 *     is fresh, from the supplier whose halal certificate has lapsed; a
 *     certified frozen variant sits beside it, so the blocking finding has a
 *     fix one radio button away.
 *   · **lamb** — fresh and frozen at different yields, so two ways of buying
 *     one item visibly cost different amounts per usable kilo.
 *   · **tomato** — the basis is the dearer of the two, which trips
 *     `item.cheaper_variant_available`.
 */
export const SEED_VARIANTS: ItemVariant[] = [
  // ── proteins ────────────────────────────────────────────────────
  variant("v_chicken_fresh", "it_chicken", "طازج — كرتون ١٠ كجم", "Fresh — 10 kg case", "sup_poultry", "case", 10, 155, 72, "chilled", 90), // sourced 15.50/kg
  variant("v_chicken_frozen", "it_chicken", "مجمّد — كرتون ١٢ كجم", "Frozen — 12 kg case", "sup_meat", "case", 12, 174, 74, "frozen", 0), // sourced 14.50/kg
  variant("v_lamb_frozen", "it_lamb", "مجمّد — كرتون ١٢ كجم", "Frozen — 12 kg case", "sup_meat", "case", 12, 390, 68, "frozen", 180), // sourced 32.50/kg
  variant("v_lamb_fresh", "it_lamb", "طازج — كرتون ١٠ كجم", "Fresh — 10 kg case", "sup_meat", "case", 10, 355, 74, "chilled", 0), // sourced 35.50/kg
  variant("v_beef", "it_beef", "كرتون ١٠ كجم", "10 kg case", "sup_meat", "case", 10, 320, 78, "frozen", 60), // estimated
  variant("v_shrimp", "it_shrimp", "كرتون ٥ كجم", "5 kg case", "sup_sea", "case", 5, 225, 65, "frozen", 20), // estimated
  variant("v_fish", "it_fish", "كرتون ٥ كجم", "5 kg case", "sup_sea", "case", 5, 190, 82, "frozen", 30), // estimated
  variant("v_egg", "it_egg", "طبق ٣٠ حبة", "Tray of 30", "sup_dairy", "tray", 30, 14, 88, "chilled", 600), // estimated
  // ── produce ─────────────────────────────────────────────────────
  variant("v_tomato_box", "it_tomato", "صندوق ٦ كجم", "6 kg box", "sup_produce", "box", 6, 26, 92, "chilled", 96), // sourced 4.33/kg
  variant("v_tomato_crate", "it_tomato", "قفص ١٥ كجم", "15 kg crate", "sup_produce", "box", 15, 60, 92, "chilled", 0), // sourced 4.00/kg
  variant("v_onion", "it_onion", "كيس ١٠ كجم", "10 kg sack", "sup_produce", "sack", 10, 32, 85, "dry", 140), // estimated
  variant("v_cucumber", "it_cucumber", "صندوق ٦ كجم", "6 kg box", "sup_produce", "box", 6, 24, 94, "chilled", 72), // estimated
  variant("v_lettuce", "it_lettuce", "صندوق ٥ كجم", "5 kg box", "sup_produce", "box", 5, 22, 70, "chilled", 25), // estimated
  variant("v_parsley", "it_parsley", "ربطة ١ كجم", "1 kg bunch", "sup_produce", "kg", 1, 9, 60, "chilled", 12), // estimated
  variant("v_lemon", "it_lemon", "صندوق ٥ كجم", "5 kg box", "sup_produce", "box", 5, 22, 45, "chilled", 20), // estimated
  variant("v_eggplant", "it_eggplant", "صندوق ٦ كجم", "6 kg box", "sup_produce", "box", 6, 22, 82, "chilled", 28), // estimated
  variant("v_potato", "it_potato", "كيس ١٠ كجم", "10 kg sack", "sup_produce", "sack", 10, 30, 81, "dry", 100), // estimated
  variant("v_garlic", "it_garlic", "كيس ٥ كجم", "5 kg sack", "sup_produce", "sack", 5, 55, 88, "dry", 8), // estimated
  variant("v_mushroom", "it_mushroom", "صندوق ٣ كجم", "3 kg box", "sup_produce", "box", 3, 42, 95, "chilled", 12), // estimated
  // ── dairy ───────────────────────────────────────────────────────
  variant("v_yogurt", "it_yogurt", "كرتون ١٢ لتر", "12 L case", "sup_dairy", "case", 12, 62, 100, "chilled", 240), // estimated
  variant("v_cream", "it_cream", "كرتون ١٢ لتر", "12 L case", "sup_dairy", "case", 12, 96, 100, "chilled", 48), // estimated
  variant("v_cheese", "it_cheese", "كرتون ٦ كجم", "6 kg case", "sup_dairy", "case", 6, 138, 100, "chilled", 30), // estimated
  variant("v_butter", "it_butter", "كرتون ٥ كجم", "5 kg case", "sup_dairy", "case", 5, 145, 100, "chilled", 20), // estimated
  // ── dry goods ───────────────────────────────────────────────────
  variant("v_rice_moun", "it_rice", "كيس ٢٠ كجم", "20 kg sack", "sup_dry", "sack", 20, 165, 100, "dry", 420), // sourced 8.25/kg
  variant("v_rice_alt", "it_rice", "كيس ١٠ كجم", "10 kg sack", "sup_produce", "sack", 10, 88, 100, "dry", 0), // sourced 8.80/kg
  variant("v_flour", "it_flour", "كيس ٢٥ كجم", "25 kg sack", "sup_dry", "sack", 25, 49, 100, "dry", 175), // sourced 1.96/kg
  variant("v_sugar", "it_sugar", "كيس ٢٥ كجم", "25 kg sack", "sup_dry", "sack", 25, 85, 100, "dry", 130), // sourced 3.40/kg
  variant("v_burghul", "it_burghul", "كيس ١٠ كجم", "10 kg sack", "sup_dry", "sack", 10, 48, 100, "dry", 45), // estimated
  variant("v_chickpea", "it_chickpea", "كيس ٢٥ كجم", "25 kg sack", "sup_dry", "sack", 25, 155, 100, "dry", 70), // estimated
  variant("v_tahini", "it_tahini", "صندوق ٥ كجم", "5 kg box", "sup_dry", "box", 5, 78, 100, "dry", 22), // estimated
  variant("v_oil", "it_oil", "صندوق ١٦ لتر", "16 L box", "sup_dry", "box", 16, 128, 100, "dry", 128), // estimated
  variant("v_spice", "it_spice", "كجم", "1 kg", "sup_dry", "kg", 1, 42, 100, "dry", 24), // estimated
  variant("v_cardamom", "it_cardamom", "كجم", "1 kg", "sup_dry", "kg", 1, 175, 100, "dry", 8), // estimated
  variant("v_dates", "it_dates", "صندوق ٥ كجم", "5 kg box", "sup_dry", "box", 5, 85, 96, "dry", 150), // estimated
  variant("v_nuts", "it_nuts", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 210, 100, "dry", 18), // estimated
  // ── bakery, beverage, disposables ───────────────────────────────
  // Unpriced on purpose — anything built on bread costs light until this is filled in.
  variant("v_bread", "it_bread", "صينية ١٠٠ رغيف", "Tray of 100", "sup_dry", "tray", 100, null, 100, "dry", 800),
  variant("v_water", "it_water", "كرتون ٤٨ حبة", "Case of 48", "sup_dairy", "case", 48, 11, 100, "dry", 9600), // estimated
  variant("v_juice", "it_juice", "كرتون ٢٤ حبة", "Case of 24", "sup_dairy", "case", 24, 40, 100, "chilled", 1440), // estimated
  variant("v_mealbox", "it_mealbox", "كرتون ٥٠٠ علبة", "Case of 500", "sup_dry", "case", 500, 240, 100, "dry", 4000), // estimated
]

/* ── a few real dishes, actually costed ─────────────────────────── */

/**
 * Bills of materials for six of the transcribed dishes.
 *
 * Keyed by the Arabic name rather than by recipe id: the ids come out of
 * `scripts/seed-from-docs.mjs` and shift the moment the source document
 * changes, whereas the name is what the document says.
 *
 * Six dishes across three sections — enough to prove the chain end to end
 * (item → variant → recipe → menu → food cost) at real prices. The other 113
 * stay drafts, which is the truth: nobody has costed them.
 *
 * Quantities are per batch, at the batch yield the generator assigned
 * (50 portions for appetisers, 40 for mains).
 */
const COSTED: Record<string, Array<[string, number]>> = {
  متبل: [["it_eggplant", 5], ["it_tahini", 0.6], ["it_lemon", 0.5], ["it_garlic", 0.1], ["it_oil", 0.3]],
  حمص: [["it_chickpea", 2.5], ["it_tahini", 0.8], ["it_lemon", 0.5], ["it_garlic", 0.12], ["it_oil", 0.4]],
  تبولة: [["it_parsley", 2], ["it_burghul", 0.8], ["it_tomato", 1.5], ["it_lemon", 0.6], ["it_oil", 0.35]],
  "سلطة خضراء": [["it_lettuce", 3], ["it_cucumber", 1.5], ["it_tomato", 1.5], ["it_onion", 0.4]],
  "سمبوسك لحم": [["it_flour", 2.2], ["it_beef", 2], ["it_onion", 0.8], ["it_oil", 1.2], ["it_spice", 0.08]],
  "رز كابلي باللحم": [["it_rice", 6], ["it_lamb", 7], ["it_onion", 1.2], ["it_tomato", 0.8], ["it_oil", 0.7], ["it_spice", 0.15], ["it_cardamom", 0.03]],
}

let lineSeq = 0
const linesFor = (name: string): RecipeLine[] =>
  (COSTED[name] ?? []).map(([ref, qty]) => ({
    id: `rl_seed_${lineSeq++}`,
    kind: "item" as const,
    ref,
    qty,
  }))

/* ── the catalogue ──────────────────────────────────────────────── */

/**
 * The 119 dish names transcribed from the client's package proposal, with a
 * bill of materials attached to the six that `COSTED` covers.
 *
 * The rest stay `draft: true` with no lines — which is what they are. A company
 * that lists ~120 dishes has most of them as a name on a package long before
 * anyone writes the recipe, and inventing ingredients to fill the gap would put
 * fabricated numbers in front of someone pricing a quote.
 */
export const SEED_RECIPES: Recipe[] = DOC_RECIPES.map((r) => {
  const lines = linesFor(r.name_ar)
  return lines.length > 0 ? { ...r, draft: false, lines } : r
})

export const SEED_MENUS = DOC_MENUS
