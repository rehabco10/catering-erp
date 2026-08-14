import { menuCost, menuVerdict, recipeCost, type Catalog } from "./costing.js"
import {
  guaranteeDeadline,
  guaranteeState,
  productionCovers,
  productionPlan,
  purchaseList,
  serviceDates,
  billableCovers,
} from "./planning.js"
import type { Contract, ServiceOrder, Supplier } from "./schemas.js"

/**
 * Operations validation.
 *
 * Every rule here corresponds to a way a catering season actually goes wrong —
 * a guarantee nobody chased, a menu priced below its own food cost, a delivery
 * that had to be ordered yesterday, meat from a supplier whose halal
 * certificate lapsed. See `docs/catering-engine.md` for the sourcing.
 *
 * `error` blocks: the service cannot go out, or the money is wrong.
 * `warning` is advisory — worth someone's attention before it becomes an error.
 *
 * The message bridge is the package wizard's: this module stays pure and
 * node-testable, carrying Arabic templates with `{param}` slots and its own
 * substitution. The app swaps in i18next at bootstrap, where an English
 * catalog entry wins and a missing one falls back to the Arabic.
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
  scope: "ingredient" | "recipe" | "menu" | "order" | "contract" | "procurement" | "season"
  entityId: string
  message: string
}

/* ── categories: how the UI groups findings ─────────────────────── */

export type IssueCategory =
  | "commercial" // contracts, guarantees, billing
  | "menu" // menu engineering: cost, price, margin
  | "kitchen" // recipes and production feasibility
  | "supply" // ingredients, stock, procurement
  | "compliance" // halal certification, allergens, food safety
  | "other"

const COMPLIANCE_CODES = new Set([
  "ingredient.halal_cert_missing",
  "ingredient.halal_cert_expired",
  "ingredient.no_supplier",
  "menu.allergen_unlabelled",
])

/** Derived from the code, not stored — one mapping instead of a second field. */
export function categoryOf(code: string): IssueCategory {
  if (COMPLIANCE_CODES.has(code)) return "compliance"
  if (code.startsWith("contract.") || code.startsWith("order.")) return "commercial"
  if (code.startsWith("menu.")) return "menu"
  if (code.startsWith("recipe.") || code.startsWith("season.")) return "kitchen"
  if (code.startsWith("ingredient.") || code.startsWith("procurement.")) return "supply"
  return "other"
}

/* ── input ──────────────────────────────────────────────────────── */

export interface ValidationInput {
  catalog: Catalog
  orders: ServiceOrder[]
  contracts: Contract[]
  suppliers: Supplier[]
  /** Injected rather than read from the clock, so results are reproducible. */
  now: Date
}

/* ── the pass ───────────────────────────────────────────────────── */

