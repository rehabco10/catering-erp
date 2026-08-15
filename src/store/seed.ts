import type { Item, ItemVariant, Menu, Policy, Recipe, Supplier } from "@/engine/schemas"

/**
 * A worked catalogue, as the starting draft.
 *
 * Shaped after Hajj mass feeding rather than a wedding book: large-batch
 * dishes, thin margins, and suppliers whose certification actually matters.
 *
 * Several rows are deliberately imperfect, so the checks page has real
 * findings on first run rather than an empty state that proves nothing:
 *   · chicken sits below its par level, and its preferred purchase variant
 *     comes from a supplier whose halal certificate has lapsed — with a
 *     certified frozen variant on file beside it
 *   · Arabic bread carries no purchase price → the breakfast menu costs light
 *   · tomato is bought as boxes when the crate is cheaper per kilo
 *   · the premium lunch runs ~41% food cost against a 30% target
 *
 * The one date in here — the supplier certificate expiry — is generated
 * relative to today, so the lapsed-certificate finding never goes stale.
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

/* ── suppliers ──────────────────────────────────────────────────── */

export const SEED_SUPPLIERS: Supplier[] = [
  {
    id: "sup_meat",
    name_ar: "الشركة الوطنية للحوم",
    name_en: "National Meat Company",
    categories: ["protein"],
    lead_time_days: 3,
    halal_cert_no: "SFDA-HL-22914",
    halal_cert_expiry: day(210),
  },
  {
    id: "sup_poultry",
    name_ar: "دواجن الطائف",
    name_en: "Taif Poultry",
    categories: ["protein"],
    lead_time_days: 2,
    halal_cert_no: "SFDA-HL-17330",
    // Lapsed. Every meat line traced to this supplier is a blocking finding.
    halal_cert_expiry: day(-11),
  },
  {
    id: "sup_produce",
    name_ar: "خضار الحرمين",
    name_en: "Haramain Produce",
    categories: ["produce"],
    lead_time_days: 1,
    halal_cert_no: null,
    halal_cert_expiry: null,
  },
  {
    id: "sup_dry",
    name_ar: "مؤسسة المؤن للتموين",
    name_en: "Al-Moun Provisions",
    categories: ["dry_goods", "bakery", "disposable"],
    lead_time_days: 5,
    halal_cert_no: null,
    halal_cert_expiry: null,
  },
  {
    id: "sup_dairy",
    name_ar: "ألبان الوادي",
    name_en: "Wadi Dairy",
    categories: ["dairy", "beverage"],
    lead_time_days: 2,
    halal_cert_no: null,
    halal_cert_expiry: null,
  },
]

/* ── items ──────────────────────────────────────────────────────── */

/**
 * What recipes call for. Purchasing lives on the variants below.
 *
 * `preferred_variant` names the costing basis; the ids are stable strings
 * declared alongside the variants so the two lists cannot drift apart.
 */
