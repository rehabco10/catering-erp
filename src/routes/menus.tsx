import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { useSnapshot } from "valtio"
import { Target, Trash2 } from "lucide-react"

import { MasterDetail } from "@/components/MasterDetail"
import { Card, Note, PageHeader } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { NumInput, SelectField, cellCls } from "@/components/ui/field"
import { FilterChips } from "@/components/ui/filter-chips"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useLocale, useLocalePath } from "@/i18n/LocaleProvider"
import { menuCost, menuVerdict, priceForTarget, recipeCost } from "@/engine/costing"
import { dec2, foodCostTone, money, pct, pickName, toneClasses } from "@/lib/display"
import type { MenuTierValue } from "@/engine/schemas"
import { cn } from "@/lib/utils"
import { addMenuItem, priceMenuAtTarget, removeMenuItem, state } from "@/store/ops"
import { useCatalog } from "@/store/use-issues"

/**
 * Menu engineering.
 *
 * The page is built around one direction of travel: cost is *discovered* by
 * exploding the recipes, the food-cost target is *policy*, and the price falls
 * out of the two. «تسعير على المستهدف» is that calculation as a button, so the
 * arithmetic nobody does by hand stops being optional.
 */
export function MenusPage() {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const localePath = useLocalePath()
  const { menuId } = useParams()
  const [tier, setTier] = useState<MenuTierValue | null>(null)

  const costed = useMemo(
    () => snap.menus.map((m) => ({ menu: m, cost: menuCost(m.id, catalog) })),
    [snap.menus, catalog],
  )
  const shown = tier ? costed.filter((c) => c.menu.tier === tier) : costed
  const selected = menuId ? snap.menus.find((m) => m.id === menuId) : undefined
  const go = (id: string | null) => navigate(localePath(id ? `/menus/${id}` : "/menus"))

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-page">
      <PageHeader title={t("page.menus")} description={t("page.menus_desc")} />
      <div className="min-h-0 flex-1 px-4 py-4">
        <MasterDetail
          detailOpen={Boolean(selected)}
          onBack={() => go(null)}
          placeholder={t("empty.menus")}
          master={
            <>
              <FilterChips
                value={tier}
                onChange={setTier}
                options={(["economy", "standard", "premium"] as MenuTierValue[]).map((v) => ({
                  value: v,
                  label: t(`tier.${v}`),
                  count: costed.filter((c) => c.menu.tier === v).length,
                }))}
              />
              {shown.map(({ menu, cost }) => {
                const tone = toneClasses[foodCostTone(cost.foodCostPct, snap.policy.target_food_cost_pct)]
                const active = menu.id === menuId
                return (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => go(menu.id)}
                    className={cn(
                      "block w-full rounded-xl border bg-surface-raised p-3 text-start shadow-[var(--elev-1)] transition-colors",
                      active
                        ? "border-[color:var(--brand-navy)] ring-1 ring-[color:var(--brand-navy)]"
                        : "border-surface-line hover:bg-surface-sunken",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-bold">{pickName(menu, locale)}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t(`tier.${menu.tier}`)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {t(`meal.${menu.meal_period}`)} · {menu.items.length}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="text-[12px] tabular-nums">
                        {money(cost.perCover)}
                        <span className="text-muted-foreground">
                          {" / "}
                          {cost.pricePerCover === null ? "—" : money(cost.pricePerCover)}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
                          tone.bg,
                          tone.fg,
                        )}
                      >
                        {pct(cost.foodCostPct)}
                      </span>
                    </div>
                  </button>
                )
              })}
            </>
          }
          detail={selected ? <MenuDetail menuId={selected.id} /> : null}
        />
      </div>
    </div>
  )
}

/* ── detail ─────────────────────────────────────────────────────── */

