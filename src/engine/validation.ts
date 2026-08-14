import { menuCost, menuVerdict, recipeCost, type Catalog } from "./costing.js"
import type { Supplier } from "./schemas.js"

/**
 * Catalogue validation.
 *
 * Every rule here corresponds to a way the raw-to-menu chain actually goes
 * wrong — a menu priced below its own food cost, an ingredient nobody costed,
 * meat from a supplier whose halal certificate lapsed, a sub-recipe that
 * reaches itself. See `docs/catering-engine.md` for the sourcing.
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
  scope: "ingredient" | "recipe" | "menu"
  entityId: string
  message: string
}

/* ── categories: how the UI groups findings ─────────────────────── */

export type IssueCategory = "menu" | "kitchen" | "supply" | "compliance" | "other"

const COMPLIANCE_CODES = new Set([
  "ingredient.halal_cert_missing",
  "ingredient.halal_cert_expired",
  "ingredient.no_supplier",
])

/** Derived from the code, not stored — one mapping instead of a second field. */
export function categoryOf(code: string): IssueCategory {
  if (COMPLIANCE_CODES.has(code)) return "compliance"
  if (code.startsWith("menu.")) return "menu"
  if (code.startsWith("recipe.")) return "kitchen"
  if (code.startsWith("ingredient.")) return "supply"
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
  const today = now.toISOString().slice(0, 10)
  const issues: Issue[] = []
  const supplierById = new Map(suppliers.map((s) => [s.id, s]))
  const at = (level: IssueLevel, code: string, scope: Issue["scope"], entityId: string, message: string) =>
    issues.push({ level, code, scope, entityId, message })

  /* ── ingredients ──────────────────────────────────────────────── */

  for (const ing of catalog.ingredients.values()) {
    const label = N(ing)
    if (ing.ap_cost_sar === null) {
      // A warning, not an error: an unpriced item is a gap in the costing, and
      // the menu-level rules turn that into a blocking finding only where it
      // actually distorts a price.
      at("warning", "ingredient.no_cost", "ingredient", ing.id, M("«{name}» بلا سعر شراء — لا يدخل في تكلفة أي وصفة.", { name: label }))
    }
    if (ing.yield_pct >= 100 && (ing.category === "protein" || ing.category === "produce")) {
      at("warning", "ingredient.suspicious_yield", "ingredient", ing.id, M("«{name}» بنسبة استخلاص 100% — اللحوم والخضار تفقد جزءًا في التنظيف.", { name: label }))
    }
    if (ing.on_hand < ing.par_level) {
      at("warning", "ingredient.below_par", "ingredient", ing.id, M("«{name}»: الرصيد {have} دون الحد الأدنى {par}.", { name: label, have: n1(ing.on_hand), par: n1(ing.par_level) }))
    }
    if (!ing.supplier) {
      at(ing.halal_critical ? "error" : "warning", "ingredient.no_supplier", "ingredient", ing.id, M("«{name}» بلا مورد معتمد.", { name: label }))
      continue
    }
    const sup = supplierById.get(ing.supplier)
    if (!sup) {
      at("error", "ingredient.no_supplier", "ingredient", ing.id, M("«{name}» مرتبط بمورد غير موجود.", { name: label }))
      continue
    }
    if (ing.halal_critical) {
      if (!sup.halal_cert_no) {
        at("error", "ingredient.halal_cert_missing", "ingredient", ing.id, M("«{name}» من مورد بلا شهادة حلال: {supplier}.", { name: label, supplier: N(sup) }))
      } else if (sup.halal_cert_expiry && sup.halal_cert_expiry < today) {
        at("error", "ingredient.halal_cert_expired", "ingredient", ing.id, M("شهادة الحلال لمورد «{name}» منتهية بتاريخ {date}.", { name: N(sup), date: sup.halal_cert_expiry }))
      }
    }
  }

  /* ── recipes ──────────────────────────────────────────────────── */

  for (const recipe of catalog.recipes.values()) {
    const label = N(recipe)
    if (recipe.lines.length === 0) {
      at("error", "recipe.no_lines", "recipe", recipe.id, M("وصفة «{name}» بلا مكوّنات.", { name: label }))
      continue
    }
    for (const line of recipe.lines) {
      const exists =
        line.kind === "ingredient" ? catalog.ingredients.has(line.ref) : catalog.recipes.has(line.ref)
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
    if (menu.items.length === 0) {
      at("error", "menu.no_items", "menu", menu.id, M("قائمة «{name}» بلا أصناف.", { name: label }))
      continue
    }
    const cost = menuCost(menu.id, catalog)
    if (cost.gaps.unpricedIngredients.length > 0) {
      at("warning", "menu.incomplete_cost", "menu", menu.id, M("تكلفة قائمة «{name}» ناقصة: {count} مكوّن بلا سعر.", { name: label, count: n(cost.gaps.unpricedIngredients.length) }))
    }
    switch (menuVerdict(cost, catalog.policy)) {
      case "unpriced":
        at("error", "menu.unpriced", "menu", menu.id, M("قائمة «{name}» بلا سعر بيع للفرد.", { name: label }))
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
