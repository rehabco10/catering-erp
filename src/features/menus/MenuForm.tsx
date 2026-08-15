import { useTranslation } from "react-i18next"
import { useSnapshot } from "valtio"
import { AlertTriangle, Plus, Target, Trash2 } from "lucide-react"

import { Card, Note } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Field, Input, NumInput, SelectField } from "@/components/ui/field"
import { useLocale } from "@/i18n/LocaleProvider"
import { menuCost, menuVerdict, priceForTarget, recipeCost, withVat } from "@/engine/costing"
import { dec2, foodCostTone, mealOptions, money, pct, pickName, tierOptions, toneClasses } from "@/lib/display"
import type { Menu } from "@/engine/schemas"
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
  onAddDish: (menuId: string) => void
}) {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()

  const menu = snap.menus.find((m) => m.id === menuId)
  if (!menu) return null

  const cost = menuCost(menuId, catalog)
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
          <Field label={t("tier.standard")}>
            <SelectField
              value={menu.tier}
              onChange={(v) => {
                edit().tier = v as Menu["tier"]
              }}
              options={tierOptions(t)}
              allowEmpty={false}
            />
          </Field>
          <Field label={t("field.meal")}>
            <SelectField
              value={menu.meal_period}
              onChange={(v) => {
                edit().meal_period = v as Menu["meal_period"]
              }}
              options={mealOptions(t)}
              allowEmpty={false}
            />
          </Field>
        </div>
      </Card>

      {/* ── what is in it ────────────────────────────────────────── */}
      <Card
        title={t("section.composition")}
        actions={
          <Button size="sm" variant="outline" onClick={() => onAddDish(menuId)}>
            <Plus className="size-3.5" />
            {t("action.add_dish")}
          </Button>
        }
        bodyClassName="p-0"
      >
        {menu.items.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            {t("empty.composition")}
          </p>
        ) : (
          <ul className="divide-y divide-surface-line">
            {menu.items.map((item) => {
              const recipe = snap.recipes.find((r) => r.id === item.recipe)
              const perPortion = recipeCost(item.recipe, catalog).perPortion
              const label = recipe ? pickName(recipe, locale) : item.recipe
              const share = cost.rawPerCover > 0
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
                    <span
                      className={cn(
                        "truncate text-[13px]",
                        !recipe && "text-[color:var(--brand-ruby-deep)]",
                      )}
                    >
                      {label}
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
                  <span className="w-24 shrink-0 text-end text-[11px] text-muted-foreground tabular-nums">
                    @ {money(perPortion)}
                  </span>
                  <span className="w-24 shrink-0 text-end text-[13px] font-semibold tabular-nums">
                    {money(perPortion * item.portions_per_cover)}
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
        )}
      </Card>

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
              {money(cost.perCover)}
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[color:var(--brand-navy-deep)]/70 tabular-nums">
            {money(cost.rawPerCover)} + {t("policy.q_factor_pct")} {money(cost.qFactorPerCover)}
          </div>
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

        {cost.gaps.unpricedIngredients.length > 0 && (
          <Note tone="warn" icon={<AlertTriangle className="size-3.5" />}>
            {cost.gaps.unpricedIngredients
              .map((id) => {
                const x = snap.ingredients.find((i) => i.id === id)
                return x ? pickName(x, locale) : id
              })
              .join("، ")}
          </Note>
        )}
      </Card>
    </>
  )
}
