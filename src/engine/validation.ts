import { costingVariant, epUnitCost, menuCost, menuVerdict, recipeCost, type Catalog } from "./costing.js"
import { itemOnHand, preferredPremium } from "./inventory.js"
import type { Supplier } from "./schemas.js"

/**
 * Catalogue validation.
 *
 * Every rule here corresponds to a way the raw-to-menu chain actually goes
 * wrong — a menu priced below its own food cost, an item nobody chose a
 * costing basis for, meat from a supplier whose halal certificate lapsed, a
 * sub-recipe that reaches itself. See `docs/catering-engine.md` for the
 * sourcing.
 *
 * `error` blocks: the menu cannot be sold, or the money is wrong.
 * `warning` is advisory — worth attention before it becomes an error.
 *
 * The message bridge keeps this module pure and node-testable: it carries
 * Arabic templates with `{param}` slots and its own substitution, and the app
 * swaps in i18next at bootstrap, where an English catalog entry wins and a
 * missing one falls back to the Arabic.
 */

export type MessageParams = Record<string, string | number>

export const formatMessage = (key: string, params?: MessageParams): string =>
  key.replace(/\{(\w+)\}/g, (_, k) => String(params?.[k] ?? ""))

let translateMessage: (key: string, params?: MessageParams) => string = formatMessage

export const setMessageTranslator = (fn: typeof translateMessage): void => {
  translateMessage = fn
}

const M = (key: string, params?: MessageParams): string => translateMessage(key, params)

export type NamedEntity = { name_ar?: string | null; name_en?: string | null }

let pickEntityName: (e: NamedEntity) => string = (e) => e.name_ar || e.name_en || ""

export const setEntityNameLocalizer = (fn: typeof pickEntityName): void => {
  pickEntityName = fn
}

const N = (e: NamedEntity | undefined): string => (e ? pickEntityName(e) : "")

/** Numbers inside messages use Latin digits, matching the fields they name. */
const NUM = new Intl.NumberFormat("ar-SA-u-nu-latn")
const n = (v: number) => NUM.format(v)
const n1 = (v: number) => NUM.format(Math.round(v * 10) / 10)

export type IssueLevel = "error" | "warning"

export interface Issue {
  level: IssueLevel
  /** Which rule fired — stable key, safe to use for i18n lookup. */
  code: string
  scope: "item" | "variant" | "recipe" | "menu"
  entityId: string
  message: string
}

/* ── categories: how the UI groups findings ─────────────────────── */

export type IssueCategory = "menu" | "kitchen" | "supply" | "compliance" | "other"

const COMPLIANCE_CODES = new Set([
  "variant.halal_cert_missing",
  "variant.halal_cert_expired",
  "variant.no_supplier",
])

/** Derived from the code, not stored — one mapping instead of a second field. */
export function categoryOf(code: string): IssueCategory {
  if (COMPLIANCE_CODES.has(code)) return "compliance"
  if (code.startsWith("menu.")) return "menu"
  if (code.startsWith("recipe.")) return "kitchen"
  if (code.startsWith("item.") || code.startsWith("variant.")) return "supply"
  return "other"
}

/* ── input ──────────────────────────────────────────────────────── */

export interface ValidationInput {
  catalog: Catalog
  suppliers: Supplier[]
  /** Injected rather than read from the clock, so results are reproducible. */
  now: Date
}

/* ── the pass ───────────────────────────────────────────────────── */

