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
  // produce, second wave — added when the dish recipes were researched
  item("it_spinach", "سبانخ", "Spinach", "produce", "kg", 25, "v_spinach"),
  item("it_carrot", "جزر", "Carrot", "produce", "kg", 50, "v_carrot"),
  item("it_courgette", "كوسا", "Courgette", "produce", "kg", 40, "v_courgette"),
  item("it_peas", "بازلاء", "Green peas", "produce", "kg", 30, "v_peas"),
  item("it_mint", "نعناع", "Mint", "produce", "kg", 8, "v_mint"),
  item("it_rocket", "جرجير", "Rocket", "produce", "kg", 12, "v_rocket"),
  item("it_cabbage", "ملفوف", "Cabbage", "produce", "kg", 35, "v_cabbage"),
  item("it_beetroot", "بنجر", "Beetroot", "produce", "kg", 20, "v_beetroot"),
  item("it_vineleaf", "ورق عنب", "Vine leaves", "produce", "kg", 15, "v_vineleaf"),
  // dry goods, second wave
  item("it_pasta", "مكرونة", "Pasta", "dry_goods", "kg", 80, "v_pasta", { allergens: ["gluten"] }),
  item("it_vermicelli", "شعيرية", "Vermicelli", "dry_goods", "kg", 20, "v_vermicelli", { allergens: ["gluten"] }),
  item("it_semolina", "سميد", "Semolina", "dry_goods", "kg", 40, "v_semolina", { allergens: ["gluten"] }),
  item("it_breadcrumb", "بقسماط", "Breadcrumbs", "dry_goods", "kg", 25, "v_breadcrumb", { allergens: ["gluten"] }),
  item("it_tomatopaste", "صلصة طماطم", "Tomato paste", "dry_goods", "kg", 30, "v_tomatopaste"),
  item("it_oliveoil", "زيت زيتون", "Olive oil", "dry_goods", "l", 24, "v_oliveoil"),
  item("it_vinegar", "خل", "Vinegar", "dry_goods", "l", 20, "v_vinegar"),
  item("it_olive", "زيتون", "Olives", "dry_goods", "kg", 20, "v_olive"),
  // dairy, second wave
  item("it_milk", "حليب", "Milk", "dairy", "l", 120, "v_milk", { allergens: ["dairy"] }),
  item("it_qishta", "قشطة", "Qishta", "dairy", "kg", 25, "v_qishta", { allergens: ["dairy"] }),
  // ── patisserie ──────────────────────────────────────────────────
  // The dessert sections are ~20 dishes per package and none of them could be
  // costed on the savoury catalogue: a cake is flour, sugar, egg, butter and
  // *whipping* cream, and a cheesecake is none of the above.
  item("it_whipcream", "كريمة خفق", "Whipping cream", "dairy", "l", 60, "v_whipcream", { allergens: ["dairy"] }),
  item("it_creamcheese", "جبن كريمي", "Cream cheese", "dairy", "kg", 30, "v_creamcheese", { allergens: ["dairy"] }),
  item("it_mascarpone", "جبن ماسكربوني", "Mascarpone", "dairy", "kg", 12, "v_mascarpone", { allergens: ["dairy"] }),
  item("it_choc", "شوكولاتة داكنة", "Dark chocolate", "dry_goods", "kg", 25, "v_choc", { allergens: ["soy"] }),
  item("it_cocoa", "كاكاو بودرة", "Cocoa powder", "dry_goods", "kg", 8, "v_cocoa"),
  item("it_gelatin", "جيلاتين", "Gelatin", "dry_goods", "kg", 4, "v_gelatin"),
  item("it_jellypowder", "مسحوق جيلي", "Jelly powder", "dry_goods", "kg", 10, "v_jellypowder"),
  item("it_cornflour", "نشا", "Cornflour", "dry_goods", "kg", 15, "v_cornflour"),
  item("it_icingsugar", "سكر بودرة", "Icing sugar", "dry_goods", "kg", 20, "v_icingsugar"),
  item("it_almondflour", "لوز مطحون", "Almond flour", "dry_goods", "kg", 8, "v_almondflour", { allergens: ["nuts"] }),
  item("it_pistachio", "فستق", "Pistachio", "dry_goods", "kg", 10, "v_pistachio", { allergens: ["nuts"] }),
  item("it_coffee", "قهوة إسبريسو", "Espresso coffee", "beverage", "kg", 6, "v_coffee"),
  item("it_biscuit", "بسكويت دايجستيف", "Digestive biscuit", "bakery", "kg", 20, "v_biscuit", { allergens: ["gluten", "dairy"] }),
  item("it_ladyfinger", "أصابع السيدة", "Ladyfingers", "bakery", "kg", 10, "v_ladyfinger", { allergens: ["gluten", "egg"] }),
  item("it_puff", "عجينة بف باستري", "Puff pastry", "bakery", "kg", 20, "v_puff", { allergens: ["gluten"] }),
  item("it_strawberry", "فراولة", "Strawberry", "produce", "kg", 15, "v_strawberry"),
  item("it_cherry", "كرز", "Cherries", "produce", "kg", 10, "v_cherry"),
  item("it_fruitmix", "فواكه مشكلة", "Mixed fruit", "produce", "kg", 60, "v_fruitmix"),
  // ── premium proteins and international pantry ───────────────────
  // What packages 3 and 4 are actually made of: a seafood and continental
  // range the Hajj-catering catalogue never needed.
  item("it_lobster", "استاكوزا", "Lobster", "protein", "kg", 12, "v_lobster", { allergens: ["shellfish"] }),
  item("it_seafoodmix", "ثمار البحر مشكلة", "Mixed seafood", "protein", "kg", 20, "v_seafoodmix", { allergens: ["shellfish"] }),
  item("it_salmon", "سالمون", "Salmon", "protein", "kg", 20, "v_salmon", { allergens: ["fish"] }),
  item("it_seabass", "سمك قاروص", "Sea bass", "protein", "kg", 20, "v_seabass", { allergens: ["fish"] }),
  item("it_grouper", "سمك هامور", "Grouper", "protein", "kg", 25, "v_grouper", { allergens: ["fish"] }),
  item("it_tuna", "تونة معلّبة", "Canned tuna", "protein", "kg", 18, "v_tuna", { allergens: ["fish"] }),
  item("it_veal", "لحم عجل", "Veal", "protein", "kg", 40, "v_veal", { halal_critical: true }),
  item("it_turkey", "ديك رومي", "Turkey", "protein", "kg", 30, "v_turkey", { halal_critical: true }),
  item("it_duck", "بط", "Duck", "protein", "kg", 20, "v_duck", { halal_critical: true }),
  item("it_coldcuts", "لحوم باردة", "Cold cuts", "protein", "kg", 15, "v_coldcuts", { halal_critical: true }),
  item("it_mozzarella", "جبن موزريلا", "Mozzarella", "dairy", "kg", 25, "v_mozzarella", { allergens: ["dairy"] }),
  item("it_cheesemix", "أجبان مشكلة", "Cheese selection", "dairy", "kg", 12, "v_cheesemix", { allergens: ["dairy"] }),
  item("it_ravioli", "رافيولي", "Ravioli", "dry_goods", "kg", 20, "v_ravioli", { allergens: ["gluten", "egg", "dairy"] }),
  item("it_fettuccine", "فتوتشيني", "Fettuccine", "dry_goods", "kg", 30, "v_fettuccine", { allergens: ["gluten"] }),
  item("it_lasagna", "شرائح لازانيا", "Lasagne sheets", "dry_goods", "kg", 25, "v_lasagna", { allergens: ["gluten"] }),
  item("it_sushirice", "أرز سوشي", "Sushi rice", "dry_goods", "kg", 15, "v_sushirice"),
  item("it_nori", "أوراق نوري", "Nori sheets", "dry_goods", "kg", 3, "v_nori"),
  item("it_mayo", "مايونيز", "Mayonnaise", "dry_goods", "kg", 30, "v_mayo", { allergens: ["egg"] }),
  item("it_pesto", "صوص بيستو", "Pesto", "dry_goods", "kg", 6, "v_pesto", { allergens: ["nuts", "dairy"] }),
  item("it_oystersauce", "صوص المحار", "Oyster sauce", "dry_goods", "l", 8, "v_oystersauce", { allergens: ["shellfish"] }),
  item("it_teriyaki", "صوص ترياكي", "Teriyaki sauce", "dry_goods", "l", 8, "v_teriyaki", { allergens: ["soy", "gluten"] }),
  item("it_prunes", "برقوق مجفف", "Prunes", "dry_goods", "kg", 10, "v_prunes"),
  item("it_raisin", "زبيب", "Raisins", "dry_goods", "kg", 12, "v_raisin"),
  item("it_walnut", "جوز", "Walnuts", "dry_goods", "kg", 10, "v_walnut", { allergens: ["nuts"] }),
  item("it_saffron", "زعفران", "Saffron", "dry_goods", "kg", 0.2, "v_saffron"),
  item("it_apple", "تفاح", "Apple", "produce", "kg", 25, "v_apple"),
  item("it_orange", "برتقال", "Orange", "produce", "kg", 25, "v_orange"),
  item("it_bellpepper", "فلفل رومي", "Bell pepper", "produce", "kg", 25, "v_bellpepper"),
  item("it_greenbean", "فاصوليا خضراء", "Green beans", "produce", "kg", 20, "v_greenbean"),
  // bakery, beverage, disposables
  item("it_bread", "خبز عربي", "Arabic bread", "bakery", "ea", 1200, "v_bread", { allergens: ["gluten"] }),
  item("it_kunafa", "عجينة كنافة", "Kunafa dough", "bakery", "kg", 30, "v_kunafa", { allergens: ["gluten"] }),
  item("it_filo", "رقائق بقلاوة", "Filo pastry", "bakery", "kg", 25, "v_filo", { allergens: ["gluten"] }),
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
const RAW_VARIANTS: ItemVariant[] = [
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
  // ── produce, second wave ────────────────────────────────────────
  variant("v_spinach", "it_spinach", "صندوق ٥ كجم", "5 kg box", "sup_produce", "box", 5, 28, 70, "chilled", 20), // estimated
  variant("v_carrot", "it_carrot", "كيس ١٠ كجم", "10 kg sack", "sup_produce", "sack", 10, 32, 80, "dry", 55), // estimated
  variant("v_courgette", "it_courgette", "صندوق ٦ كجم", "6 kg box", "sup_produce", "box", 6, 26, 88, "chilled", 42), // estimated
  variant("v_peas", "it_peas", "كرتون ١٠ كجم", "10 kg case", "sup_produce", "case", 10, 95, 100, "frozen", 35), // estimated
  variant("v_mint", "it_mint", "ربطة ١ كجم", "1 kg bunch", "sup_produce", "kg", 1, 12, 55, "chilled", 6), // estimated
  variant("v_rocket", "it_rocket", "صندوق ٣ كجم", "3 kg box", "sup_produce", "box", 3, 18, 65, "chilled", 10), // estimated
  variant("v_cabbage", "it_cabbage", "كيس ٨ كجم", "8 kg sack", "sup_produce", "sack", 8, 20, 78, "chilled", 40), // estimated
  variant("v_beetroot", "it_beetroot", "صندوق ٦ كجم", "6 kg box", "sup_produce", "box", 6, 20, 75, "chilled", 22), // estimated
  variant("v_vineleaf", "it_vineleaf", "صندوق ٥ كجم", "5 kg box", "sup_produce", "box", 5, 60, 95, "chilled", 12), // estimated
  // ── dry goods, second wave ──────────────────────────────────────
  variant("v_pasta", "it_pasta", "كيس ١٠ كجم", "10 kg sack", "sup_dry", "sack", 10, 62, 100, "dry", 90), // estimated
  variant("v_vermicelli", "it_vermicelli", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 32, 100, "dry", 25), // estimated
  variant("v_semolina", "it_semolina", "كيس ١٠ كجم", "10 kg sack", "sup_dry", "sack", 10, 48, 100, "dry", 45), // estimated
  variant("v_breadcrumb", "it_breadcrumb", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 35, 100, "dry", 28), // estimated
  variant("v_tomatopaste", "it_tomatopaste", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 48, 100, "dry", 32), // estimated
  variant("v_oliveoil", "it_oliveoil", "عبوة ٤ لتر", "4 L tin", "sup_dry", "box", 4, 120, 100, "dry", 28), // estimated
  variant("v_vinegar", "it_vinegar", "عبوة ٥ لتر", "5 L jug", "sup_dry", "box", 5, 22, 100, "dry", 24), // estimated
  variant("v_olive", "it_olive", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 65, 90, "dry", 22), // estimated
  // ── dairy, second wave ──────────────────────────────────────────
  variant("v_milk", "it_milk", "كرتون ١٢ لتر", "12 L case", "sup_dairy", "case", 12, 66, 100, "chilled", 144), // estimated
  variant("v_qishta", "it_qishta", "كرتون ٦ كجم", "6 kg case", "sup_dairy", "case", 6, 165, 100, "chilled", 28), // estimated
  // ── patisserie ──────────────────────────────────────────────────
  variant("v_whipcream", "it_whipcream", "كرتون ١٢ لتر", "12 L case", "sup_dairy", "case", 12, 168, 100, "chilled", 72), // estimated
  variant("v_creamcheese", "it_creamcheese", "كرتون ٥ كجم", "5 kg case", "sup_dairy", "case", 5, 145, 100, "chilled", 32), // estimated
  variant("v_mascarpone", "it_mascarpone", "كرتون ٢ كجم", "2 kg case", "sup_dairy", "case", 2, 92, 100, "chilled", 10), // estimated
  variant("v_choc", "it_choc", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 210, 100, "dry", 28), // estimated
  variant("v_cocoa", "it_cocoa", "كجم", "1 kg", "sup_dry", "kg", 1, 38, 100, "dry", 9), // estimated
  variant("v_gelatin", "it_gelatin", "كجم", "1 kg", "sup_dry", "kg", 1, 85, 100, "dry", 5), // estimated
  variant("v_jellypowder", "it_jellypowder", "كجم", "1 kg", "sup_dry", "kg", 1, 22, 100, "dry", 12), // estimated
  variant("v_cornflour", "it_cornflour", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 28, 100, "dry", 18), // estimated
  variant("v_icingsugar", "it_icingsugar", "كيس ٥ كجم", "5 kg sack", "sup_dry", "sack", 5, 32, 100, "dry", 22), // estimated
  variant("v_almondflour", "it_almondflour", "كجم", "1 kg", "sup_dry", "kg", 1, 62, 100, "dry", 9), // estimated
  variant("v_pistachio", "it_pistachio", "كجم", "1 kg", "sup_dry", "kg", 1, 145, 100, "dry", 11), // estimated
  variant("v_coffee", "it_coffee", "كجم", "1 kg", "sup_dairy", "kg", 1, 95, 100, "dry", 7), // estimated
  variant("v_biscuit", "it_biscuit", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 68, 100, "dry", 22), // estimated
  variant("v_ladyfinger", "it_ladyfinger", "كرتون ٣ كجم", "3 kg case", "sup_dry", "case", 3, 72, 100, "dry", 11), // estimated
  variant("v_puff", "it_puff", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 78, 100, "frozen", 22), // estimated
  variant("v_strawberry", "it_strawberry", "صندوق ٢ كجم", "2 kg punnet box", "sup_produce", "box", 2, 34, 90, "chilled", 16), // estimated
  variant("v_cherry", "it_cherry", "كرتون ٣ كجم", "3 kg case", "sup_produce", "case", 3, 78, 95, "chilled", 11), // estimated
  variant("v_fruitmix", "it_fruitmix", "كرتون ١٠ كجم", "10 kg case", "sup_produce", "case", 10, 145, 72, "chilled", 65), // estimated
  // ── premium proteins ────────────────────────────────────────────
  variant("v_lobster", "it_lobster", "كرتون ٥ كجم", "5 kg case", "sup_sea", "case", 5, 700, 42, "frozen", 8), // estimated
  variant("v_seafoodmix", "it_seafoodmix", "كرتون ٥ كجم", "5 kg case", "sup_sea", "case", 5, 210, 85, "frozen", 18), // estimated
  variant("v_salmon", "it_salmon", "كرتون ٥ كجم", "5 kg case", "sup_sea", "case", 5, 475, 76, "chilled", 15), // sourced 95/kg
  variant("v_seabass", "it_seabass", "كرتون ٥ كجم", "5 kg case", "sup_sea", "case", 5, 325, 55, "chilled", 16), // sourced 65/kg
  variant("v_grouper", "it_grouper", "كرتون ٥ كجم", "5 kg case", "sup_sea", "case", 5, 375, 80, "chilled", 22), // sourced 75/kg
  variant("v_tuna", "it_tuna", "كرتون ٦ كجم", "6 kg case", "sup_dry", "case", 6, 168, 100, "dry", 20), // estimated
  variant("v_veal", "it_veal", "كرتون ١٠ كجم", "10 kg case", "sup_meat", "case", 10, 380, 80, "frozen", 35), // sourced 38/kg
  variant("v_turkey", "it_turkey", "كرتون ١٢ كجم", "12 kg case", "sup_meat", "case", 12, 312, 66, "frozen", 24), // estimated
  variant("v_duck", "it_duck", "كرتون ٨ كجم", "8 kg case", "sup_meat", "case", 8, 336, 62, "frozen", 16), // estimated
  variant("v_coldcuts", "it_coldcuts", "كرتون ٣ كجم", "3 kg case", "sup_meat", "case", 3, 165, 100, "chilled", 12), // estimated
  // ── international pantry ────────────────────────────────────────
  variant("v_mozzarella", "it_mozzarella", "كرتون ٥ كجم", "5 kg case", "sup_dairy", "case", 5, 155, 100, "chilled", 26), // estimated
  variant("v_cheesemix", "it_cheesemix", "كرتون ٣ كجم", "3 kg case", "sup_dairy", "case", 3, 174, 100, "chilled", 10), // estimated
  variant("v_ravioli", "it_ravioli", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 105, 100, "frozen", 20), // estimated
  variant("v_fettuccine", "it_fettuccine", "كيس ١٠ كجم", "10 kg sack", "sup_dry", "sack", 10, 72, 100, "dry", 30), // estimated
  variant("v_lasagna", "it_lasagna", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 48, 100, "dry", 25), // estimated
  variant("v_sushirice", "it_sushirice", "كيس ١٠ كجم", "10 kg sack", "sup_dry", "sack", 10, 78, 100, "dry", 15), // estimated
  variant("v_nori", "it_nori", "كجم", "1 kg", "sup_dry", "kg", 1, 210, 100, "dry", 3), // estimated
  variant("v_mayo", "it_mayo", "كرتون ١٠ كجم", "10 kg case", "sup_dry", "case", 10, 95, 100, "chilled", 32), // estimated
  variant("v_pesto", "it_pesto", "كرتون ٣ كجم", "3 kg case", "sup_dry", "case", 3, 132, 100, "chilled", 6), // estimated
  variant("v_oystersauce", "it_oystersauce", "عبوة ٥ لتر", "5 L jug", "sup_dry", "box", 5, 78, 100, "dry", 9), // estimated
  variant("v_teriyaki", "it_teriyaki", "عبوة ٥ لتر", "5 L jug", "sup_dry", "box", 5, 85, 100, "dry", 9), // estimated
  variant("v_prunes", "it_prunes", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 92, 95, "dry", 11), // estimated
  variant("v_raisin", "it_raisin", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 62, 100, "dry", 13), // estimated
  variant("v_walnut", "it_walnut", "كجم", "1 kg", "sup_dry", "kg", 1, 58, 100, "dry", 11), // estimated
  // Sold by the 50 g box, which is why `pack_size` is a fraction of a kilo —
  // the only item in the catalogue where that happens.
  variant("v_saffron", "it_saffron", "علبة ٥٠ جم", "50 g box", "sup_dry", "box", 0.05, 475, 100, "dry", 0.15), // estimated
  variant("v_apple", "it_apple", "كرتون ١٠ كجم", "10 kg case", "sup_produce", "case", 10, 78, 88, "chilled", 28), // estimated
  variant("v_orange", "it_orange", "كرتون ١٠ كجم", "10 kg case", "sup_produce", "case", 10, 55, 65, "chilled", 26), // estimated
  variant("v_bellpepper", "it_bellpepper", "صندوق ٥ كجم", "5 kg box", "sup_produce", "box", 5, 38, 82, "chilled", 27), // estimated
  variant("v_greenbean", "it_greenbean", "كرتون ٥ كجم", "5 kg case", "sup_produce", "case", 5, 42, 88, "frozen", 22), // estimated
  // ── bakery, beverage, disposables ───────────────────────────────
  // Unpriced on purpose — anything built on bread costs light until this is filled in.
  variant("v_bread", "it_bread", "صينية ١٠٠ رغيف", "Tray of 100", "sup_dry", "tray", 100, null, 100, "dry", 800),
  variant("v_kunafa", "it_kunafa", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 55, 100, "chilled", 35), // estimated
  variant("v_filo", "it_filo", "كرتون ٥ كجم", "5 kg case", "sup_dry", "case", 5, 62, 100, "frozen", 28), // estimated
  variant("v_water", "it_water", "كرتون ٤٨ حبة", "Case of 48", "sup_dairy", "case", 48, 11, 100, "dry", 9600), // estimated
  variant("v_juice", "it_juice", "كرتون ٢٤ حبة", "Case of 24", "sup_dairy", "case", 24, 40, 100, "chilled", 1440), // estimated
  variant("v_mealbox", "it_mealbox", "كرتون ٥٠٠ علبة", "Case of 500", "sup_dry", "case", 500, 240, 100, "dry", 4000), // estimated
]

