import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { useSnapshot } from "valtio"
import { PackagePlus, Plus, ShieldAlert } from "lucide-react"

import { MasterDetail } from "@/components/MasterDetail"
import { AddIngredientWizard } from "@/features/inventory/AddIngredientWizard"
import { Card, Note, PageHeader, Stat } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Field, NumInput } from "@/components/ui/field"
import { FilterChips } from "@/components/ui/filter-chips"
import { Meter } from "@/components/ui/meter"
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
import { apUnitCost, epUnitCost, recipeCost } from "@/engine/costing"
import { dec2, int, money, money0, pickName } from "@/lib/display"
import { inventoryValue, reorderList } from "@/engine/inventory"
import type { IngredientCategoryValue } from "@/engine/schemas"
import { cn } from "@/lib/utils"
import { receiveStock, state, supplierById, supplierMap } from "@/store/ops"
import { day } from "@/store/seed"
import { useCatalog } from "@/store/use-issues"

/**
 * Stock, and the money sitting in it.
 *
 * This is the first of the three parts and the foundation of the other two:
 * an ingredient's pack price and yield are what every recipe and every menu
 * downstream is costed from, so this page is where a wrong number does the
 * most damage. It leads with the two figures that are easiest to get wrong and
 * hardest to notice — the yield, and the gap between pack price and unit cost.
 *
 * Selection lives in the URL (`/inventory/:ingredientId`), so a finding on the
 * checks page can link straight at the row that caused it.
 */