export function validateCatalogue(input: ValidationInput): Issue[] {
  const { catalog, suppliers, now } = input
  const issues: Issue[] = []
  const today = now.toISOString().slice(0, 10)
  const supplierById = new Map(suppliers.map((s) => [s.id, s]))
  const at = (level: IssueLevel, code: string, scope: Issue["scope"], entityId: string, message: string) =>
    issues.push({ level, code, scope, entityId, message })

  /* ── items ────────────────────────────────────────────────────── */

  /**
   * How much dearer the costing basis may be than the cheapest priced
   * alternative before it is worth someone's attention. Under this, the gap is
   * ordinary supplier drift and flagging it would be noise.
   */
  const PREMIUM_TOLERANCE = 0.05

  for (const item of catalog.items.values()) {
    const label = N(item)
    const variants = catalog.variantsByItem.get(item.id) ?? []

    if (variants.length === 0) {
      at("error", "item.no_variants", "item", item.id, M("«{name}» بلا أي عبوة شراء — لا يمكن شراؤه ولا تسعيره.", { name: label }))
      continue
    }

    const preferred = costingVariant(item.id, catalog)
    if (!preferred) {
      at("error", "item.no_preferred", "item", item.id, M("«{name}» بلا عبوة معتمدة — كل وصفة تستخدمه تُحسب بصفر.", { name: label }))
    } else if (epUnitCost(preferred) === null) {
      // A warning, not an error: an unpriced basis is a gap in the costing, and
      // the menu-level rules turn that into a blocking finding only where it
      // actually distorts a price.
      at("warning", "item.preferred_unpriced", "item", item.id, M("«{name}»: العبوة المعتمدة «{variant}» بلا سعر شراء.", { name: label, variant: N(preferred) }))
    }

    const premium = preferredPremium(item.id, catalog)
    if (premium !== null && premium > PREMIUM_TOLERANCE) {
      at("warning", "item.cheaper_variant_available", "item", item.id, M("«{name}»: العبوة المعتمدة أغلى بـ {pct}% من أرخص البدائل.", { name: label, pct: n1(premium * 100) }))
    }

    const onHand = itemOnHand(item.id, catalog)
    if (onHand < item.par_level) {
      at("warning", "item.below_par", "item", item.id, M("«{name}»: الرصيد {have} دون الحد الأدنى {par}.", { name: label, have: n1(onHand), par: n1(item.par_level) }))
    }
  }

  /* ── purchase variants ────────────────────────────────────────── */

  for (const variant of catalog.variants.values()) {
    const item = catalog.items.get(variant.item)
    if (!item) continue
    // Named by item and variant together: «دجاج طازج — كرتون ١٠ كجم» is what a
    // buyer recognises, where either half alone is ambiguous.
    const label = `${N(item)} — ${N(variant)}`

    if (variant.yield_pct >= 100 && (item.category === "protein" || item.category === "produce")) {
      at("warning", "variant.suspicious_yield", "variant", variant.id, M("«{name}» بنسبة استخلاص 100% — اللحوم والخضار تفقد جزءًا في التنظيف.", { name: label }))
    }

    if (!variant.supplier) {
      at(item.halal_critical ? "error" : "warning", "variant.no_supplier", "variant", variant.id, M("«{name}» بلا مورد معتمد.", { name: label }))
      continue
    }
    const sup = supplierById.get(variant.supplier)
    if (!sup) {
      at("error", "variant.no_supplier", "variant", variant.id, M("«{name}» مرتبطة بمورد غير موجود.", { name: label }))
      continue
    }
    // Checked on every variant, not only the preferred one: an uncertified
    // pack is stock you may be holding, whichever one prices the recipes.
    if (item.halal_critical) {
      if (!sup.halal_cert_no) {
        at("error", "variant.halal_cert_missing", "variant", variant.id, M("«{name}» من مورد بلا شهادة حلال: {supplier}.", { name: label, supplier: N(sup) }))
      } else if (sup.halal_cert_expiry && sup.halal_cert_expiry < today) {
        at("error", "variant.halal_cert_expired", "variant", variant.id, M("شهادة الحلال لمورد «{name}» منتهية بتاريخ {date}.", { name: N(sup), date: sup.halal_cert_expiry }))
      }
    }
  }

  /* ── recipes ──────────────────────────────────────────────────── */

  for (const recipe of catalog.recipes.values()) {
    const label = N(recipe)
    if (recipe.lines.length === 0) {
      // A draft is a name imported from a package that nobody has costed yet.
      // That is honest incomplete data, and there are ~120 of them — raising a
      // finding per dish would bury every real one under a wall. It is rolled
      // up onto the menus that depend on it instead, which is where it stops
      // someone doing something: you cannot price a package whose dishes have
      // no cost. A *non*-draft with no lines is a recipe someone emptied.
      if (!recipe.draft) {
        at("error", "recipe.no_lines", "recipe", recipe.id, M("وصفة «{name}» بلا مكوّنات.", { name: label }))
      }
      continue
    }
    for (const line of recipe.lines) {
      const exists =
        line.kind === "item" ? catalog.items.has(line.ref) : catalog.recipes.has(line.ref)
      if (!exists) {
        at("error", "recipe.missing_ref", "recipe", recipe.id, M("وصفة «{name}» تشير إلى عنصر محذوف.", { name: label }))
      }
      if (line.qty <= 0) {
        at("warning", "recipe.zero_qty", "recipe", recipe.id, M("وصفة «{name}» بها سطر بكمية صفر.", { name: label }))
      }
    }
    // The explosion cuts cycles instead of overflowing the stack, so costing
    // one batch is also how they are detected — one cycle-cutting
    // implementation, not a second walk here that could disagree with it.
    for (const cyc of recipeCost(recipe.id, catalog).gaps.cycles) {
      at("error", "recipe.cycle", "recipe", cyc, M("وصفة «{name}» تستدعي نفسها عبر وصفة فرعية.", { name: N(catalog.recipes.get(cyc)) }))
    }
  }

  /* ── menus ────────────────────────────────────────────────────── */

  for (const menu of catalog.menus.values()) {
    const label = N(menu)
    // A station is defined by its inclusions, not by dishes, so an empty item
    // list is only a defect when there is nothing else in the package.
    if (menu.items.length === 0 && menu.inclusions.length === 0) {
      at("error", "menu.no_items", "menu", menu.id, M("قائمة «{name}» بلا أصناف.", { name: label }))
      continue
    }
    const uncosted = menu.items.filter((i) => catalog.recipes.get(i.recipe)?.draft).length
    if (uncosted > 0) {
      at("warning", "menu.uncosted_dishes", "menu", menu.id, M("قائمة «{name}»: {count} صنف بلا تكلفة بعد.", { name: label, count: n(uncosted) }))
    }

    const cost = menuCost(menu.id, catalog)
    if (cost.gaps.unpricedItems.length > 0 || cost.gaps.itemsWithoutPreferred.length > 0) {
      at("warning", "menu.incomplete_cost", "menu", menu.id, M("تكلفة قائمة «{name}» ناقصة: {count} مادة بلا سعر.", { name: label, count: n(cost.gaps.unpricedItems.length + cost.gaps.itemsWithoutPreferred.length) }))
    }
    switch (menuVerdict(cost, catalog.policy)) {
      case "unpriced":
        // Only a defect once the dishes are costed. Before that the missing
        // price is a consequence, not a decision anyone got wrong.
        if (uncosted === 0) {
          at("error", "menu.unpriced", "menu", menu.id, M("قائمة «{name}» بلا سعر بيع للفرد.", { name: label }))
        }
        break
      case "loss":
        at("error", "menu.loss", "menu", menu.id, M("قائمة «{name}» تُباع بأقل من تكلفتها ({cost} ر.س مقابل {price} ر.س).", { name: label, cost: n1(cost.perCover), price: n1(cost.pricePerCover ?? 0) }))
        break
      case "over_target":
        at("warning", "menu.over_target", "menu", menu.id, M("نسبة تكلفة الطعام في «{name}» {pct}% تتجاوز المستهدف {target}%.", { name: label, pct: n1(cost.foodCostPct ?? 0), target: n1(catalog.policy.target_food_cost_pct) }))
        break
      default:
        break
    }
  }

  return issues
}
