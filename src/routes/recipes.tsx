import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { useSnapshot } from "valtio"
import { CornerDownLeft, Trash2 } from "lucide-react"

import { MasterDetail } from "@/components/MasterDetail"
import { Card, Note, PageHeader, Stat } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { SelectField, cellCls } from "@/components/ui/field"
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
import { apUnitCost, epUnitCost, explodeRecipe, recipeCost } from "@/engine/costing"
import { dec2, int, money, pickName } from "@/lib/display"
import type { StationValue } from "@/engine/schemas"
import { cn } from "@/lib/utils"
import { addRecipeLine, removeRecipeLine, state } from "@/store/ops"
import { useCatalog } from "@/store/use-issues"

/**
 * Recipes as a bill of materials.
 *
 * The detail pane shows the tree twice on purpose: the *lines* as written
 * (including sub-recipes, which is how a chef thinks) and the *exploded* raw
 * requirement underneath (which is what gets bought). A spice mix costing 0.12
 * kg of cardamom per batch is invisible in the first view and unmissable in the
 * second — and only the second reaches the purchase list.
 */
export function RecipesPage() {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const localePath = useLocalePath()
  const { recipeId } = useParams()
  const [station, setStation] = useState<StationValue | null>(null)

  const costed = useMemo(
    () => snap.recipes.map((r) => ({ recipe: r, cost: recipeCost(r.id, catalog) })),
    [snap.recipes, catalog],
  )
  const shown = station ? costed.filter((c) => c.recipe.station === station) : costed
  const selected = recipeId ? snap.recipes.find((r) => r.id === recipeId) : undefined
  const go = (id: string | null) => navigate(localePath(id ? `/recipes/${id}` : "/recipes"))

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-page">
      <PageHeader title={t("page.recipes")} description={t("page.recipes_desc")} />
      <div className="min-h-0 flex-1 px-4 py-4">
        <MasterDetail
          detailOpen={Boolean(selected)}
          onBack={() => go(null)}
          placeholder={t("empty.recipes")}
          master={
            <>
              <FilterChips
                value={station}
                onChange={setStation}
                options={(["hot", "cold", "bakery", "beverage", "assembly"] as StationValue[]).map(
                  (v) => ({
                    value: v,
                    label: t(`station.${v}`),
                    count: costed.filter((c) => c.recipe.station === v).length,
                  }),
                )}
              />
              {shown.map(({ recipe, cost }) => {
                const active = recipe.id === recipeId
                return (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => go(recipe.id)}
                    className={cn(
                      "block w-full rounded-xl border bg-surface-raised p-3 text-start shadow-[var(--elev-1)] transition-colors",
                      active
                        ? "border-[color:var(--brand-navy)] ring-1 ring-[color:var(--brand-navy)]"
                        : "border-surface-line hover:bg-surface-sunken",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-bold">
                        {pickName(recipe, locale)}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t(`station.${recipe.station}`)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {int(recipe.yield_portions)} × {int(recipe.portion_size_g)}g
                    </p>
                    <p className="mt-1.5 text-[12px] font-semibold tabular-nums">
                      {money(cost.perPortion)}
                    </p>
                  </button>
                )
              })}
            </>
          }
          detail={selected ? <RecipeDetail recipeId={selected.id} /> : null}
        />
      </div>
    </div>
  )
}

/* ── detail ─────────────────────────────────────────────────────── */