export function InventoryPage() {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const localePath = useLocalePath()
  const { ingredientId } = useParams()
  const [category, setCategory] = useState<IngredientCategoryValue | null>(null)
  const [adding, setAdding] = useState(false)

  const today = day(0)
  const reorder = useMemo(
    () => reorderList(catalog, supplierMap(state), today),
    [catalog, today],
  )
  const stockValue = useMemo(() => inventoryValue(catalog), [catalog])

  const counts = snap.ingredients.reduce<Record<string, number>>((acc, i) => {
    acc[i.category] = (acc[i.category] ?? 0) + 1
    return acc
  }, {})
  const shown = category
    ? snap.ingredients.filter((i) => i.category === category)
    : snap.ingredients
  const selected = ingredientId ? snap.ingredients.find((i) => i.id === ingredientId) : undefined
  // An explicit `/inventory` segment rather than ids at the root: a bare
  // `/:id` route would happily swallow `/menus` as an ingredient id.
  const go = (id: string | null) =>
    navigate(localePath(id ? `/inventory/${id}` : "/inventory"))

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-page">
      <PageHeader
        title={t("page.inventory")}
        description={t("page.inventory_desc")}
        actions={
          <>
            <span className="text-[12px] font-semibold tabular-nums">
              {money0(stockValue)}
            </span>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              {t("action.add_ingredient")}
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 px-4 py-4">
        <MasterDetail
          detailOpen={Boolean(selected)}
          onBack={() => go(null)}
          placeholder={t("empty.inventory")}
          master={
            <>
              <FilterChips
                value={category}
                onChange={setCategory}
                options={(Object.keys(counts) as IngredientCategoryValue[]).map((c) => ({
                  value: c,
                  label: t(`cat.${c}`),
                  count: counts[c],
                }))}
              />
              {shown.map((ing) => {
                const sup = supplierById(ing.supplier, state)
                const certLapsed =
                  ing.halal_critical &&
                  (!sup?.halal_cert_no || (sup.halal_cert_expiry ?? "") < today)
                const active = ing.id === ingredientId
                return (
                  <button
                    key={ing.id}
                    type="button"
                    onClick={() => go(ing.id)}
                    className={cn(
                      "block w-full rounded-xl border bg-surface-raised p-3 text-start shadow-[var(--elev-1)] transition-colors",
                      active
                        ? "border-[color:var(--brand-navy)] ring-1 ring-[color:var(--brand-navy)]"
                        : "border-surface-line hover:bg-surface-sunken",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {certLapsed && (
                          <ShieldAlert
                            className="size-3.5 shrink-0 text-[color:var(--brand-ruby)]"
                            aria-label={t("field.halal_cert")}
                          />
                        )}
                        <span className="truncate text-[13px] font-bold">
                          {pickName(ing, locale)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t(`cat.${ing.category}`)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
                      {t(`storage.${ing.storage}`)} · {dec2(ing.pack_size)} {ing.base_unit} /{" "}
                      {t(`pack.${ing.pack_unit}`)}
                    </p>
                    {/* Bound as a floor: the par level is the goal, and falling
                        under it is what the colour has to say. */}
                    <div className="mt-2">
                      <Meter value={ing.on_hand} max={ing.par_level} bound="min" />
                    </div>
                  </button>
                )
              })}
            </>
          }
          detail={selected ? <IngredientDetail ingredientId={selected.id} /> : null}
        />
      </div>

      {/* The reorder sheet sits under the split view rather than inside it: it
          is about the whole store, not the selected row. */}
      {reorder.length > 0 && (
        <div className="shrink-0 border-t border-surface-line bg-surface-raised">
          <details className="px-4 py-2">
            <summary className="cursor-pointer text-[12px] font-bold">
              {t("inventory.reorder")}
              <span className="ms-2 rounded-full bg-[color:var(--brand-amber-soft)] px-2 py-0.5 text-[10px] text-[color:var(--brand-amber-deep)] tabular-nums">
                {int(reorder.length)}
              </span>
            </summary>
            <div className="pb-2">
              <Table className="min-w-[34rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("nav.inventory")}</TableHead>
                    <TableHead className="text-end">{t("field.shortfall")}</TableHead>
                    <TableHead className="text-end">{t("field.pack")}</TableHead>
                    <TableHead>{t("field.supplier")}</TableHead>
                    <TableHead>{t("field.arrives_on")}</TableHead>
                    <TableHead className="text-end">{t("field.cost")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reorder.map((line) => (
                    <TableRow key={line.ingredient.id}>
                      <TableCell className="px-2.5 text-[12px] font-medium">
                        {pickName(line.ingredient, locale)}
                      </TableCell>
                      <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                        {dec2(line.shortfall)} {line.ingredient.base_unit}
                      </TableCell>
                      <TableCell className="px-2.5 text-end text-[12px] font-bold tabular-nums">
                        {int(line.packs)}
                      </TableCell>
                      <TableCell className="px-2.5 text-[11px] text-muted-foreground">
                        {supplierById(line.supplierId, state)
                          ? pickName(supplierById(line.supplierId, state)!, locale)
                          : "—"}
                      </TableCell>
                      <TableCell className="px-2.5 text-[11px] text-muted-foreground tabular-nums">
                        {line.arrivesOn ?? "—"}
                      </TableCell>
                      <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                        {line.cost === null ? "—" : money0(line.cost)}
                      </TableCell>
                      <TableCell className="px-1.5 text-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => receiveStock(line.ingredient.id, line.packs)}
                        >
                          <PackagePlus className="size-3.5" />
                          {t("action.receive")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell className="px-2.5 text-[12px] font-bold" colSpan={5}>
                      {t("field.cost")}
                    </TableCell>
                    <TableCell className="px-2.5 text-end text-[12px] font-bold tabular-nums">
                      {money0(reorder.reduce((s, l) => s + (l.cost ?? 0), 0))}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </details>
        </div>
      )}

      <AddIngredientWizard open={adding} onOpenChange={setAdding} onAdded={go} />
    </div>
  )
}

/* ── detail ─────────────────────────────────────────────────────── */

function IngredientDetail({ ingredientId }: { ingredientId: string }) {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const ing = snap.ingredients.find((i) => i.id === ingredientId)
  const [packs, setPacks] = useState("")

  if (!ing) return null
  const sup = supplierById(ing.supplier, state)
  const ap = apUnitCost(ing)
  const ep = epUnitCost(ing)
  // The recipes that would be re-costed by editing this row — the blast radius
  // of a wrong price, shown before the price is edited rather than after.
  const usedBy = snap.recipes.filter((r) =>
    r.lines.some((l) => l.kind === "ingredient" && l.ref === ingredientId),
  )

  const edit = () => state.ingredients.find((i) => i.id === ingredientId)!

  return (
    <>
      <Card
        title={pickName(ing, locale)}
        description={`${t(`cat.${ing.category}`)} · ${t(`storage.${ing.storage}`)}`}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat value={dec2(ing.on_hand)} label={t("field.on_hand")} />
          <Stat
            value={dec2(ing.par_level)}
            label={t("field.par")}
            tone={ing.on_hand < ing.par_level ? "warn" : "good"}
          />
          <Stat value={`${dec2(ing.yield_pct)}%`} label={t("field.yield")} />
          <Stat value={int(usedBy.length)} label={t("nav.recipes")} />
        </div>
      </Card>

      <Card title={t("field.ep_cost")}>
        <div className="grid gap-3 lg:grid-cols-3">
          <Field label={t("field.ap_cost")} hint={`${dec2(ing.pack_size)} ${ing.base_unit}`}>
            <NumInput
              value={ing.ap_cost_sar ?? ""}
              onChange={(e) => {
                edit().ap_cost_sar = e.target.value === "" ? null : Number(e.target.value)
              }}
            />
          </Field>
          <Field
            label={t("field.yield")}
            hint={t("سعر الشراء يُقسَم على نسبة الاستخلاص للحصول على تكلفة ما يصل الطبق فعلًا.")}
          >
            <NumInput
              value={ing.yield_pct}
              onChange={(e) => {
                const v = Number(e.target.value)
                // Clamped, because a zero yield divides by zero downstream and
                // an over-100 yield claims the trim created food.
                edit().yield_pct = Math.min(100, Math.max(1, v || 1))
              }}
            />
          </Field>
          <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
            <div className="text-[10px] text-muted-foreground">{t("field.ap_cost")}</div>
            <div className="text-[13px] font-semibold tabular-nums">
              {ap === null ? "—" : money(ap)}
              <span className="text-[10px] font-normal text-muted-foreground">
                {" "}
                / {ing.base_unit}
              </span>
            </div>
            <div className="mt-1.5 text-[10px] text-muted-foreground">{t("field.ep_cost")}</div>
            <div className="text-[15px] font-bold text-[color:var(--brand-navy-deep)] tabular-nums">
              {ep === null ? "—" : money(ep)}
              <span className="text-[10px] font-normal text-muted-foreground">
                {" "}
                / {ing.base_unit}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card title={t("action.receive")}>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("field.pack")} className="min-w-32 flex-1">
            <NumInput value={packs} onChange={(e) => setPacks(e.target.value)} />
          </Field>
          <Field label={t("field.par")} className="min-w-32 flex-1">
            <NumInput
              value={ing.par_level}
              onChange={(e) => {
                edit().par_level = Math.max(0, Number(e.target.value) || 0)
              }}
            />
          </Field>
          <Button
            size="sm"
            disabled={!Number(packs)}
            onClick={() => {
              receiveStock(ingredientId, Number(packs))
              setPacks("")
            }}
          >
            <PackagePlus className="size-3.5" />
            {t("action.receive")}
          </Button>
        </div>
      </Card>

      <Card title={t("field.supplier")}>
        {sup ? (
          <>
            <p className="text-[13px] font-semibold">{pickName(sup, locale)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t("field.lead_time")}: {int(sup.lead_time_days)}
            </p>
            {ing.halal_critical && (
              <Note
                tone={
                  !sup.halal_cert_no || (sup.halal_cert_expiry ?? "") < day(0) ? "warn" : "brand"
                }
                icon={<ShieldAlert className="size-3.5" />}
              >
                {t("field.halal_cert")}: {sup.halal_cert_no ?? "—"}
                {sup.halal_cert_expiry ? ` · ${sup.halal_cert_expiry}` : ""}
              </Note>
            )}
          </>
        ) : (
          <p className="text-[12px] text-muted-foreground">—</p>
        )}
      </Card>

      {usedBy.length > 0 && (
        <Card title={t("nav.recipes")} bodyClassName="p-0">
          <Table className="min-w-[24rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("nav.recipes")}</TableHead>
                <TableHead className="text-end">{t("field.portions_per_cover")}</TableHead>
                <TableHead className="text-end">{t("field.cost")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usedBy.map((r) => {
                const line = r.lines.find(
                  (l) => l.kind === "ingredient" && l.ref === ingredientId,
                )!
                return (
                  <TableRow key={r.id}>
                    <TableCell className="px-2.5 text-[12px] font-medium">
                      {pickName(r, locale)}
                    </TableCell>
                    <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                      {dec2(line.qty)} {ing.base_unit}
                    </TableCell>
                    <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                      {money(recipeCost(r.id, catalog).perPortion)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  )
}