export const SEED_ITEMS: Item[] = [
  { id: "it_rice", name_ar: "أرز بسمتي", name_en: "Basmati rice", category: "dry_goods", base_unit: "kg", allergens: [], halal_critical: false, par_level: 200, preferred_variant: "v_rice_moun" },
  { id: "it_chicken", name_ar: "دجاج", name_en: "Chicken", category: "protein", base_unit: "kg", allergens: [], halal_critical: true, par_level: 150, preferred_variant: "v_chicken_fresh" },
  { id: "it_lamb", name_ar: "لحم ضأن", name_en: "Lamb shoulder", category: "protein", base_unit: "kg", allergens: [], halal_critical: true, par_level: 120, preferred_variant: "v_lamb_frozen" },
  { id: "it_onion", name_ar: "بصل", name_en: "Onion", category: "produce", base_unit: "kg", allergens: [], halal_critical: false, par_level: 60, preferred_variant: "v_onion" },
  { id: "it_tomato", name_ar: "طماطم", name_en: "Tomato", category: "produce", base_unit: "kg", allergens: [], halal_critical: false, par_level: 80, preferred_variant: "v_tomato_box" },
  { id: "it_cucumber", name_ar: "خيار", name_en: "Cucumber", category: "produce", base_unit: "kg", allergens: [], halal_critical: false, par_level: 60, preferred_variant: "v_cucumber" },
  { id: "it_yogurt", name_ar: "لبن زبادي", name_en: "Yoghurt", category: "dairy", base_unit: "l", allergens: ["dairy"], halal_critical: false, par_level: 180, preferred_variant: "v_yogurt" },
  { id: "it_oil", name_ar: "زيت نباتي", name_en: "Vegetable oil", category: "dry_goods", base_unit: "l", allergens: [], halal_critical: false, par_level: 64, preferred_variant: "v_oil" },
  { id: "it_spice", name_ar: "بهارات مشكّلة", name_en: "Mixed spices", category: "dry_goods", base_unit: "kg", allergens: [], halal_critical: false, par_level: 12, preferred_variant: "v_spice" },
  { id: "it_cardamom", name_ar: "هيل", name_en: "Cardamom", category: "dry_goods", base_unit: "kg", allergens: [], halal_critical: false, par_level: 4, preferred_variant: "v_cardamom" },
  { id: "it_dates", name_ar: "تمر", name_en: "Dates", category: "dry_goods", base_unit: "kg", allergens: [], halal_critical: false, par_level: 100, preferred_variant: "v_dates" },
  { id: "it_bread", name_ar: "خبز عربي", name_en: "Arabic bread", category: "bakery", base_unit: "ea", allergens: ["gluten"], halal_critical: false, par_level: 1200, preferred_variant: "v_bread" },
  { id: "it_tahini", name_ar: "طحينة", name_en: "Tahini", category: "dry_goods", base_unit: "kg", allergens: ["sesame"], halal_critical: false, par_level: 20, preferred_variant: "v_tahini" },
  { id: "it_water", name_ar: "مياه ٢٠٠ مل", name_en: "Water 200ml", category: "beverage", base_unit: "ea", allergens: [], halal_critical: false, par_level: 4800, preferred_variant: "v_water" },
  { id: "it_juice", name_ar: "عصير", name_en: "Juice box", category: "beverage", base_unit: "ea", allergens: [], halal_critical: false, par_level: 960, preferred_variant: "v_juice" },
  { id: "it_mealbox", name_ar: "علبة وجبة", name_en: "Meal box", category: "disposable", base_unit: "ea", allergens: [], halal_critical: false, par_level: 3000, preferred_variant: "v_mealbox" },
]

/* ── purchase variants ──────────────────────────────────────────── */

/**
 * How each item is actually bought.
 *
 * Most items have one variant, because most of them genuinely do. Four carry a
 * second, and each of those exists to make the model demonstrate itself rather
 * than to pad the list:
 *
 *   · **rice** — the healthy case. Two suppliers, and the preferred one is
 *     already the cheaper per kilo, so nothing is flagged.
 *   · **chicken** — the point of the whole refactor. The preferred variant is
 *     fresh, from a supplier whose halal certificate has lapsed; a frozen
 *     variant from a certified supplier sits beside it. The blocking finding
 *     now has a fix that is one choice of costing basis away, rather than an
 *     edit that silently re-prices every recipe.
 *   · **lamb** — fresh and frozen at different yields, so two variants of one
 *     item visibly cost different amounts per usable kilo.
 *   · **tomato** — the preferred variant is the dearer one, which trips
 *     `item.cheaper_variant_available`.
 */