/**
 * Items deliberately left short of par, because their finding is the point.
 *
 * Chicken is the one the item/variant split exists to demonstrate: below par,
 * and its costing basis comes from the supplier whose certificate has lapsed.
 */
const DELIBERATELY_SHORT = new Set(["it_chicken"])

/**
 * Bring everything else up to par, on its costing basis.
 *
 * Hand-written stock levels drifted below par on 32 of the 103 items — a habit
 * of typing a number slightly under the par I had just written. That produced
 * 32 `item.below_par` warnings, which is not a seed with a few deliberate
 * imperfections; it is a wall that buries them. Expressing the intent as a set
 * beats scattering 32 corrected magic numbers, and it stays true as items are
 * added.
 */
function stockedToPar(variants: ItemVariant[]): ItemVariant[] {
  const onHand = new Map<string, number>()
  for (const v of variants) onHand.set(v.item, (onHand.get(v.item) ?? 0) + v.on_hand)
  return variants.map((v) => {
    const item = SEED_ITEMS.find((i) => i.id === v.item)
    if (!item || DELIBERATELY_SHORT.has(item.id)) return v
    // Only the costing basis is topped up — the alternatives stay at whatever
    // was actually seeded, which is usually zero.
    if (item.preferred_variant !== v.id) return v
    const short = item.par_level - (onHand.get(item.id) ?? 0)
    // A quarter above par, so ordinary consumption does not instantly re-trip
    // the warning the moment anyone edits a recipe.
    return short > 0 ? { ...v, on_hand: v.on_hand + short * 1.25 } : v
  })
}