function MenuDetail({ menuId }: { menuId: string }) {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const menu = snap.menus.find((m) => m.id === menuId)
  const [adding, setAdding] = useState("")

  if (!menu) return null
  const cost = menuCost(menuId, catalog)
  const verdict = menuVerdict(cost, snap.policy)
  const suggested = priceForTarget(cost.perCover, snap.policy.target_food_cost_pct)
  const tone = toneClasses[foodCostTone(cost.foodCostPct, snap.policy.target_food_cost_pct)]

  const unused = snap.recipes
    .filter((r) => !menu.items.some((i) => i.recipe === r.id))
    .map((r) => ({ value: r.id, label: pickName(r, locale) }))

  return (
    <>
      <Card
        title={pickName(menu, locale)}
        description={`${t(`tier.${menu.tier}`)} · ${t(`meal.${menu.meal_period}`)}`}
        actions={
          <Button size="sm" variant="outline" onClick={() => priceMenuAtTarget(menuId)}>
            <Target className="size-3.5" />
            {t("action.price_at_target")}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div>
            <div className="text-[11px] text-muted-foreground">{t("field.cost")}</div>
            <div className="mt-0.5 text-[15px] font-bold tabular-nums">
              {money(cost.perCover)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">{t("field.price")}</div>
            <div className="mt-1">
              <NumInput
                value={menu.price_per_cover_sar ?? ""}
                onChange={(e) => {
                  const live = state.menus.find((m) => m.id === menuId)
                  if (live) live.price_per_cover_sar = Number(e.target.value) || null
                }}
              />
            </div>
          </div>
          <div>
            <div className="text-[11px] text-muted-foreground">{t("field.food_cost_pct")}</div>
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
          <div>
            <div className="text-[11px] text-muted-foreground">{t("field.margin")}</div>
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

        {verdict === "loss" || verdict === "over_target" ? (
          <Note tone="warn">
            {t("action.price_at_target")}: {money(suggested)}
          </Note>
        ) : (
          <Note tone="brand">
            {t("التكلفة تُكتشَف، والمستهدف سياسة، والسعر ينتج عنهما — لا العكس.")}
          </Note>
        )}
      </Card>

      <Card
        title={t("nav.recipes")}
        actions={
          <div className="flex items-center gap-1.5">
            <SelectField
              value={adding}
              onChange={setAdding}
              options={unused}
              className="w-44"
              placeholder={t("action.add_recipe")}
            />
            <Button
              size="sm"
              disabled={!adding}
              onClick={() => {
                addMenuItem(menuId, adding)
                setAdding("")
              }}
            >
              {t("action.finish")}
            </Button>
          </div>
        }
        bodyClassName="p-0"
      >
        <Table className="min-w-[34rem]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("nav.recipes")}</TableHead>
              <TableHead>{t("field.station")}</TableHead>
              <TableHead className="text-end">{t("field.portions_per_cover")}</TableHead>
              <TableHead className="text-end">{t("field.cost")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {menu.items.map((item) => {
              const recipe = snap.recipes.find((r) => r.id === item.recipe)
              const rc = recipeCost(item.recipe, catalog)
              return (
                <TableRow key={item.id}>
                  <TableCell className="px-2.5 text-[12px] font-medium">
                    {recipe ? pickName(recipe, locale) : item.recipe}
                  </TableCell>
                  <TableCell className="px-2.5 text-[11px] text-muted-foreground">
                    {recipe ? t(`station.${recipe.station}`) : "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    <input
                      className={cn(cellCls, "w-16 rounded-md border text-end tabular-nums")}
                      dir="ltr"
                      value={item.portions_per_cover}
                      onChange={(e) => {
                        const live = state.menus
                          .find((m) => m.id === menuId)
                          ?.items.find((x) => x.id === item.id)
                        if (live) live.portions_per_cover = Number(e.target.value) || 0
                      }}
                    />
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                    {money(rc.perPortion * item.portions_per_cover)}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("action.finish")}
                      onClick={() => removeMenuItem(menuId, item.id)}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="px-2.5 text-[12px] font-semibold" colSpan={3}>
                {t("policy.q_factor_pct")} ({dec2(snap.policy.q_factor_pct)}%)
              </TableCell>
              <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                {money(cost.qFactorPerCover)}
              </TableCell>
              <TableCell />
            </TableRow>
            <TableRow>
              <TableCell className="px-2.5 text-[12px] font-bold" colSpan={3}>
                {t("field.cost")}
              </TableCell>
              <TableCell className="px-2.5 text-end text-[12px] font-bold tabular-nums">
                {money(cost.perCover)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {cost.gaps.unpricedIngredients.length > 0 && (
        <Card title={t("issue.supply")}>
          <ul className="space-y-1 text-[12px] text-muted-foreground">
            {cost.gaps.unpricedIngredients.map((id) => {
              const ing = snap.ingredients.find((x) => x.id === id)
              return <li key={id}>· {ing ? pickName(ing, locale) : id}</li>
            })}
          </ul>
        </Card>
      )}
    </>
  )
}