export const SEED_VARIANTS: ItemVariant[] = [
  // rice — preferred is also the cheapest per kg (4.80 vs 5.20)
  { id: "v_rice_moun", item: "it_rice", name_ar: "كيس ٢٠ كجم", name_en: "20 kg sack", supplier: "sup_dry", supplier_ref: "AM-RIC-20", pack_unit: "sack", pack_size: 20, ap_cost_sar: 96, yield_pct: 100, storage: "dry", on_hand: 420 },
  { id: "v_rice_haramain", item: "it_rice", name_ar: "كيس ١٠ كجم", name_en: "10 kg bag", supplier: "sup_produce", supplier_ref: null, pack_unit: "sack", pack_size: 10, ap_cost_sar: 52, yield_pct: 100, storage: "dry", on_hand: 0 },

  // chicken — preferred is fresh, whose supplier's certificate has lapsed
  { id: "v_chicken_fresh", item: "it_chicken", name_ar: "طازج — كرتون ١٠ كجم", name_en: "Fresh — 10 kg case", supplier: "sup_poultry", supplier_ref: "TP-FR-10", pack_unit: "case", pack_size: 10, ap_cost_sar: 185, yield_pct: 72, storage: "chilled", on_hand: 90 },
  { id: "v_chicken_frozen", item: "it_chicken", name_ar: "مجمّد — كرتون ١٢ كجم", name_en: "Frozen — 12 kg case", supplier: "sup_meat", supplier_ref: "NM-FZ-12", pack_unit: "case", pack_size: 12, ap_cost_sar: 210, yield_pct: 74, storage: "frozen", on_hand: 0 },

  // lamb — same item, two forms, different trim
  { id: "v_lamb_frozen", item: "it_lamb", name_ar: "مجمّد — كرتون ١٢ كجم", name_en: "Frozen — 12 kg case", supplier: "sup_meat", supplier_ref: "NM-LMB-12", pack_unit: "case", pack_size: 12, ap_cost_sar: 660, yield_pct: 68, storage: "frozen", on_hand: 180 },
  { id: "v_lamb_fresh", item: "it_lamb", name_ar: "طازج — كرتون ١٠ كجم", name_en: "Fresh — 10 kg case", supplier: "sup_meat", supplier_ref: "NM-LMB-10", pack_unit: "case", pack_size: 10, ap_cost_sar: 590, yield_pct: 74, storage: "chilled", on_hand: 0 },

  { id: "v_onion", item: "it_onion", name_ar: "كيس ١٠ كجم", name_en: "10 kg sack", supplier: "sup_produce", supplier_ref: null, pack_unit: "sack", pack_size: 10, ap_cost_sar: 28, yield_pct: 85, storage: "dry", on_hand: 140 },

  // tomato — preferred (5.00/kg) is dearer than the crate (4.60/kg)
  { id: "v_tomato_box", item: "it_tomato", name_ar: "صندوق ٦ كجم", name_en: "6 kg box", supplier: "sup_produce", supplier_ref: null, pack_unit: "box", pack_size: 6, ap_cost_sar: 30, yield_pct: 92, storage: "chilled", on_hand: 96 },
  { id: "v_tomato_crate", item: "it_tomato", name_ar: "قفص ١٥ كجم", name_en: "15 kg crate", supplier: "sup_produce", supplier_ref: null, pack_unit: "box", pack_size: 15, ap_cost_sar: 69, yield_pct: 92, storage: "chilled", on_hand: 0 },

  { id: "v_cucumber", item: "it_cucumber", name_ar: "صندوق ٦ كجم", name_en: "6 kg box", supplier: "sup_produce", supplier_ref: null, pack_unit: "box", pack_size: 6, ap_cost_sar: 26, yield_pct: 94, storage: "chilled", on_hand: 72 },
  { id: "v_yogurt", item: "it_yogurt", name_ar: "كرتون ١٢ لتر", name_en: "12 L case", supplier: "sup_dairy", supplier_ref: null, pack_unit: "case", pack_size: 12, ap_cost_sar: 66, yield_pct: 100, storage: "chilled", on_hand: 240 },
  { id: "v_oil", item: "it_oil", name_ar: "صندوق ١٦ لتر", name_en: "16 L box", supplier: "sup_dry", supplier_ref: null, pack_unit: "box", pack_size: 16, ap_cost_sar: 108, yield_pct: 100, storage: "dry", on_hand: 128 },
  { id: "v_spice", item: "it_spice", name_ar: "كجم", name_en: "1 kg", supplier: "sup_dry", supplier_ref: null, pack_unit: "kg", pack_size: 1, ap_cost_sar: 45, yield_pct: 100, storage: "dry", on_hand: 24 },
  { id: "v_cardamom", item: "it_cardamom", name_ar: "كجم", name_en: "1 kg", supplier: "sup_dry", supplier_ref: null, pack_unit: "kg", pack_size: 1, ap_cost_sar: 180, yield_pct: 100, storage: "dry", on_hand: 8 },
  { id: "v_dates", item: "it_dates", name_ar: "صندوق ٥ كجم", name_en: "5 kg box", supplier: "sup_dry", supplier_ref: null, pack_unit: "box", pack_size: 5, ap_cost_sar: 90, yield_pct: 96, storage: "dry", on_hand: 150 },
  // Unpriced on purpose: the breakfast menu costs light until this is filled in.
  { id: "v_bread", item: "it_bread", name_ar: "صينية ١٠٠ رغيف", name_en: "Tray of 100", supplier: "sup_dry", supplier_ref: null, pack_unit: "tray", pack_size: 100, ap_cost_sar: null, yield_pct: 100, storage: "dry", on_hand: 800 },
  { id: "v_tahini", item: "it_tahini", name_ar: "صندوق ٥ كجم", name_en: "5 kg box", supplier: "sup_dry", supplier_ref: null, pack_unit: "box", pack_size: 5, ap_cost_sar: 85, yield_pct: 100, storage: "dry", on_hand: 30 },
  { id: "v_water", item: "it_water", name_ar: "كرتون ٤٨ حبة", name_en: "Case of 48", supplier: "sup_dairy", supplier_ref: null, pack_unit: "case", pack_size: 48, ap_cost_sar: 12, yield_pct: 100, storage: "dry", on_hand: 9600 },
  { id: "v_juice", item: "it_juice", name_ar: "كرتون ٢٤ حبة", name_en: "Case of 24", supplier: "sup_dairy", supplier_ref: null, pack_unit: "case", pack_size: 24, ap_cost_sar: 42, yield_pct: 100, storage: "chilled", on_hand: 1440 },
  { id: "v_mealbox", item: "it_mealbox", name_ar: "كرتون ٥٠٠ علبة", name_en: "Case of 500", supplier: "sup_dry", supplier_ref: null, pack_unit: "case", pack_size: 500, ap_cost_sar: 250, yield_pct: 100, storage: "dry", on_hand: 4000 },
]

