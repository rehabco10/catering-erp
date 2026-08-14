import type {
  Contract,
  Ingredient,
  Menu,
  Policy,
  Recipe,
  Season,
  ServiceOrder,
  Supplier,
} from "@/lib/schemas"

/**
 * A worked season, as the starting draft.
 *
 * Shaped after a Hajj mass-feeding contract rather than a wedding book: a few
 * very large service orders a day, boxed and buffet, against two client
 * contracts with committed cover counts. That is the harder case — the
 * economics are thin, the guarantees are contractual, and a missed procurement
 * lead time cannot be fixed by a trip to the market.
 *
 * Several rows are deliberately imperfect, so the validation page has real
 * findings on first run rather than an empty state that proves nothing:
 *   · fresh chicken sits below its par level, from a supplier whose halal
 *     certificate has lapsed  → a blocking compliance finding
 *   · Arabic bread carries no purchase price → the breakfast menu costs light
 *   · the premium lunch runs ~41% food cost against a 30% target
 *   · one imminent service still has no guarantee from the client
 *   · tomorrow's two services together exceed the kitchen's daily capacity
 *   · a short-lead chilled item for tomorrow was already due to be ordered
 *
 * Dates are generated relative to today so the seed never goes stale.
 */

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const TODAY = new Date()
/** `n` days from today, as an ISO date. Negative is in the past. */
export const day = (n: number) => iso(new Date(TODAY.getTime() + n * DAY))

export const SEED_SEASON: Season = {
  year_hijri: 1448,
  year_gregorian: 2026,
  starts_on: day(-20),
  ends_on: day(40),
}