function RecipeDetail({ recipeId }: { recipeId: string }) {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const recipe = snap.recipes.find((r) => r.id === recipeId)
  const [addKind, setAddKind] = useState<"ingredient" | "recipe">("ingredient")
  const [addRef, setAddRef] = useState("")

  if (!recipe) return null
  const cost = recipeCost(recipeId, catalog)
  const exploded = explodeRecipe(recipeId, recipe.yield_portions, catalog)

  const refOptions =
    addKind === "ingredient"
      ? snap.ingredients.map((i) => ({ value: i.id, label: pickName(i, locale) }))
      : snap.recipes
          .filter((r) => r.id !== recipeId)
          .map((r) => ({ value: r.id, label: pickName(r, locale) }))

  const nameOf = (kind: string, ref: string) => {
    const e =
      kind === "ingredient"
        ? snap.ingredients.find((x) => x.id === ref)
        : snap.recipes.find((x) => x.id === ref)
    return e ? pickName(e, locale) : ref
  }

  return (
    <>
      <Card
        title={pickName(recipe, locale)}
        description={t(`station.${recipe.station}`)}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat value={int(recipe.yield_portions)} label={t("field.yield_portions")} />
          <Stat value={`${int(recipe.portion_size_g)}g`} label={t("field.portion_size")} />
          <Stat value={int(recipe.prep_minutes)} label={t("field.prep_minutes")} />
          <Stat
            value={int(recipe.shelf_life_hours)}
            label={t("field.shelf_life")}
            tone={recipe.shelf_life_hours < 24 ? "warn" : "neutral"}
          />
        </div>
        {recipe.shelf_life_hours < 24 && (
          <Note tone="warn">{t("page.production_desc")}</Note>
        )}
      </Card>

      <Card
        title={t("nav.recipes")}
        actions={
          <div className="flex items-center gap-1.5">
            <SelectField
              value={addKind}
              onChange={(v) => {
                setAddKind(v as "ingredient" | "recipe")
                setAddRef("")
              }}
              options={[
                { value: "ingredient", label: t("cat.dry_goods") },
                { value: "recipe", label: t("nav.recipes") },
              ]}
              allowEmpty={false}
              className="w-32"
            />
            <SelectField
              value={addRef}
              onChange={setAddRef}
              options={refOptions}
              className="w-40"
            />
            <Button
              size="sm"
              disabled={!addRef}
              onClick={() => {
                addRecipeLine(recipeId, addKind, addRef, 1)
                setAddRef("")
              }}
            >
              {t("action.finish")}
            </Button>
          </div>
        }
        bodyClassName="p-0"
      >
        <Table className="min-w-[36rem]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("cat.dry_goods")}</TableHead>
              <TableHead className="text-end">{t("units.portions", { n: "" })}</TableHead>
              <TableHead className="text-end">{t("field.yield")}</TableHead>
              <TableHead className="text-end">{t("field.ep_cost")}</TableHead>
              <TableHead className="text-end">{t("field.cost")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipe.lines.map((line) => {
              const ing =
                line.kind === "ingredient"
                  ? snap.ingredients.find((x) => x.id === line.ref)
                  : undefined
              const sub =
                line.kind === "recipe" ? recipeCost(line.ref, catalog).perPortion : null
              const unit = ing ? epUnitCost(ing) : sub
              return (
                <TableRow key={line.id}>
                  <TableCell className="px-2.5 text-[12px]">
                    <span className="flex items-center gap-1.5">
                      {line.kind === "recipe" && (
                        <CornerDownLeft className="size-3 shrink-0 text-[color:var(--brand-navy)]" />
                      )}
                      {nameOf(line.kind, line.ref)}
                    </span>
                  </TableCell>
                  <TableCell className="text-end">
                    <input
                      className={cn(cellCls, "w-20 rounded-md border text-end tabular-nums")}
                      dir="ltr"
                      value={line.qty}
                      onChange={(e) => {
                        const live = state.recipes
                          .find((r) => r.id === recipeId)
                          ?.lines.find((l) => l.id === line.id)
                        if (live) live.qty = Number(e.target.value) || 0
                      }}
                    />
                    <span className="ms-1 text-[10px] text-muted-foreground">
                      {ing ? ing.base_unit : t("units.portions", { n: "" })}
                    </span>
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[11px] text-muted-foreground tabular-nums">
                    {ing ? `${dec2(ing.yield_pct)}%` : "—"}
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[11px] tabular-nums">
                    {unit === null ? "—" : money(unit)}
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[12px] font-medium tabular-nums">
                    {unit === null ? "—" : money(unit * line.qty)}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t("action.finish")}
                      onClick={() => removeRecipeLine(recipeId, line.id)}
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
              <TableCell className="px-2.5 text-[12px] font-bold" colSpan={4}>
                {t("units.batches", { n: 1 })}
              </TableCell>
              <TableCell className="px-2.5 text-end text-[12px] font-bold tabular-nums">
                {money(cost.perBatch)}
              </TableCell>
              <TableCell />
            </TableRow>
            <TableRow>
              <TableCell className="px-2.5 text-[12px] font-bold" colSpan={4}>
                {t("units.portions", { n: 1 })}
              </TableCell>
              <TableCell className="px-2.5 text-end text-[12px] font-bold tabular-nums">
                {money(cost.perPortion)}
              </TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </Card>

      {/* The purchase-side view: what one batch actually consumes once every
          sub-recipe is walked, at as-purchased prices. */}
      <Card title={t("nav.procurement")} bodyClassName="p-0">
        <Table className="min-w-[30rem]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("cat.dry_goods")}</TableHead>
              <TableHead className="text-end">{t("field.production")}</TableHead>
              <TableHead className="text-end">{t("field.ap_cost")}</TableHead>
              <TableHead className="text-end">{t("field.ep_cost")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...exploded.requirements.entries()].map(([id, qty]) => {
              const ing = snap.ingredients.find((x) => x.id === id)
              if (!ing) return null
              return (
                <TableRow key={id}>
                  <TableCell className="px-2.5 text-[12px]">{pickName(ing, locale)}</TableCell>
                  <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                    {dec2(qty)} {ing.base_unit}
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[11px] text-muted-foreground tabular-nums">
                    {apUnitCost(ing) === null ? "—" : money(apUnitCost(ing)!)}
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[11px] tabular-nums">
                    {epUnitCost(ing) === null ? "—" : money(epUnitCost(ing)!)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <div className="px-4 py-3">
          <Note tone="brand">
            {t("سعر الشراء يُقسَم على نسبة الاستخلاص للحصول على تكلفة ما يصل الطبق فعلًا.")}
          </Note>
        </div>
      </Card>

      {/* The explosion cuts cycles and skips dangling refs rather than throwing,
          so the only place they become visible is here and on the checks page. */}
      {(cost.gaps.cycles.length > 0 || cost.gaps.missingRefs.length > 0) && (
        <Card title={t("issue.kitchen")}>
          <ul className="space-y-1 text-[12px] text-[color:var(--brand-ruby-deep)]">
            {cost.gaps.cycles.map((id) => (
              <li key={`cycle-${id}`}>· {nameOf("recipe", id)}</li>
            ))}
            {cost.gaps.missingRefs.map((id) => (
              <li key={`missing-${id}`} className="text-muted-foreground">
                · {id}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