export function validateOperations(input: ValidationInput): Issue[] {
  const { catalog, orders, contracts, suppliers, now } = input
  const issues: Issue[] = []
  const supplierById = new Map(suppliers.map((s) => [s.id, s]))
  const at = (
    level: IssueLevel,
    code: string,
    scope: Issue["scope"],
    entityId: string,
    message: string,
  ) => issues.push({ level, code, scope, entityId, message })

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
      } else if (sup.halal_cert_expiry && sup.halal_cert_expiry < now.toISOString().slice(0, 10)) {
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
    // The explosion reports cycles instead of overflowing the stack, so costing
    // one batch is also how we detect them — one cycle-cutting implementation,
    // not a second walk here that could disagree with it.
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

  /* ── contracts ────────────────────────────────────────────────── */

  for (const contract of contracts) {
    if (contract.status === "cancelled") continue
    const label = contract.client_ar || contract.client_en
    const own = orders.filter((o) => o.contract === contract.id && o.status !== "cancelled")
    if (own.length === 0) {
      at("warning", "contract.no_orders", "contract", contract.id, M("عقد «{name}» بلا أي خدمة مجدولة.", { name: label }))
      continue
    }
    const committed = own.reduce((t, o) => t + billableCovers(o), 0)
    if (contract.covers_committed > 0 && committed > contract.covers_committed) {
      at("error", "contract.overcommitted", "contract", contract.id, M("عقد «{name}»: الوجبات المجدولة {planned} تتجاوز المتعاقد عليه {committed}.", { name: label, planned: n(committed), committed: n(contract.covers_committed) }))
    }
    for (const o of own) {
      const day = o.serves_on.slice(0, 10)
      if (day < contract.starts_on.slice(0, 10) || day > contract.ends_on.slice(0, 10)) {
        at("warning", "contract.order_outside_window", "order", o.id, M("خدمة بتاريخ {date} خارج نافذة عقد «{name}».", { date: day, name: label }))
      }
    }
  }

  /* ── service orders ───────────────────────────────────────────── */

  const today = now.toISOString().slice(0, 10)
  for (const order of orders) {
    if (order.status === "cancelled") continue
    const where = `${order.serves_on.slice(0, 10)} · ${order.site_ar || order.site_en}`
    if (!order.menu) {
      at("error", "order.no_menu", "order", order.id, M("خدمة {where} بلا قائمة.", { where }))
    } else if (!catalog.menus.has(order.menu)) {
      at("error", "order.menu_missing", "order", order.id, M("خدمة {where} مرتبطة بقائمة محذوفة.", { where }))
    }
    if (order.expected_covers <= 0 && order.guaranteed_covers === null) {
      at("error", "order.no_covers", "order", order.id, M("خدمة {where} بلا عدد وجبات.", { where }))
    }

    switch (guaranteeState(order, catalog.policy, now)) {
      case "overdue": {
        const due = guaranteeDeadline(order, catalog.policy)
        at("error", "order.guarantee_overdue", "order", order.id, M("خدمة {where}: تجاوز موعد تثبيت العدد ({due}) دون تأكيد من العميل.", { where, due: due ? due.toISOString().slice(0, 16).replace("T", " ") : "—" }))
        break
      }
      case "due_soon":
        at("warning", "order.guarantee_due_soon", "order", order.id, M("خدمة {where}: موعد تثبيت العدد يقترب — تبقّى أقل من {hours} ساعة.", { where, hours: n(Math.ceil(catalog.policy.guarantee_lead_hours * 0.25)) }))
        break
      default:
        break
    }

    if (order.actual_covers !== null) {
      const produced = productionCovers(order, catalog.policy)
      if (order.actual_covers > produced) {
        // Someone went hungry, or the line ran out and was topped up off-plan.
        at("error", "order.served_over_production", "order", order.id, M("خدمة {where}: الحضور {actual} تجاوز المنتَج {produced}.", { where, actual: n(order.actual_covers), produced: n(produced) }))
      }
    } else if (order.serves_on.slice(0, 10) < today && order.status !== "closed") {
      at("warning", "order.past_uncounted", "order", order.id, M("خدمة {where} مضت دون تسجيل الحضور الفعلي.", { where }))
    }
  }

  /* ── production capacity & procurement ────────────────────────── */

  // Forward-looking only. A capacity overrun or a missed order-by date on a
  // service that has already happened is not a finding — it is history, and
  // raising one per past day per ingredient buried the live findings under
  // dozens of rows nobody could act on.
  for (const date of serviceDates(orders)) {
    if (date < today) continue
    const plan = productionPlan(date, orders, catalog)
    if (plan.covers > catalog.policy.daily_capacity_covers) {
      at("error", "season.capacity_exceeded", "season", date, M("يوم {date}: الإنتاج المطلوب {covers} وجبة يتجاوز طاقة المطبخ {capacity}.", { date, covers: n(plan.covers), capacity: n(catalog.policy.daily_capacity_covers) }))
    }
    for (const line of purchaseList(plan.requirements, catalog, supplierById, date)) {
      if (line.packs <= 0) continue
      if (line.orderBy && line.orderBy < today) {
        at("error", "procurement.order_by_passed", "procurement", `${date}:${line.ingredient.id}`, M("«{name}» ليوم {date}: كان يجب الطلب بحلول {by}.", { name: N(line.ingredient), date, by: line.orderBy }))
      }
      if (line.cost === null) {
        at("warning", "procurement.unpriced", "procurement", `${date}:${line.ingredient.id}`, M("«{name}» مطلوب ليوم {date} بلا سعر معروف.", { name: N(line.ingredient), date }))
      }
    }
  }

  return issues
}
