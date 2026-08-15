import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { useSnapshot } from "valtio"
import { AlertTriangle, Clock, CornerDownLeft, Plus, Trash2 } from "lucide-react"

import { MasterDetail } from "@/components/MasterDetail"
import { Card, Disclosure, Note, PageHeader } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { NumInput } from "@/components/ui/field"
import { FilterChips } from "@/components/ui/filter-chips"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AddLineSheet } from "@/features/recipes/AddLineSheet"
import { useLocale, useLocalePath } from "@/i18n/LocaleProvider"
import { costingVariant, explodeRecipe, itemUnitCost, recipeCost } from "@/engine/costing"
import { dec2, int, money, pickName } from "@/lib/display"
import type { StationValue } from "@/engine/schemas"
import { cn } from "@/lib/utils"
import { removeRecipeLine, state } from "@/store/ops"
import { useCatalog } from "@/store/use-issues"

/**
 * Recipes, as costing cards.
 *
 * The detail is modelled on the sheet a chef actually keeps: the spec at the
 * top, the build in the middle, and the cost per portion as the headline —
 * because that number is what the page exists to produce, and it used to be the
 * last row of a table footer.
 *
 * What the exploded raw requirement and the menus using this recipe have in
 * common is that both matter *sometimes*: when a sub-recipe is involved, or
 * when you are about to change a quantity that three menus depend on. Both are
 * disclosures rather than sections, so the page is short until you ask.
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
                options={(["hot", "cold", "bakery", "beverage", "assembly"] as StationValue[])
                  .map((v) => ({
                    value: v,
                    label: t(`station.${v}`),
                    count: costed.filter((c) => c.recipe.station === v).length,
                  }))
                  .filter((o) => o.count > 0)}
              />
              {shown.map(({ recipe, cost }) => (
                <button
                  key={recipe.id}
                  type="button"
                  onClick={() => go(recipe.id)}
                  className={cn(
                    "block w-full rounded-xl border bg-surface-raised p-3 text-start shadow-[var(--elev-1)] transition-colors",
                    recipe.id === recipeId
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
                  <p className="mt-1.5 text-[13px] font-bold tabular-nums">
                    {money(cost.perPortion)}
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {" / "}
                      {t("unit.portion")}
                    </span>
                  </p>
                </button>
              ))}
            </>
          }
          detail={selected ? <CostingCard recipeId={selected.id} /> : null}
        />
      </div>
    </div>
  )
}

/* ── the costing card ───────────────────────────────────────────── */