export const SEED_POLICY: Policy = {
  // 72 hours: the hotel-banquet convention, and enough for a kitchen drawing on
  // standing supply. An operation that shops per event needs 5–7 days here.
  guarantee_lead_hours: 72,
  // Set ~5% over the guarantee, bill it only if consumed.
  overset_pct: 5,
  target_food_cost_pct: 30,
  // Bread, condiments, oil and seasoning — the 5–10% that never reaches a
  // recipe card but is on every cover.
  q_factor_pct: 7,
  daily_capacity_covers: 6000,
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

/* ── ingredients ────────────────────────────────────────────────── */

export const SEED_INGREDIENTS: Ingredient[] = [
  {
    id: "ing_rice", name_ar: "أرز بسمتي", name_en: "Basmati rice",
    category: "dry_goods", storage: "dry", base_unit: "kg",
    pack_unit: "sack", pack_size: 20, ap_cost_sar: 96,
    yield_pct: 100, allergens: [], on_hand: 420, par_level: 200,
    supplier: "sup_dry", halal_critical: false,
  },
  {
    id: "ing_chicken", name_ar: "دجاج طازج", name_en: "Fresh chicken",
    category: "protein", storage: "chilled", base_unit: "kg",
    pack_unit: "case", pack_size: 10, ap_cost_sar: 185,
    // Whole bird to boneless portions: roughly a quarter is lost to bone and trim.
    yield_pct: 72, allergens: [], on_hand: 90, par_level: 150,
    supplier: "sup_poultry", halal_critical: true,
  },
  {
    id: "ing_lamb", name_ar: "لحم ضأن", name_en: "Lamb shoulder",
    category: "protein", storage: "frozen", base_unit: "kg",
    pack_unit: "case", pack_size: 12, ap_cost_sar: 660,
    yield_pct: 68, allergens: [], on_hand: 180, par_level: 120,
    supplier: "sup_meat", halal_critical: true,
  },
  {
    id: "ing_onion", name_ar: "بصل", name_en: "Onion",
    category: "produce", storage: "dry", base_unit: "kg",
    pack_unit: "sack", pack_size: 10, ap_cost_sar: 28,
    yield_pct: 85, allergens: [], on_hand: 140, par_level: 60,
    supplier: "sup_produce", halal_critical: false,
  },
  {
    id: "ing_tomato", name_ar: "طماطم", name_en: "Tomato",
    category: "produce", storage: "chilled", base_unit: "kg",
    pack_unit: "box", pack_size: 6, ap_cost_sar: 30,
    yield_pct: 92, allergens: [], on_hand: 96, par_level: 80,
    supplier: "sup_produce", halal_critical: false,
  },
  {
    id: "ing_cucumber", name_ar: "خيار", name_en: "Cucumber",
    category: "produce", storage: "chilled", base_unit: "kg",
    pack_unit: "box", pack_size: 6, ap_cost_sar: 26,
    yield_pct: 94, allergens: [], on_hand: 72, par_level: 60,
    supplier: "sup_produce", halal_critical: false,
  },
  {
    id: "ing_yogurt", name_ar: "لبن زبادي", name_en: "Yoghurt",
    category: "dairy", storage: "chilled", base_unit: "l",
    pack_unit: "case", pack_size: 12, ap_cost_sar: 66,
    yield_pct: 100, allergens: ["dairy"], on_hand: 240, par_level: 180,
    supplier: "sup_dairy", halal_critical: false,
  },
  {
    id: "ing_oil", name_ar: "زيت نباتي", name_en: "Vegetable oil",
    category: "dry_goods", storage: "dry", base_unit: "l",
    pack_unit: "box", pack_size: 16, ap_cost_sar: 108,
    yield_pct: 100, allergens: [], on_hand: 128, par_level: 64,
    supplier: "sup_dry", halal_critical: false,
  },
  {
    id: "ing_spice", name_ar: "بهارات مشكّلة", name_en: "Mixed spices",
    category: "dry_goods", storage: "dry", base_unit: "kg",
    pack_unit: "kg", pack_size: 1, ap_cost_sar: 45,
    yield_pct: 100, allergens: [], on_hand: 24, par_level: 12,
    supplier: "sup_dry", halal_critical: false,
  },
  {
    id: "ing_cardamom", name_ar: "هيل", name_en: "Cardamom",
    category: "dry_goods", storage: "dry", base_unit: "kg",
    pack_unit: "kg", pack_size: 1, ap_cost_sar: 180,
    yield_pct: 100, allergens: [], on_hand: 8, par_level: 4,
    supplier: "sup_dry", halal_critical: false,
  },
  {
    id: "ing_dates", name_ar: "تمر", name_en: "Dates",
    category: "dry_goods", storage: "dry", base_unit: "kg",
    pack_unit: "box", pack_size: 5, ap_cost_sar: 90,
    yield_pct: 96, allergens: [], on_hand: 150, par_level: 100,
    supplier: "sup_dry", halal_critical: false,
  },
  {
    id: "ing_bread", name_ar: "خبز عربي", name_en: "Arabic bread",
    category: "bakery", storage: "dry", base_unit: "ea",
    pack_unit: "tray", pack_size: 100,
    // Unpriced on purpose: the breakfast menu costs light until this is filled in.
    ap_cost_sar: null,
    yield_pct: 100, allergens: ["gluten"], on_hand: 800, par_level: 1200,
    supplier: "sup_dry", halal_critical: false,
  },
  {
    id: "ing_tahini", name_ar: "طحينة", name_en: "Tahini",
    category: "dry_goods", storage: "dry", base_unit: "kg",
    pack_unit: "box", pack_size: 5, ap_cost_sar: 85,
    yield_pct: 100, allergens: ["sesame"], on_hand: 30, par_level: 20,
    supplier: "sup_dry", halal_critical: false,
  },
  {
    id: "ing_water", name_ar: "مياه ٢٠٠ مل", name_en: "Water 200ml",
    category: "beverage", storage: "dry", base_unit: "ea",
    pack_unit: "case", pack_size: 48, ap_cost_sar: 12,
    yield_pct: 100, allergens: [], on_hand: 9600, par_level: 4800,
    supplier: "sup_dairy", halal_critical: false,
  },
  {
    id: "ing_juice", name_ar: "عصير", name_en: "Juice box",
    category: "beverage", storage: "chilled", base_unit: "ea",
    pack_unit: "case", pack_size: 24, ap_cost_sar: 42,
    yield_pct: 100, allergens: [], on_hand: 1440, par_level: 960,
    supplier: "sup_dairy", halal_critical: false,
  },
  {
    id: "ing_mealbox", name_ar: "علبة وجبة", name_en: "Meal box",
    category: "disposable", storage: "dry", base_unit: "ea",
    pack_unit: "case", pack_size: 500, ap_cost_sar: 250,
    yield_pct: 100, allergens: [], on_hand: 4000, par_level: 3000,
    supplier: "sup_dry", halal_critical: false,
  },
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
      { id: "rl_sm1", kind: "ingredient", ref: "ing_spice", qty: 0.9 },
      { id: "rl_sm2", kind: "ingredient", ref: "ing_cardamom", qty: 0.12 },
    ],
  },
  {
    id: "rec_kabsa", name_ar: "كبسة دجاج", name_en: "Chicken kabsa",
    station: "hot", service_temp: "hot",
    yield_portions: 40, portion_size_g: 450, prep_minutes: 95, shelf_life_hours: 4,
    lines: [
      { id: "rl_k1", kind: "ingredient", ref: "ing_rice", qty: 6 },
      { id: "rl_k2", kind: "ingredient", ref: "ing_chicken", qty: 9 },
      { id: "rl_k3", kind: "ingredient", ref: "ing_onion", qty: 1.5 },
      { id: "rl_k4", kind: "ingredient", ref: "ing_tomato", qty: 1.2 },
      { id: "rl_k5", kind: "ingredient", ref: "ing_oil", qty: 0.8 },
      { id: "rl_k6", kind: "recipe", ref: "rec_spicemix", qty: 40 },
    ],
  },
  {
    id: "rec_mandi", name_ar: "مندي لحم", name_en: "Lamb mandi",
    station: "hot", service_temp: "hot",
    yield_portions: 30, portion_size_g: 500, prep_minutes: 140, shelf_life_hours: 4,
    lines: [
      { id: "rl_m1", kind: "ingredient", ref: "ing_lamb", qty: 11 },
      { id: "rl_m2", kind: "ingredient", ref: "ing_rice", qty: 5 },
      { id: "rl_m3", kind: "ingredient", ref: "ing_oil", qty: 0.6 },
      { id: "rl_m4", kind: "recipe", ref: "rec_spicemix", qty: 30 },
    ],
  },
  {
    id: "rec_salad", name_ar: "سلطة عربية", name_en: "Arabic salad",
    station: "cold", service_temp: "cold",
    yield_portions: 50, portion_size_g: 120, prep_minutes: 45, shelf_life_hours: 8,
    lines: [
      { id: "rl_s1", kind: "ingredient", ref: "ing_tomato", qty: 3 },
      { id: "rl_s2", kind: "ingredient", ref: "ing_cucumber", qty: 3 },
      { id: "rl_s3", kind: "ingredient", ref: "ing_onion", qty: 0.6 },
      { id: "rl_s4", kind: "ingredient", ref: "ing_tahini", qty: 0.4 },
    ],
  },
  {
    id: "rec_yogurt", name_ar: "لبن", name_en: "Yoghurt cup",
    station: "cold", service_temp: "cold",
    yield_portions: 60, portion_size_g: 150, prep_minutes: 20, shelf_life_hours: 12,
    lines: [{ id: "rl_y1", kind: "ingredient", ref: "ing_yogurt", qty: 9 }],
  },
  {
    id: "rec_dates", name_ar: "طبق تمر", name_en: "Dates plate",
    station: "cold", service_temp: "ambient",
    yield_portions: 100, portion_size_g: 40, prep_minutes: 15, shelf_life_hours: 720,
    lines: [{ id: "rl_d1", kind: "ingredient", ref: "ing_dates", qty: 4.2 }],
  },
  {
    id: "rec_bread", name_ar: "خبز", name_en: "Bread service",
    station: "bakery", service_temp: "ambient",
    yield_portions: 100, portion_size_g: 90, prep_minutes: 10, shelf_life_hours: 20,
    lines: [{ id: "rl_b1", kind: "ingredient", ref: "ing_bread", qty: 100 }],
  },
  {
    id: "rec_water", name_ar: "مياه", name_en: "Bottled water",
    station: "beverage", service_temp: "cold",
    yield_portions: 100, portion_size_g: 200, prep_minutes: 5, shelf_life_hours: 8760,
    lines: [{ id: "rl_w1", kind: "ingredient", ref: "ing_water", qty: 100 }],
  },
  {
    id: "rec_juice", name_ar: "عصير", name_en: "Juice service",
    station: "beverage", service_temp: "cold",
    yield_portions: 100, portion_size_g: 200, prep_minutes: 5, shelf_life_hours: 2160,
    lines: [{ id: "rl_j1", kind: "ingredient", ref: "ing_juice", qty: 100 }],
  },
  {
    id: "rec_boxing", name_ar: "تعبئة الوجبة", name_en: "Meal boxing",
    station: "assembly", service_temp: "ambient",
    yield_portions: 100, portion_size_g: 0, prep_minutes: 60, shelf_life_hours: 8760,
    lines: [{ id: "rl_x1", kind: "ingredient", ref: "ing_mealbox", qty: 100 }],
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

/* ── contracts ──────────────────────────────────────────────────── */

export const SEED_CONTRACTS: Contract[] = [
  {
    id: "ct_arab", client_ar: "مؤسسة مطوفي حجاج الدول العربية",
    client_en: "Arab Countries Pilgrims Establishment",
    contract_no: "REH-1448-011",
    starts_on: day(-18), ends_on: day(30),
    covers_committed: 42000, status: "signed",
  },
  {
    id: "ct_ithraa", client_ar: "شركة إثراء الخير",
    client_en: "Ithraa Alkhair Company",
    contract_no: "REH-1448-024",
    starts_on: day(-6), ends_on: day(26),
    covers_committed: 12000, status: "signed",
  },
]

/* ── service orders ─────────────────────────────────────────────── */

/**
 * Two weeks of the book, straddling today so every guarantee state is
 * represented: closed services behind, a locked one tomorrow, an unguaranteed
 * one inside the 72-hour cutoff (overdue), and forecast-only work further out.
 */
function order(
  id: string,
  contract: string,
  offset: number,
  time: string,
  meal: ServiceOrder["meal_period"],
  style: ServiceOrder["service_style"],
  menu: string,
  site: [string, string],
  expected: number,
  guaranteed: number | null,
  actual: number | null,
  status: ServiceOrder["status"],
  notes = "",
): ServiceOrder {
  return {
    id, contract, serves_on: day(offset), serves_at: time,
    meal_period: meal, service_style: style, menu,
    site_ar: site[0], site_en: site[1],
    expected_covers: expected, guaranteed_covers: guaranteed,
    actual_covers: actual, status, notes,
  }
}

const MINA: [string, string] = ["مخيم منى — قطاع ٣", "Mina Camp — Sector 3"]
const AZIZ: [string, string] = ["مقر العزيزية", "Aziziyah Compound"]
const MADI: [string, string] = ["سكن المدينة", "Madinah Residence"]

export const SEED_ORDERS: ServiceOrder[] = [
  // ── behind us: counted and closed ──────────────────────────────
  order("so_101", "ct_arab", -5, "06:30", "breakfast", "boxed", "menu_breakfast", MADI, 2800, 2750, 2731, "closed"),
  order("so_102", "ct_arab", -5, "13:00", "lunch", "buffet", "menu_lunch_std", MADI, 2800, 2750, 2802, "closed",
    "الحضور تجاوز الضمان — فُوتر على الفعلي."),
  order("so_103", "ct_arab", -3, "06:30", "breakfast", "boxed", "menu_breakfast", AZIZ, 3100, 3050, 3018, "closed"),
  order("so_104", "ct_ithraa", -2, "13:00", "lunch", "plated", "menu_lunch_prem", AZIZ, 420, 400, 396, "closed"),
  // Served, not yet counted — the "past without a head count" warning.
  order("so_105", "ct_arab", -1, "19:00", "dinner", "boxed", "menu_dinner", AZIZ, 3100, 3050, null, "served"),

  // ── inside the cutoff ──────────────────────────────────────────
  order("so_201", "ct_arab", 1, "06:30", "breakfast", "boxed", "menu_breakfast", MINA, 3400, 3400, null, "guaranteed"),
  order("so_202", "ct_arab", 1, "13:00", "lunch", "buffet", "menu_lunch_std", MINA, 3400, 3400, null, "guaranteed"),
  // No guarantee and the deadline has passed — a blocking finding on day one.
  order("so_203", "ct_ithraa", 2, "13:00", "lunch", "plated", "menu_lunch_prem", AZIZ, 480, null, null, "confirmed",
    "بانتظار تثبيت العدد من العميل."),
  order("so_204", "ct_arab", 3, "19:00", "dinner", "boxed", "menu_dinner", MINA, 3600, 3550, null, "guaranteed"),

  // ── forecast ───────────────────────────────────────────────────
  order("so_301", "ct_arab", 6, "06:30", "breakfast", "boxed", "menu_breakfast", MINA, 4200, null, null, "confirmed"),
  order("so_302", "ct_arab", 6, "13:00", "lunch", "buffet", "menu_lunch_std", MINA, 4200, null, null, "confirmed"),
  order("so_303", "ct_arab", 6, "19:00", "dinner", "boxed", "menu_dinner", MINA, 4200, null, null, "confirmed"),
  order("so_304", "ct_ithraa", 9, "13:00", "lunch", "plated", "menu_lunch_prem", AZIZ, 520, null, null, "draft"),
  order("so_305", "ct_arab", 12, "13:00", "lunch", "buffet", "menu_lunch_std", MADI, 2600, null, null, "draft"),
]
