import { useTranslation } from "react-i18next"
import { useSnapshot } from "valtio"
import { AlertTriangle, Plus, Target, Trash2 } from "lucide-react"

import { Card, Note } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Field, Input, NumInput, SelectField } from "@/components/ui/field"
import { useLocale } from "@/i18n/LocaleProvider"
import { menuCost, menuVerdict, priceForTarget, recipeCost, withVat } from "@/engine/costing"
import {
  COURSE_ORDER,
  dec2,
  foodCostTone,
  lineOptions,
  mealOptions,
  money,
  pct,
  pickName,
  toneClasses,
} from "@/lib/display"
import type { Menu, MenuCourseValue } from "@/engine/schemas"
import { cn } from "@/lib/utils"
import { priceMenuAtTarget, removeMenuItem, state } from "@/store/ops"
import { useCatalog } from "@/store/use-issues"

/**
 * A menu as a form.
 *
 * Three groups, in the order the decisions are made: what this menu *is*, what
 * is *in* it, and what it *sells for*. The third depends on the second, which
 * is why price sits at the bottom under a live cost rather than in the header
 * where it invites being typed first.
 *
 * The composition list is the recipe page's build list — same row shape, same
 * unit handling — because a menu composed of dishes and a dish composed of
 * ingredients are the same act at two levels, and making them look different
 * would be a lie about the model.
 */