function CostingCard({ recipeId }: { recipeId: string }) {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const [adding, setAdding] = useState(false)

  const recipe = snap.recipes.find((r) => r.id === recipeId)
  if (!recipe) return null

  const cost = recipeCost(recipeId, catalog)
  const exploded = explodeRecipe(recipeId, recipe.yield_portions, catalog)
  const usedBy = snap.menus.filter((m) => m.items.some((i) => i.recipe === recipeId))
  const usedIn = snap.recipes.filter((r) =>
    r.lines.some((l) => l.kind === "recipe" && l.ref === recipeId),
  )
  const sameDay = recipe.shelf_life_hours < 24

  /** The live record, for edits. `snap` is a frozen read-only view. */
  const edit = () => state.recipes.find((r) => r.id === recipeId)!

  return (
    <>
      {/* ── spec ─────────────────────────────────────────────────── */}
      <Card title={pickName(recipe, locale)} description={t(`station.${recipe.station}`)}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <SpecField
            label={t("field.yield_portions")}
            value={recipe.yield_portions}
            suffix={t("unit.portion")}
            onChange={(v) => {
              // Guarded at 1: the yield divides the batch cost, and zero would
              // make every portion cost Infinity across three screens.
              edit().yield_portions = Math.max(1, v)
            }}
          />
          <SpecField
            label={t("field.portion_size")}
            value={recipe.portion_size_g}
            suffix="g"
            onChange={(v) => {
              edit().portion_size_g = Math.max(1, v)
            }}
          />
          <SpecField
            label={t("field.prep_minutes")}
            value={recipe.prep_minutes}
            suffix={t("units.minutes", { n: "" }).trim()}
            onChange={(v) => {
              edit().prep_minutes = Math.max(0, v)
            }}
          />
          <SpecField
            label={t("field.shelf_life")}
            value={recipe.shelf_life_hours}
            suffix="h"
            tone={sameDay ? "warn" : "neutral"}
            onChange={(v) => {
              edit().shelf_life_hours = Math.max(1, v)
            }}
          />
        </div>
        {sameDay && (
          <Note tone="warn" icon={<Clock className="size-3.5" />}>
            {t("مدة الصلاحية أقل من ٢٤ ساعة — تُحضَّر في يوم التقديم.")}
          </Note>
        )}
      </Card>

      {/* ── the build ────────────────────────────────────────────── */}
      <Card
        title={t("section.build")}
        actions={
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            {t("action.add_line")}
          </Button>
        }
        bodyClassName="p-0"
      >
        {recipe.lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
            {t("empty.build")}
          </p>
        ) : (
          <ul className="divide-y divide-surface-line">
            {recipe.lines.map((line) => {
              const sub = line.kind === "recipe"
              const item = sub ? undefined : snap.items.find((x) => x.id === line.ref)
              const child = sub ? snap.recipes.find((x) => x.id === line.ref) : undefined
              // Items price through their costing basis, never through a
              // variant the recipe chose — that decision belongs to the item.
              const unitCost = sub
                ? recipeCost(line.ref, catalog).perPortion
                : item
                  ? itemUnitCost(item.id, catalog)
                  : null
              const unit = sub ? t("unit.portion") : item ? t(`unit.${item.base_unit}`) : ""
              const label = sub
                ? child
                  ? pickName(child, locale)
                  : line.ref
                : item
                  ? pickName(item, locale)
                  : line.ref

              return (
                <li
                  key={line.id}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1.5 px-3 py-2.5"
                >
                  {/* basis-full below `sm` puts the name on its own line, so a
                      long Arabic ingredient name never squeezes the numbers. */}
                  <span className="flex min-w-0 basis-full items-center gap-1.5 sm:flex-1 sm:basis-auto">
                    {sub && (
                      <CornerDownLeft
                        aria-label={t("group.sub_recipes")}
                        className="size-3.5 shrink-0 text-[color:var(--brand-navy)]"
                      />
                    )}
                    <span className={cn("truncate text-[13px]", !item && !child && "text-[color:var(--brand-ruby-deep)]")}>
                      {label}
                    </span>
                  </span>

                  <NumInput
                    aria-label={label}
                    value={line.qty}
                    onChange={(e) => {
                      const live = edit().lines.find((l) => l.id === line.id)
                      if (live) live.qty = Math.max(0, Number(e.target.value) || 0)
                    }}
                    className="h-7 w-20 text-end"
                  />
                  <span className="w-10 shrink-0 text-[10px] text-muted-foreground">{unit}</span>

                  <span className="w-24 shrink-0 text-end text-[11px] text-muted-foreground tabular-nums">
                    {unitCost === null ? "—" : `@ ${money(unitCost)}`}
                  </span>
                  <span className="w-24 shrink-0 text-end text-[13px] font-semibold tabular-nums">
                    {unitCost === null ? "—" : money(unitCost * line.qty)}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t("action.remove")} — ${label}`}
                    onClick={() => removeRecipeLine(recipeId, line.id)}
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        {/* ── the headline ───────────────────────────────────────── */}
        <div className="border-t border-surface-line p-3">
          <div className="rounded-xl bg-[color:var(--brand-navy-soft)] px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[11px] font-bold text-[color:var(--brand-navy-deep)]">
                {t("field.per_portion")}
              </span>
              <span className="text-2xl font-bold text-[color:var(--brand-navy-deep)] tabular-nums">
                {money(cost.perPortion)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--brand-navy-deep)]/70 tabular-nums">
              {t("field.per_batch")} {money(cost.perBatch)} · {int(recipe.yield_portions)}{" "}
              {t("unit.portion")}
            </div>
          </div>

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
          {(cost.gaps.cycles.length > 0 || cost.gaps.missingRefs.length > 0) && (
            <Note tone="warn" icon={<AlertTriangle className="size-3.5" />}>
              {[...cost.gaps.cycles, ...cost.gaps.missingRefs].join("، ")}
            </Note>
          )}
        </div>
      </Card>

      {/* ── what it actually consumes ────────────────────────────── */}
      <Disclosure
        title={t("section.raw_requirement")}
        count={int(exploded.requirements.size)}
      >
        <Table className="min-w-[28rem]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("group.items")}</TableHead>
              <TableHead className="text-end">{t("field.per_batch")}</TableHead>
              <TableHead className="text-end">{t("field.ep_cost")}</TableHead>
              <TableHead className="text-end">{t("field.cost")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...exploded.requirements.entries()].map(([id, qty]) => {
              const reqItem = snap.items.find((x) => x.id === id)
              if (!reqItem) return null
              const basis = costingVariant(id, catalog)
              const ep = itemUnitCost(id, catalog)
              return (
                <TableRow key={id}>
                  <TableCell className="px-2.5 text-[12px]">
                    {pickName(reqItem, locale)}
                    <span className="block text-[10px] text-muted-foreground">
                      {basis ? pickName(basis, locale) : t("field.no_basis")}
                    </span>
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                    {dec2(qty)} {t(`unit.${reqItem.base_unit}`)}
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[11px] tabular-nums">
                    {ep === null ? "—" : money(ep)}
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[12px] font-medium tabular-nums">
                    {ep === null ? "—" : money(ep * qty)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <p className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          {t("سعر الشراء يُقسَم على نسبة الاستخلاص للحصول على تكلفة ما يصل الطبق فعلًا.")}
        </p>
      </Disclosure>

      {/* ── the chain upward ─────────────────────────────────────── */}
      {(usedBy.length > 0 || usedIn.length > 0) && (
        <Disclosure
          title={t("section.used_by")}
          count={int(usedBy.length + usedIn.length)}
        >
          <ul className="divide-y divide-surface-line">
            {usedIn.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-4 py-2.5 text-[12px]">
                <CornerDownLeft className="size-3.5 shrink-0 text-[color:var(--brand-navy)]" />
                <span className="min-w-0 flex-1 truncate">{pickName(r, locale)}</span>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {t("group.sub_recipes")}
                </span>
              </li>
            ))}
            {usedBy.map((m) => {
              const item = m.items.find((i) => i.recipe === recipeId)!
              return (
                <li key={m.id} className="flex items-center gap-2 px-4 py-2.5 text-[12px]">
                  <span className="min-w-0 flex-1 truncate">{pickName(m, locale)}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {dec2(item.portions_per_cover)} {t("unit.portion")}
                  </span>
                </li>
              )
            })}
          </ul>
        </Disclosure>
      )}

      <AddLineSheet recipeId={recipeId} open={adding} onOpenChange={setAdding} />
    </>
  )
}

/**
 * A spec value that is editable in place.
 *
 * These four numbers were read-only tiles before, which was wrong for a costing
 * card: batch yield is the number a chef adjusts most often, and it is the
 * divisor on the headline directly below it.
 */
function SpecField({
  label,
  value,
  suffix,
  tone = "neutral",
  onChange,
}: {
  label: string
  value: number
  suffix?: string
  tone?: "neutral" | "warn"
  onChange: (value: number) => void
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-2.5 py-1.5",
        tone === "warn" ? "bg-[color:var(--brand-amber-soft)]" : "bg-surface-sunken",
      )}
    >
      <div
        className={cn(
          "text-[10px]",
          tone === "warn" ? "text-[color:var(--brand-amber-deep)]" : "text-muted-foreground",
        )}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-1">
        <NumInput
          aria-label={label}
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="h-6 w-full border-0 bg-transparent px-0 text-[15px] font-bold shadow-none focus-visible:ring-0"
        />
        {suffix && <span className="shrink-0 text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  )
}