/* ── recipes ────────────────────────────────────────────────────── */

export const SEED_RECIPES: Recipe[] = [
  {
    // A sub-recipe: nothing serves it on its own, but three dishes pull it in,
    // and the cardamom in it has to reach the purchase list.
    id: "rec_spicemix", name_ar: "خلطة البهارات", name_en: "House spice mix",
    station: "assembly", service_temp: "ambient",
    yield_portions: 200, portion_size_g: 6, prep_minutes: 25, shelf_life_hours: 2160,
    lines: [
      { id: "rl_sm1", kind: "item", ref: "it_spice", qty: 0.9 },
      { id: "rl_sm2", kind: "item", ref: "it_cardamom", qty: 0.12 },
    ],
  },
  {
    id: "rec_kabsa", name_ar: "كبسة دجاج", name_en: "Chicken kabsa",
    station: "hot", service_temp: "hot",
    yield_portions: 40, portion_size_g: 450, prep_minutes: 95, shelf_life_hours: 4,
    lines: [
      { id: "rl_k1", kind: "item", ref: "it_rice", qty: 6 },
      { id: "rl_k2", kind: "item", ref: "it_chicken", qty: 9 },
      { id: "rl_k3", kind: "item", ref: "it_onion", qty: 1.5 },
      { id: "rl_k4", kind: "item", ref: "it_tomato", qty: 1.2 },
      { id: "rl_k5", kind: "item", ref: "it_oil", qty: 0.8 },
      { id: "rl_k6", kind: "recipe", ref: "rec_spicemix", qty: 40 },
    ],
  },
  {
    id: "rec_mandi", name_ar: "مندي لحم", name_en: "Lamb mandi",
    station: "hot", service_temp: "hot",
    yield_portions: 30, portion_size_g: 500, prep_minutes: 140, shelf_life_hours: 4,
    lines: [
      { id: "rl_m1", kind: "item", ref: "it_lamb", qty: 11 },
      { id: "rl_m2", kind: "item", ref: "it_rice", qty: 5 },
      { id: "rl_m3", kind: "item", ref: "it_oil", qty: 0.6 },
      { id: "rl_m4", kind: "recipe", ref: "rec_spicemix", qty: 30 },
    ],
  },
  {
    id: "rec_salad", name_ar: "سلطة عربية", name_en: "Arabic salad",
    station: "cold", service_temp: "cold",
    yield_portions: 50, portion_size_g: 120, prep_minutes: 45, shelf_life_hours: 8,
    lines: [
      { id: "rl_s1", kind: "item", ref: "it_tomato", qty: 3 },
      { id: "rl_s2", kind: "item", ref: "it_cucumber", qty: 3 },
      { id: "rl_s3", kind: "item", ref: "it_onion", qty: 0.6 },
      { id: "rl_s4", kind: "item", ref: "it_tahini", qty: 0.4 },
    ],
  },
  {
    id: "rec_yogurt", name_ar: "لبن", name_en: "Yoghurt cup",
    station: "cold", service_temp: "cold",
    yield_portions: 60, portion_size_g: 150, prep_minutes: 20, shelf_life_hours: 12,
    lines: [{ id: "rl_y1", kind: "item", ref: "it_yogurt", qty: 9 }],
  },
  {
    id: "rec_dates", name_ar: "طبق تمر", name_en: "Dates plate",
    station: "cold", service_temp: "ambient",
    yield_portions: 100, portion_size_g: 40, prep_minutes: 15, shelf_life_hours: 720,
    lines: [{ id: "rl_d1", kind: "item", ref: "it_dates", qty: 4.2 }],
  },
  {
    id: "rec_bread", name_ar: "خبز", name_en: "Bread service",
    station: "bakery", service_temp: "ambient",
    yield_portions: 100, portion_size_g: 90, prep_minutes: 10, shelf_life_hours: 20,
    lines: [{ id: "rl_b1", kind: "item", ref: "it_bread", qty: 100 }],
  },
  {
    id: "rec_water", name_ar: "مياه", name_en: "Bottled water",
    station: "beverage", service_temp: "cold",
    yield_portions: 100, portion_size_g: 200, prep_minutes: 5, shelf_life_hours: 8760,
    lines: [{ id: "rl_w1", kind: "item", ref: "it_water", qty: 100 }],
  },
  {
    id: "rec_juice", name_ar: "عصير", name_en: "Juice service",
    station: "beverage", service_temp: "cold",
    yield_portions: 100, portion_size_g: 200, prep_minutes: 5, shelf_life_hours: 2160,
    lines: [{ id: "rl_j1", kind: "item", ref: "it_juice", qty: 100 }],
  },
  {
    id: "rec_boxing", name_ar: "تعبئة الوجبة", name_en: "Meal boxing",
    station: "assembly", service_temp: "ambient",
    yield_portions: 100, portion_size_g: 0, prep_minutes: 60, shelf_life_hours: 8760,
    lines: [{ id: "rl_x1", kind: "item", ref: "it_mealbox", qty: 100 }],
  },
]