export function MenuForm({
  menuId,
  onAddDish,
}: {
  menuId: string
  /** Opens the picker for one section — a dish is always added into a course. */
  onAddDish: (menuId: string, course: MenuCourseValue) => void
}) {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()

  const menu = snap.menus.find((m) => m.id === menuId)
  if (!menu) return null

  const cost = menuCost(menuId, catalog)
  // How much of the menu is actually costed. The engine cannot know this — a
  // draft simply contributes nothing — so it is computed for display.
  const uncosted = menu.items.filter((i) => catalog.recipes.get(i.recipe)?.draft).length
  const coveragePct =
    menu.items.length > 0 ? ((menu.items.length - uncosted) / menu.items.length) * 100 : 100
  const verdict = menuVerdict(cost, snap.policy)
  const suggested = priceForTarget(cost.perCover, snap.policy.target_food_cost_pct)
  const tone = toneClasses[foodCostTone(cost.foodCostPct, snap.policy.target_food_cost_pct)]

  /** The live record, for edits. `snap` is a frozen read-only view. */
  const edit = () => state.menus.find((m) => m.id === menuId)!

  return (
    <>
      {/* ── what it is ───────────────────────────────────────────── */}
      <Card title={pickName(menu, locale)}>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label={t("field.name")}>
            <Input
              value={menu.name_ar}
              onChange={(e) => {
                edit().name_ar = e.target.value
              }}
            />
          </Field>
          <Field label={`${t("field.name")} (EN)`}>
            <Input
              dir="ltr"
              value={menu.name_en}
              onChange={(e) => {
                edit().name_en = e.target.value
              }}
            />
          </Field>
          <Field label={t("field.service_line")}>
            <SelectField
              value={menu.service_line}
              onChange={(v) => {
                edit().service_line = v as Menu["service_line"]
              }}
              options={lineOptions(t)}
              allowEmpty={false}
            />
          </Field>
          <Field label={t("field.level")} hint={t("field.level_hint")}>
            <NumInput
              value={menu.level ?? ""}
              onChange={(e) => {
                edit().level =
                  e.target.value === "" ? null : Math.max(1, Number(e.target.value) || 1)
              }}
            />
          </Field>
          {/* Nullable: a buffet package is sold by occasion, not by meal. */}
          <Field label={t("field.meal")}>
            <SelectField
              value={menu.meal_period ?? ""}
              onChange={(v) => {
                edit().meal_period = (v || null) as Menu["meal_period"]
              }}
              options={mealOptions(t)}
            />
          </Field>
        </div>
      </Card>

      {/* ── what is in it ────────────────────────────────────────── */}
      {/* Grouped by course, in the order a buffet is laid out — which is the
          order the packages are written in and the order a guest walks it. A
          flat list hid the shape of the menu: you could not see that a package
          had twenty mains and one salad. */}
      {COURSE_ORDER.map((course) => {
        const rows = menu.items.filter((i) => i.course === course)
        if (rows.length === 0) return null
        const sectionCost = rows.reduce(
          (sum, i) => sum + recipeCost(i.recipe, catalog).perPortion * i.portions_per_cover,
          0,
        )
        return (
          <Card
            key={course}
            title={t(`course.${course}`)}
            description={t("graph.dish_count", { n: rows.length })}
            actions={
              <span className="flex items-center gap-2">
                <span className="text-[12px] font-semibold tabular-nums">{money(sectionCost)}</span>
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label={t("action.add_dish")}
                  onClick={() => onAddDish(menuId, course)}
                >
                  <Plus className="size-3.5" />
                </Button>
              </span>
            }
            bodyClassName="p-0"
          >
            <ul className="divide-y divide-surface-line">
              {rows.map((item) => {
                const recipe = snap.recipes.find((r) => r.id === item.recipe)
                const perPortion = recipeCost(item.recipe, catalog).perPortion
                const label = recipe ? pickName(recipe, locale) : item.recipe
                const share =
                  cost.rawPerCover > 0
                    ? ((perPortion * item.portions_per_cover) / cost.rawPerCover) * 100
                    : 0
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2.5"
                  >
                    {/* basis-full below `sm` puts the name on its own line, so a
                        long Arabic dish name never squeezes the numbers. */}
                    <span className="flex min-w-0 basis-full flex-col sm:flex-1 sm:basis-auto">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "truncate text-[13px]",
                            !recipe && "text-[color:var(--brand-ruby-deep)]",
                          )}
                        >
                          {label}
                        </span>
                        {recipe?.draft && (
                          <span className="shrink-0 rounded bg-[color:var(--brand-amber-soft)] px-1 text-[9px] font-bold text-[color:var(--brand-amber-deep)]">
                            {t("field.uncosted")}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {recipe ? t(`station.${recipe.station}`) : "—"} · {dec2(share)}%
                      </span>
                    </span>

                    <NumInput
                      aria-label={`${t("field.portions_per_cover")} — ${label}`}
                      value={item.portions_per_cover}
                      onChange={(e) => {
                        const live = edit().items.find((x) => x.id === item.id)
                        if (live) live.portions_per_cover = Math.max(0, Number(e.target.value) || 0)
                      }}
                      className="h-7 w-20 text-end"
                    />
                    <span className="w-10 shrink-0 text-[10px] text-muted-foreground">
                      {t("unit.portion")}
                    </span>
                    {/* An uncosted dish costs an unknown amount, not zero —
                        same rule as the canvas chips and the recipe list. */}
                    <span className="w-24 shrink-0 text-end text-[11px] text-muted-foreground tabular-nums">
                      {recipe?.draft ? "—" : `@ ${money(perPortion)}`}
                    </span>
                    <span className="w-24 shrink-0 text-end text-[13px] font-semibold tabular-nums">
                      {recipe?.draft ? "—" : money(perPortion * item.portions_per_cover)}
                    </span>

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${t("action.remove")} — ${label}`}
                      onClick={() => removeMenuItem(menuId, item.id)}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          </Card>
        )
      })}

      {/* An empty package is only empty if it has no inclusions either — the
          whole-lamb station is defined entirely by what comes with it. */}
      {menu.items.length === 0 && menu.inclusions.length === 0 && (
        <Card
          title={t("section.composition")}
          actions={
            <Button size="sm" variant="outline" onClick={() => onAddDish(menuId, "main")}>
              <Plus className="size-3.5" />
              {t("action.add_dish")}
            </Button>
          }
        >
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            {t("empty.composition")}
          </p>
        </Card>
      )}

      {menu.inclusions.length > 0 && (
        <Card title={t("section.inclusions")} bodyClassName="p-0">
          <ul className="divide-y divide-surface-line">
            {menu.inclusions.map((inc, i) => (
              <li key={i} className="px-4 py-2.5 text-[13px]">
                {inc}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ── what it sells for ────────────────────────────────────── */}
      <Card
        title={t("section.pricing")}
        actions={
          <Button size="sm" variant="outline" onClick={() => priceMenuAtTarget(menuId)}>
            <Target className="size-3.5" />
            {t("action.price_at_target")}
          </Button>
        }
      >
        <div className="rounded-xl bg-[color:var(--brand-navy-soft)] px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-bold text-[color:var(--brand-navy-deep)]">
              {t("field.cost")}
            </span>
            <span className="text-2xl font-bold text-[color:var(--brand-navy-deep)] tabular-nums">
              {/* A partially-costed menu's cost is a LOWER BOUND — costing the
                  remaining dishes can only add to it. Printing it bare invites
                  reading a 58%-costed package as cheaper than an 89%-costed
                  one, which is exactly backwards.

                  A "+" suffix, not "≥": U+2265 is Bidi_Mirrored, so in an
                  Arabic run it renders as "≤" and says the opposite. */}
              {money(cost.perCover)}
              {uncosted > 0 ? "+" : ""}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[color:var(--brand-navy-deep)]/70 tabular-nums">
            {money(cost.rawPerCover)} + {t("policy.q_factor_pct")} {money(cost.qFactorPerCover)}
          </div>
          {uncosted > 0 && (
            <div className="mt-1.5 text-[11px] font-semibold text-[color:var(--brand-amber-deep)] tabular-nums">
              {t("field.coverage")} {dec2(coveragePct)}% · {t("field.uncosted")} {uncosted}
            </div>
          )}
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Field label={t("field.price")}>
            <NumInput
              value={menu.price_per_cover_sar ?? ""}
              onChange={(e) => {
                edit().price_per_cover_sar = e.target.value === "" ? null : Number(e.target.value)
              }}
            />
          </Field>
          <div className="rounded-lg bg-surface-sunken px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{t("field.food_cost_pct")}</div>
            <div
              className={cn(
                "mt-0.5 inline-flex rounded-full px-2 py-0.5 text-[15px] font-bold tabular-nums",
                tone.bg,
                tone.fg,
              )}
            >
              {pct(cost.foodCostPct)}
            </div>
          </div>
          <div className="rounded-lg bg-surface-sunken px-3 py-2">
            <div className="text-[10px] text-muted-foreground">{t("field.margin")}</div>
            <div
              className={cn(
                "mt-0.5 text-[15px] font-bold tabular-nums",
                (cost.marginPerCover ?? 0) < 0 && "text-[color:var(--brand-ruby-deep)]",
              )}
            >
              {cost.marginPerCover === null ? "—" : money(cost.marginPerCover)}
            </div>
          </div>
        </div>

        {menu.price_per_cover_sar !== null && (
          <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
            {t("field.with_vat", {
              pct: dec2(snap.policy.vat_pct),
              amount: money(withVat(menu.price_per_cover_sar, snap.policy)),
            })}
          </p>
        )}

        {verdict === "loss" || verdict === "over_target" ? (
          <Note tone="warn" icon={<AlertTriangle className="size-3.5" />}>
            {t("action.price_at_target")}: {money(suggested)}
          </Note>
        ) : (
          <Note tone="brand">
            {t("التكلفة تُكتشَف، والمستهدف سياسة، والسعر ينتج عنهما — لا العكس.")}
          </Note>
        )}

        {[...cost.gaps.unpricedItems, ...cost.gaps.itemsWithoutPreferred].length > 0 && (
          <Note tone="warn" icon={<AlertTriangle className="size-3.5" />}>
            {[...cost.gaps.unpricedItems, ...cost.gaps.itemsWithoutPreferred]
              .map((id) => {
                const x = snap.items.find((i) => i.id === id)
                return x ? pickName(x, locale) : id
              })
              .join("، ")}
          </Note>
        )}
      </Card>
    </>
  )
}