export const SEED_VARIANTS: ItemVariant[] = stockedToPar(RAW_VARIANTS)

/* ── a few real dishes, actually costed ─────────────────────────── */

/**
 * Bills of materials for the transcribed dishes.
 *
 * Keyed by the Arabic name rather than by recipe id: the ids come out of
 * `scripts/seed-from-docs.mjs` and shift the moment the source document
 * changes, whereas the name is what the document says.
 *
 * **Compositions are researched, quantities are professional judgement.** The
 * *ingredient lists* come from standard published recipes for each dish —
 * mutabbal is aubergine, tahini, garlic, lemon, olive oil and thick yoghurt;
 * tabbouleh is parsley, bulgur, tomato, mint, lemon and olive oil; macarona
 * béchamel is pasta, mince, milk, flour and butter. The *amounts* are scaled to
 * the batch yield the generator assigned and are not from the client.
 *
 * Salt, pepper and general seasoning are deliberately absent: the Q factor
 * already carries them (`docs/catering-engine.md` §3), and listing them here
 * would double-count.
 *
 * Batch yields: 50 portions for appetisers and desserts, 40 for mains.
 */
const COSTED: Record<string, Array<[string, number]>> = {
  /* ── cold appetisers ─────────────────────────────────────────── */
  متبل: [["it_eggplant", 5], ["it_tahini", 0.6], ["it_yogurt", 0.8], ["it_lemon", 0.5], ["it_garlic", 0.1], ["it_oliveoil", 0.3]],
  "بابا غنوج": [["it_eggplant", 5.5], ["it_tahini", 0.5], ["it_lemon", 0.4], ["it_garlic", 0.1], ["it_oliveoil", 0.35]],
  حمص: [["it_chickpea", 2.5], ["it_tahini", 0.8], ["it_lemon", 0.5], ["it_garlic", 0.12], ["it_oliveoil", 0.4]],
  تبولة: [["it_parsley", 2], ["it_burghul", 0.8], ["it_tomato", 1.5], ["it_mint", 0.2], ["it_lemon", 0.6], ["it_oliveoil", 0.35]],
  فتوش: [["it_lettuce", 2], ["it_tomato", 1.2], ["it_cucumber", 1.2], ["it_parsley", 0.3], ["it_mint", 0.15], ["it_bread", 20], ["it_lemon", 0.4], ["it_oliveoil", 0.35], ["it_vinegar", 0.1]],
  "سلطة خضراء": [["it_lettuce", 3], ["it_cucumber", 1.5], ["it_tomato", 1.5], ["it_onion", 0.4]],
  "سلطة لبن": [["it_yogurt", 3], ["it_cucumber", 1.5], ["it_mint", 0.1], ["it_garlic", 0.05]],
  دقوس: [["it_tomato", 3], ["it_garlic", 0.15], ["it_oil", 0.2], ["it_spice", 0.05]],
  "ورق عنب": [["it_vineleaf", 1.5], ["it_rice", 1.2], ["it_tomato", 0.5], ["it_onion", 0.4], ["it_lemon", 0.4], ["it_oliveoil", 0.4]],
  لبنة: [["it_yogurt", 6], ["it_oliveoil", 0.4]],
  "سلطة بنجر": [["it_beetroot", 3.5], ["it_yogurt", 0.8], ["it_lemon", 0.3], ["it_oliveoil", 0.2]],
  "سلطة سيزار": [["it_lettuce", 3.2], ["it_cheese", 0.5], ["it_bread", 20], ["it_cream", 0.4], ["it_lemon", 0.25], ["it_oliveoil", 0.3]],
  "سلطة روسية": [["it_potato", 2.5], ["it_carrot", 1], ["it_peas", 0.8], ["it_cream", 0.8], ["it_lemon", 0.2]],
  "سلطة ملفوف": [["it_cabbage", 3.5], ["it_carrot", 0.8], ["it_cream", 0.6], ["it_lemon", 0.3], ["it_sugar", 0.1]],
  "سلطة المكرونة": [["it_pasta", 2.2], ["it_cream", 0.8], ["it_carrot", 0.5], ["it_peas", 0.4], ["it_cheese", 0.3]],
  "سلطة جرجير": [["it_rocket", 2.5], ["it_tomato", 1], ["it_onion", 0.3], ["it_lemon", 0.3], ["it_oliveoil", 0.3]],
  "طرشي مشكل": [["it_cucumber", 2], ["it_carrot", 1.5], ["it_cabbage", 1], ["it_vinegar", 1.2]],

  /* ── hot appetisers ──────────────────────────────────────────── */
  كبة: [["it_burghul", 1.5], ["it_beef", 2.2], ["it_onion", 0.8], ["it_spice", 0.08], ["it_oil", 1.5]],
  "سمبوسك لحم": [["it_flour", 2.2], ["it_beef", 2], ["it_onion", 0.8], ["it_oil", 1.2], ["it_spice", 0.08]],
  "سمبوسك دجاج": [["it_flour", 2.2], ["it_chicken", 2], ["it_onion", 0.8], ["it_oil", 1.2], ["it_spice", 0.08]],
  "سبرينج رول خضار": [["it_flour", 1.8], ["it_cabbage", 1.2], ["it_carrot", 0.8], ["it_peas", 0.4], ["it_onion", 0.4], ["it_oil", 1.4]],
  "بطاطس حارة": [["it_potato", 5], ["it_oil", 1.5], ["it_spice", 0.12], ["it_garlic", 0.1]],
  "بطاطس كروكيت": [["it_potato", 4.5], ["it_cheese", 0.6], ["it_flour", 0.5], ["it_egg", 8], ["it_breadcrumb", 0.7], ["it_oil", 1.6]],
  "فطاير سبانخ": [["it_flour", 2.5], ["it_spinach", 2.5], ["it_onion", 0.7], ["it_lemon", 0.3], ["it_oliveoil", 0.5]],

  /* ── mains ───────────────────────────────────────────────────── */
  "رز كابلي باللحم": [["it_rice", 6], ["it_lamb", 7], ["it_onion", 1.2], ["it_tomato", 0.8], ["it_oil", 0.7], ["it_spice", 0.15], ["it_cardamom", 0.03]],
  "رز أبيض بالشعرية": [["it_rice", 6], ["it_vermicelli", 0.5], ["it_butter", 0.5], ["it_oil", 0.2]],
  "مكرونة بالباشاميل": [["it_pasta", 4], ["it_beef", 3], ["it_milk", 5], ["it_flour", 0.5], ["it_butter", 0.6], ["it_cheese", 0.8], ["it_tomatopaste", 0.5], ["it_onion", 0.8]],
  "خضار سوتيه": [["it_courgette", 3], ["it_carrot", 2.5], ["it_peas", 1.5], ["it_onion", 0.8], ["it_butter", 0.5], ["it_oil", 0.3]],
  "مشاوي مشكلة": [["it_chicken", 5], ["it_beef", 4], ["it_lamb", 3], ["it_onion", 1], ["it_spice", 0.2], ["it_oil", 0.5]],
  "سمك بالليمون": [["it_fish", 9], ["it_lemon", 1.2], ["it_garlic", 0.2], ["it_oil", 0.6], ["it_flour", 0.4]],
  "جمبري مقلي": [["it_shrimp", 8], ["it_flour", 1], ["it_breadcrumb", 0.8], ["it_egg", 10], ["it_oil", 2]],
  "بيكاتا بالشامبينيون": [["it_chicken", 8], ["it_mushroom", 2], ["it_cream", 1.5], ["it_flour", 0.4], ["it_butter", 0.5]],
  "كردون بلو": [["it_chicken", 8], ["it_cheese", 1.5], ["it_breadcrumb", 1], ["it_egg", 10], ["it_flour", 0.6], ["it_oil", 2]],
  "دجاج مع الكاجو": [["it_chicken", 8], ["it_nuts", 1], ["it_onion", 0.8], ["it_oil", 0.6], ["it_spice", 0.15]],

  /* ── desserts ────────────────────────────────────────────────── */
  بقلاوة: [["it_filo", 2.5], ["it_nuts", 1.5], ["it_butter", 1.2], ["it_sugar", 1.5]],
  بسبوسة: [["it_semolina", 2.5], ["it_sugar", 1.8], ["it_yogurt", 1], ["it_butter", 0.8]],
  "كريم كراميل": [["it_milk", 4], ["it_egg", 24], ["it_sugar", 1.2]],
  "كنافة بالقشطة": [["it_kunafa", 2.5], ["it_qishta", 2], ["it_butter", 1], ["it_sugar", 1.5]],
  "أم علي": [["it_filo", 1.5], ["it_milk", 4], ["it_cream", 1], ["it_nuts", 0.5], ["it_sugar", 0.8]],
  "بودينج الأرز": [["it_rice", 1.2], ["it_milk", 5], ["it_sugar", 0.8], ["it_cream", 0.5]],
  رموش: [["it_filo", 1.8], ["it_nuts", 1.2], ["it_butter", 1], ["it_sugar", 1.4]],
  "حلوة الجبن": [["it_cheese", 2.5], ["it_semolina", 1], ["it_sugar", 1.2], ["it_qishta", 0.8]],

  /* ── patisserie ──────────────────────────────────────────────── */
  // A sponge is flour + sugar + egg + butter; a gateau is that plus whipped
  // cream and its fruit. Cheesecake is a biscuit base, cream cheese and
  // gelatin. Tiramisu is ladyfingers soaked in espresso under mascarpone,
  // egg yolk and sugar. Mousse is dark chocolate, cream and egg.
  جلي: [["it_jellypowder", 0.9], ["it_sugar", 0.3], ["it_fruitmix", 1]],
  "تورتة الغابة السوداء": [["it_flour", 1.2], ["it_sugar", 1.2], ["it_egg", 20], ["it_cocoa", 0.35], ["it_butter", 0.6], ["it_whipcream", 2.5], ["it_cherry", 1.2]],
  "تورتة فراولة": [["it_flour", 1.2], ["it_sugar", 1.1], ["it_egg", 20], ["it_butter", 0.6], ["it_whipcream", 2.5], ["it_strawberry", 1.5]],
  "تورتة فواكة": [["it_flour", 1.2], ["it_sugar", 1.1], ["it_egg", 20], ["it_butter", 0.6], ["it_whipcream", 2.2], ["it_fruitmix", 2]],
  "تشيز كيك": [["it_biscuit", 1.2], ["it_butter", 0.6], ["it_creamcheese", 2.5], ["it_sugar", 0.8], ["it_gelatin", 0.06], ["it_whipcream", 1]],
  تيراميسو: [["it_ladyfinger", 1.2], ["it_mascarpone", 2], ["it_egg", 12], ["it_sugar", 0.7], ["it_coffee", 0.12], ["it_cocoa", 0.08]],
  موس: [["it_choc", 1.5], ["it_whipcream", 2.5], ["it_egg", 16], ["it_sugar", 0.5]],
  بانكوتا: [["it_whipcream", 3], ["it_milk", 1.5], ["it_sugar", 0.7], ["it_gelatin", 0.07]],
  اكلير: [["it_flour", 0.9], ["it_butter", 0.7], ["it_egg", 18], ["it_milk", 2], ["it_sugar", 0.6], ["it_choc", 0.5], ["it_cornflour", 0.15]],
  ميلفيه: [["it_puff", 2.2], ["it_milk", 2.5], ["it_egg", 12], ["it_sugar", 0.7], ["it_cornflour", 0.25], ["it_icingsugar", 0.2]],
  ماكرون: [["it_almondflour", 1.4], ["it_icingsugar", 1.4], ["it_egg", 14], ["it_sugar", 0.5], ["it_butter", 0.5], ["it_choc", 0.3]],
  تارت: [["it_flour", 1.3], ["it_butter", 0.9], ["it_icingsugar", 0.4], ["it_egg", 6], ["it_milk", 1.5], ["it_cornflour", 0.15], ["it_fruitmix", 1.5]],
  "كيكة الفستق": [["it_flour", 1.2], ["it_sugar", 1.1], ["it_egg", 20], ["it_butter", 0.7], ["it_pistachio", 0.8], ["it_whipcream", 1.5]],
  "اكواب الشوكلاتة": [["it_choc", 1.6], ["it_whipcream", 2], ["it_milk", 1], ["it_sugar", 0.4]],
  // Fruit displays are the fruit and nothing else — the labour is the dish.
  "سلة فواكه": [["it_fruitmix", 5.5]],
  "سلة فواكه موسمية واستوائية": [["it_fruitmix", 6]],
  "شلال فواكه": [["it_fruitmix", 6.5]],

  /* ── bread ───────────────────────────────────────────────────── */
  // 100 portions per batch, not 50 — the bread section's batch yield.
  "سلة متنوعة من الخبز العربي والإيطالي": [["it_bread", 100], ["it_butter", 0.6]],
  "شلال متنوع من الخبز الإيطالي والفرنسي والعربي الأسمر والأبيض": [["it_bread", 120], ["it_butter", 0.8]],

  /* ── cold appetisers: the seafood and continental range ──────── */
  "هرم الجمبري وصوص الكوكتيل": [["it_shrimp", 4], ["it_mayo", 0.8], ["it_tomatopaste", 0.3], ["it_lemon", 0.4]],
  "استكوزا كاسات الكوكتيل": [["it_lobster", 3], ["it_mayo", 0.7], ["it_tomatopaste", 0.25], ["it_lettuce", 0.8], ["it_lemon", 0.3]],
  سوشي: [["it_sushirice", 2.5], ["it_nori", 0.3], ["it_salmon", 1.2], ["it_cucumber", 0.6], ["it_vinegar", 0.25]],
  "تيرين سمك": [["it_fish", 3.5], ["it_cream", 0.8], ["it_egg", 8], ["it_gelatin", 0.05], ["it_lemon", 0.3]],
  "تيرين لحم": [["it_beef", 3.5], ["it_cream", 0.7], ["it_egg", 8], ["it_gelatin", 0.05], ["it_onion", 0.3]],
  "تيرين دجاج": [["it_chicken", 3.5], ["it_cream", 0.7], ["it_egg", 8], ["it_gelatin", 0.05], ["it_onion", 0.3]],
  "سلطة الشيف": [["it_lettuce", 2.5], ["it_coldcuts", 1], ["it_cheese", 0.6], ["it_egg", 10], ["it_tomato", 0.8], ["it_cucumber", 0.6]],
  "سلطة الموزريلا بالطماطم والبيستو": [["it_mozzarella", 1.8], ["it_tomato", 2.5], ["it_pesto", 0.5], ["it_oliveoil", 0.25]],
  "سلطة دجاج بالجوز": [["it_chicken", 2.5], ["it_walnut", 0.6], ["it_mayo", 0.8], ["it_lettuce", 1], ["it_apple", 0.5]],
  "سلطة شاورما": [["it_chicken", 2.5], ["it_bread", 15], ["it_lettuce", 1.2], ["it_tomato", 0.8], ["it_mayo", 0.6], ["it_spice", 0.06]],
  "سلطة نيسوازا": [["it_tuna", 1.5], ["it_potato", 1.5], ["it_greenbean", 1], ["it_egg", 10], ["it_olive", 0.4], ["it_lettuce", 1], ["it_oliveoil", 0.3]],
  "سلطة هاواي بالتفاح": [["it_apple", 2.5], ["it_cream", 0.8], ["it_walnut", 0.4], ["it_lemon", 0.3], ["it_mayo", 0.4]],
  "مراية أجبان": [["it_cheesemix", 4], ["it_fruitmix", 1], ["it_nuts", 0.4]],
  "مرايا لحوم باردة": [["it_coldcuts", 4], ["it_olive", 0.5], ["it_cucumber", 0.4]],
  "مرايا سالمون وجمبري": [["it_salmon", 2.5], ["it_shrimp", 1.8], ["it_lemon", 0.5], ["it_oliveoil", 0.2]],

  /* ── hot appetisers ──────────────────────────────────────────── */
  "بيتزا صغيرة": [["it_flour", 2], ["it_mozzarella", 1.5], ["it_tomatopaste", 0.8], ["it_oliveoil", 0.3], ["it_bellpepper", 0.4]],
  "فطاير بالجبنة": [["it_flour", 2.5], ["it_cheese", 2], ["it_egg", 6], ["it_oliveoil", 0.5]],
  "فطاير بالخضار": [["it_flour", 2.5], ["it_spinach", 1.2], ["it_bellpepper", 0.6], ["it_onion", 0.6], ["it_oliveoil", 0.5]],

  /* ── mains: rice ─────────────────────────────────────────────── */
  "ارز كابلي": [["it_rice", 6], ["it_chicken", 6], ["it_onion", 1.2], ["it_tomato", 0.8], ["it_oil", 0.7], ["it_spice", 0.15]],
  "ارز مديني": [["it_rice", 6], ["it_lamb", 6], ["it_onion", 1.2], ["it_spice", 0.15], ["it_saffron", 0.004], ["it_oil", 0.6]],
  "رز بخاري باللحم": [["it_rice", 6], ["it_lamb", 6.5], ["it_carrot", 1], ["it_onion", 1], ["it_spice", 0.18], ["it_oil", 0.6], ["it_raisin", 0.2]],
  "ارز بالمكسرات": [["it_rice", 6.5], ["it_nuts", 1], ["it_raisin", 0.4], ["it_butter", 0.6], ["it_saffron", 0.003]],

  /* ── mains: seafood ──────────────────────────────────────────── */
  "استكوزا ثيرميدور": [["it_lobster", 8], ["it_cream", 2], ["it_cheese", 1], ["it_butter", 0.6], ["it_mushroom", 1]],
  "بيلا ثمار البحر": [["it_seafoodmix", 6], ["it_shrimp", 2], ["it_rice", 4.5], ["it_bellpepper", 1], ["it_onion", 0.8], ["it_saffron", 0.004], ["it_oliveoil", 0.5]],
  "جمبري تمبورا": [["it_shrimp", 8], ["it_flour", 1.5], ["it_egg", 10], ["it_cornflour", 0.5], ["it_oil", 2.2]],
  "جمبري محشي بالجبنة": [["it_shrimp", 8], ["it_cheese", 1.5], ["it_breadcrumb", 0.6], ["it_butter", 0.5]],
  "مكرونة بالجمبري": [["it_pasta", 4], ["it_shrimp", 4], ["it_cream", 1.5], ["it_garlic", 0.15], ["it_oliveoil", 0.4]],
  "سمك بالكريمة": [["it_fish", 9], ["it_cream", 2], ["it_flour", 0.4], ["it_butter", 0.5], ["it_mushroom", 0.8]],
  "سمك حارا": [["it_fish", 9], ["it_tomato", 1.5], ["it_bellpepper", 0.8], ["it_garlic", 0.2], ["it_spice", 0.15], ["it_oliveoil", 0.6]],
  "سمك مقلي": [["it_fish", 9.5], ["it_flour", 1], ["it_oil", 2], ["it_lemon", 0.6]],
  "سمك قاروص محشي": [["it_seabass", 10], ["it_onion", 0.8], ["it_lemon", 0.6], ["it_parsley", 0.3], ["it_oliveoil", 0.6]],
  "سمك هامور باليمون": [["it_grouper", 9.5], ["it_lemon", 1.2], ["it_garlic", 0.2], ["it_oliveoil", 0.6], ["it_flour", 0.4]],
  "فيليه سمك الناجل": [["it_grouper", 9.5], ["it_butter", 0.6], ["it_lemon", 0.8], ["it_flour", 0.4]],

  /* ── mains: beef and veal ────────────────────────────────────── */
  "فيليه لحم العجل": [["it_veal", 9], ["it_butter", 0.7], ["it_cream", 1], ["it_mushroom", 1]],
  "لحم مداليون": [["it_veal", 9], ["it_butter", 0.7], ["it_cream", 0.8], ["it_spice", 0.1]],
  "بيف استجرنوف": [["it_beef", 8], ["it_mushroom", 1.5], ["it_cream", 1.5], ["it_onion", 0.8], ["it_flour", 0.3]],
  "بيف فيبليه": [["it_beef", 8.5], ["it_onion", 0.8], ["it_butter", 0.6], ["it_cream", 0.8]],
  "ترياكي لحم": [["it_beef", 8], ["it_teriyaki", 1], ["it_onion", 0.6], ["it_oil", 0.4]],
  "لحم تبنياكي": [["it_beef", 8], ["it_teriyaki", 0.8], ["it_bellpepper", 0.8], ["it_onion", 0.6], ["it_oil", 0.4]],
  "لحم بصوص المحار": [["it_beef", 8], ["it_oystersauce", 0.8], ["it_bellpepper", 0.8], ["it_garlic", 0.15], ["it_oil", 0.4]],
  كفتة: [["it_beef", 7], ["it_onion", 1.2], ["it_parsley", 0.4], ["it_spice", 0.15], ["it_oil", 0.4]],
  "محشي مشكل": [["it_courgette", 3], ["it_bellpepper", 2], ["it_rice", 2], ["it_beef", 2], ["it_tomatopaste", 0.5], ["it_oil", 0.5]],

  /* ── mains: tagine and poultry ───────────────────────────────── */
  "طاجين بالبرقوق": [["it_lamb", 7], ["it_prunes", 1.2], ["it_onion", 1], ["it_spice", 0.15], ["it_oil", 0.5]],
  "طاجين دجاج بالزيتون": [["it_chicken", 8], ["it_olive", 1], ["it_lemon", 0.6], ["it_onion", 1], ["it_spice", 0.15], ["it_oliveoil", 0.5]],
  "دجاج تندوري": [["it_chicken", 9], ["it_yogurt", 1.5], ["it_spice", 0.25], ["it_lemon", 0.4], ["it_garlic", 0.15]],
  "دجاج بيكاتا": [["it_chicken", 8], ["it_flour", 0.4], ["it_butter", 0.5], ["it_lemon", 0.6], ["it_cream", 0.8]],
  "دجاج بصوص الفطر": [["it_chicken", 8], ["it_mushroom", 2], ["it_cream", 1.5], ["it_butter", 0.4]],
  "دجاج رول": [["it_chicken", 8], ["it_cheese", 1], ["it_spinach", 0.8], ["it_breadcrumb", 0.6], ["it_egg", 8]],
  "دجاج الاكيف": [["it_chicken", 8], ["it_cream", 1.2], ["it_butter", 0.5], ["it_spice", 0.12], ["it_garlic", 0.12]],
  "ديك رومي": [["it_turkey", 11], ["it_butter", 0.8], ["it_onion", 0.8], ["it_spice", 0.15]],
  "بط بصوص البرتقال": [["it_duck", 10], ["it_orange", 1.5], ["it_sugar", 0.4], ["it_butter", 0.5]],

  /* ── mains: pasta and gratins ────────────────────────────────── */
  لازانيا: [["it_lasagna", 2.5], ["it_beef", 3], ["it_milk", 4], ["it_cheese", 1.2], ["it_tomatopaste", 0.8], ["it_flour", 0.4], ["it_butter", 0.5]],
  "مكرونة لازانيا": [["it_lasagna", 2.5], ["it_beef", 3], ["it_milk", 4], ["it_cheese", 1.2], ["it_tomatopaste", 0.8], ["it_flour", 0.4], ["it_butter", 0.5]],
  "رافيولي بالجبنة": [["it_ravioli", 4], ["it_cream", 1.5], ["it_cheese", 0.8], ["it_butter", 0.5]],
  فتتشيني: [["it_fettuccine", 4], ["it_cream", 2], ["it_cheese", 0.8], ["it_butter", 0.5], ["it_mushroom", 0.8]],
  "باذنجان بالباشاميل": [["it_eggplant", 5], ["it_beef", 2.5], ["it_milk", 4], ["it_flour", 0.5], ["it_butter", 0.5], ["it_cheese", 0.6], ["it_tomatopaste", 0.5]],
  // The document lists the same gratin under both word orders; both are real
  // rows on real packages, so both are costed rather than one aliased away.
  "بطاطس جريتان": [["it_potato", 6], ["it_cream", 2], ["it_cheese", 1], ["it_butter", 0.5], ["it_milk", 1]],
  "جريتان بطاطس": [["it_potato", 6], ["it_cream", 2], ["it_cheese", 1], ["it_butter", 0.5], ["it_milk", 1]],
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