/* ── menus ──────────────────────────────────────────────────────── */

export const SEED_MENUS: Menu[] = [
  {
    id: "menu_breakfast", name_ar: "فطور أساسي", name_en: "Standard breakfast",
    tier: "economy", meal_period: "breakfast", price_per_cover_sar: 19,
    items: [
      { id: "mi_bf1", recipe: "rec_bread", portions_per_cover: 1 },
      { id: "mi_bf2", recipe: "rec_yogurt", portions_per_cover: 1 },
      { id: "mi_bf3", recipe: "rec_dates", portions_per_cover: 1 },
      { id: "mi_bf4", recipe: "rec_water", portions_per_cover: 1 },
      { id: "mi_bf5", recipe: "rec_boxing", portions_per_cover: 1 },
    ],
  },
  {
    id: "menu_lunch_std", name_ar: "غداء قياسي", name_en: "Standard lunch",
    tier: "standard", meal_period: "lunch", price_per_cover_sar: 46,
    items: [
      { id: "mi_ls1", recipe: "rec_kabsa", portions_per_cover: 1 },
      { id: "mi_ls2", recipe: "rec_salad", portions_per_cover: 1 },
      { id: "mi_ls3", recipe: "rec_dates", portions_per_cover: 0.5 },
      { id: "mi_ls4", recipe: "rec_water", portions_per_cover: 1 },
    ],
  },
  {
    id: "menu_lunch_prem", name_ar: "غداء مميز", name_en: "Premium lunch",
    tier: "premium", meal_period: "lunch",
    // Lands at ~41% food cost against a 30% target — lamb at 68% yield is what
    // does it. The menus page flags it and «تسعير على المستهدف» fixes it.
    price_per_cover_sar: 89,
    items: [
      { id: "mi_lp1", recipe: "rec_mandi", portions_per_cover: 1 },
      { id: "mi_lp2", recipe: "rec_salad", portions_per_cover: 1 },
      { id: "mi_lp3", recipe: "rec_dates", portions_per_cover: 1 },
      { id: "mi_lp4", recipe: "rec_juice", portions_per_cover: 1 },
    ],
  },
  {
    id: "menu_dinner", name_ar: "عشاء خفيف", name_en: "Light dinner",
    tier: "economy", meal_period: "dinner",
    // Sits on target at ~29%, as the counter-example: not every menu is a
    // finding, and an empty checks page has to be reachable.
    price_per_cover_sar: 27,
    items: [
      { id: "mi_dn1", recipe: "rec_kabsa", portions_per_cover: 0.8 },
      { id: "mi_dn2", recipe: "rec_salad", portions_per_cover: 1 },
      { id: "mi_dn3", recipe: "rec_water", portions_per_cover: 1 },
      { id: "mi_dn4", recipe: "rec_boxing", portions_per_cover: 1 },
    ],
  },
]
