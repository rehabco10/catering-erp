import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { useSnapshot } from "valtio"
import { Check, PackagePlus, Plus, ShieldAlert, Trash2 } from "lucide-react"

import { MasterDetail } from "@/components/MasterDetail"
import { Card, Disclosure, Note, PageHeader, Stat } from "@/components/PageShell"
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
import { AddItemWizard } from "@/features/inventory/AddItemWizard"
import { useLocale, useLocalePath } from "@/i18n/LocaleProvider"
import {
  apUnitCost,
  cheapestVariant,
  costingVariant,
  epUnitCost,
  itemUnitCost,
  recipeCost,
} from "@/engine/costing"
import { inventoryValue, itemOnHand, preferredPremium, reorderList } from "@/engine/inventory"
import { dec2, int, money, money0, pickName } from "@/lib/display"
import type { IngredientCategoryValue } from "@/engine/schemas"
import { cn } from "@/lib/utils"
import {
  receiveStock,
  removeVariant,
  setPreferredVariant,
  state,
  supplierById,
  supplierMap,
} from "@/store/ops"
import { day } from "@/store/seed"
import { useCatalog } from "@/store/use-issues"

/**
 * Items, and the ways of buying them.
 *
 * The split this page exists to express: an **item** is what a recipe asks for
 * ("6 kg basmati rice"); a **variant** is what you buy ("Al-Moun 20 kg sack,
 * 96 SAR, 100% yield"). Supplier, pack, price, yield and stock all live on the
 * variant, because those are exactly the things that differ between two ways of
 * buying the same thing — and one of them, yield, changes the cost per usable
 * kilo on its own.
 *
 * One variant is the **costing basis**. Every recipe downstream is priced
 * through it, so the page shows the cheapest alternative beside it rather than
 * quietly switching: a menu price quoted to a client should not move because a
 * supplier listed a cheap SKU.
 */
export function InventoryPage() {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const localePath = useLocalePath()
  const { itemId } = useParams()
  const [category, setCategory] = useState<IngredientCategoryValue | null>(null)
  const [adding, setAdding] = useState(false)

  const today = day(0)
  const reorder = useMemo(() => reorderList(catalog, supplierMap(state), today), [catalog, today])
  const stockValue = useMemo(() => inventoryValue(catalog), [catalog])

  const counts = snap.items.reduce<Record<string, number>>((acc, i) => {
    acc[i.category] = (acc[i.category] ?? 0) + 1
    return acc
  }, {})
  const shown = category ? snap.items.filter((i) => i.category === category) : snap.items
  const selected = itemId ? snap.items.find((i) => i.id === itemId) : undefined

  // An explicit `/inventory` segment rather than ids at the root: a bare
  // `/:id` route would happily swallow `/menus` as an item id.
  const go = (id: string | null) => navigate(localePath(id ? `/inventory/${id}` : "/inventory"))

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-page">
      <PageHeader
        title={t("page.inventory")}
        description={t("page.inventory_desc")}
        actions={
          <>
            <span className="text-[12px] font-semibold tabular-nums">{money0(stockValue)}</span>
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              {t("action.add_item")}
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
              {shown.map((item) => {
                const variants = catalog.variantsByItem.get(item.id) ?? []
                const basis = costingVariant(item.id, catalog)
                const sup = supplierById(basis?.supplier ?? null, state)
                const certLapsed =
                  item.halal_critical &&
                  variants.some((v) => {
                    const s = supplierById(v.supplier, state)
                    return !s?.halal_cert_no || (s.halal_cert_expiry ?? "") < today
                  })
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.id)}
                    className={cn(
                      "block w-full rounded-xl border bg-surface-raised p-3 text-start shadow-[var(--elev-1)] transition-colors",
                      item.id === itemId
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
                          {pickName(item, locale)}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {t(`cat.${item.category}`)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {/* The basis, not the item, is what carries a supplier. */}
                      {basis ? pickName(basis, locale) : t("field.no_basis")}
                      {sup ? ` · ${pickName(sup, locale)}` : ""}
                      {variants.length > 1 ? ` · +${int(variants.length - 1)}` : ""}
                    </p>
                    <div className="mt-2">
                      {/* Bound as a floor: the par level is the goal, and
                          falling under it is what the colour has to say. */}
                      <Meter value={itemOnHand(item.id, catalog)} max={item.par_level} bound="min" />
                    </div>
                  </button>
                )
              })}
            </>
          }
          detail={selected ? <ItemDetail itemId={selected.id} /> : null}
        />
      </div>

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
              <Table className="min-w-[38rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("group.items")}</TableHead>
                    <TableHead>{t("field.preferred")}</TableHead>
                    <TableHead className="text-end">{t("field.shortfall")}</TableHead>
                    <TableHead className="text-end">{t("field.pack")}</TableHead>
                    <TableHead>{t("field.arrives_on")}</TableHead>
                    <TableHead className="text-end">{t("field.cost")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reorder.map((line) => (
                    <TableRow key={line.item.id}>
                      <TableCell className="px-2.5 text-[12px] font-medium">
                        {pickName(line.item, locale)}
                      </TableCell>
                      <TableCell className="px-2.5 text-[11px] text-muted-foreground">
                        {pickName(line.variant, locale)}
                      </TableCell>
                      <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                        {dec2(line.shortfall)} {t(`unit.${line.item.base_unit}`)}
                      </TableCell>
                      <TableCell className="px-2.5 text-end text-[12px] font-bold tabular-nums">
                        {int(line.packs)}
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
                          onClick={() => receiveStock(line.variant.id, line.packs)}
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

      <AddItemWizard open={adding} onOpenChange={setAdding} onAdded={go} />
    </div>
  )
}

/* ── detail ─────────────────────────────────────────────────────── */

function ItemDetail({ itemId }: { itemId: string }) {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const [receiving, setReceiving] = useState<Record<string, string>>({})

  const item = snap.items.find((i) => i.id === itemId)
  if (!item) return null

  const variants = snap.variants.filter((v) => v.item === itemId)
  const basis = costingVariant(itemId, catalog)
  const cheapest = cheapestVariant(itemId, catalog)
  const premium = preferredPremium(itemId, catalog)
  const unitCost = itemUnitCost(itemId, catalog)
  const onHand = itemOnHand(itemId, catalog)
  const today = day(0)

  // The recipes that would be re-costed by changing the basis — the blast
  // radius, shown before the change rather than after.
  const usedBy = snap.recipes.filter((r) =>
    r.lines.some((l) => l.kind === "item" && l.ref === itemId),
  )

  const edit = () => state.items.find((i) => i.id === itemId)!

  return (
    <>
      <Card
        title={pickName(item, locale)}
        description={`${t(`cat.${item.category}`)} · ${t(`unit.${item.base_unit}`)}`}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat value={dec2(onHand)} label={t("field.on_hand")} />
          <Stat
            value={dec2(item.par_level)}
            label={t("field.par")}
            tone={onHand < item.par_level ? "warn" : "good"}
          />
          <Stat value={int(variants.length)} label={t("section.variants")} />
          <Stat value={int(usedBy.length)} label={t("nav.recipes")} />
        </div>

        <div className="mt-3">
          <Field label={t("field.par")} hint={t("field.par_hint")}>
            <NumInput
              value={item.par_level}
              onChange={(e) => {
                edit().par_level = Math.max(0, Number(e.target.value) || 0)
              }}
            />
          </Field>
        </div>
      </Card>

      {/* ── the costing basis ────────────────────────────────────── */}
      <Card title={t("field.ep_cost")}>
        <div className="rounded-xl bg-[color:var(--brand-navy-soft)] px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-bold text-[color:var(--brand-navy-deep)]">
              {t("field.preferred")}
            </span>
            <span className="text-2xl font-bold text-[color:var(--brand-navy-deep)] tabular-nums">
              {unitCost === null ? "—" : money(unitCost)}
              <span className="text-[11px] font-normal">
                {" / "}
                {t(`unit.${item.base_unit}`)}
              </span>
            </span>
          </div>
          <div className="mt-1 text-[11px] text-[color:var(--brand-navy-deep)]/70">
            {basis ? pickName(basis, locale) : t("field.no_basis")}
          </div>
        </div>

        {premium !== null && cheapest && (
          <Note tone="warn">
            {t("field.cheapest")}: {pickName(cheapest, locale)} — {money(epUnitCost(cheapest) ?? 0)}{" "}
            ({dec2(premium * 100)}%)
          </Note>
        )}
      </Card>

      {/* ── the variants ─────────────────────────────────────────── */}
      <Card title={t("section.variants")} bodyClassName="p-0">
        <Table className="min-w-[46rem]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">{t("field.preferred")}</TableHead>
              <TableHead>{t("field.variant_name")}</TableHead>
              <TableHead>{t("field.supplier")}</TableHead>
              <TableHead className="text-end">{t("field.ap_cost")}</TableHead>
              <TableHead className="text-end">{t("field.yield")}</TableHead>
              <TableHead className="text-end">{t("field.ep_cost")}</TableHead>
              <TableHead className="text-end">{t("field.on_hand")}</TableHead>
              <TableHead>{t("action.receive")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant) => {
              const sup = supplierById(variant.supplier, state)
              const ep = epUnitCost(variant)
              const ap = apUnitCost(variant)
              const isBasis = item.preferred_variant === variant.id
              const isCheapest = cheapest?.id === variant.id
              const certLapsed =
                item.halal_critical && (!sup?.halal_cert_no || (sup.halal_cert_expiry ?? "") < today)
              const live = () => state.variants.find((v) => v.id === variant.id)!
              return (
                <TableRow
                  key={variant.id}
                  className={cn(isBasis && "bg-[color:var(--brand-navy-soft)]/40")}
                >
                  <TableCell className="px-2.5">
                    {/* A radio, not a toggle: exactly one basis, always. */}
                    <input
                      type="radio"
                      name={`basis-${itemId}`}
                      checked={isBasis}
                      onChange={() => setPreferredVariant(itemId, variant.id)}
                      aria-label={`${t("field.preferred")} — ${pickName(variant, locale)}`}
                      className="size-4 accent-[color:var(--brand-navy)]"
                    />
                  </TableCell>
                  <TableCell className="px-2.5 text-[12px] font-medium">
                    <span className="flex items-center gap-1.5">
                      {certLapsed && (
                        <ShieldAlert
                          className="size-3.5 shrink-0 text-[color:var(--brand-ruby)]"
                          aria-label={t("field.halal_cert")}
                        />
                      )}
                      {pickName(variant, locale)}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {dec2(variant.pack_size)} {t(`unit.${item.base_unit}`)} ·{" "}
                      {t(`storage.${variant.storage}`)}
                    </span>
                  </TableCell>
                  <TableCell className="px-2.5 text-[11px] text-muted-foreground">
                    {sup ? pickName(sup, locale) : "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    <NumInput
                      aria-label={`${t("field.ap_cost")} — ${pickName(variant, locale)}`}
                      value={variant.ap_cost_sar ?? ""}
                      onChange={(e) => {
                        live().ap_cost_sar = e.target.value === "" ? null : Number(e.target.value)
                      }}
                      className="h-7 w-24 text-end"
                    />
                  </TableCell>
                  <TableCell className="text-end">
                    <NumInput
                      aria-label={`${t("field.yield")} — ${pickName(variant, locale)}`}
                      value={variant.yield_pct}
                      onChange={(e) => {
                        // Clamped: a zero yield divides by zero downstream, and
                        // over 100 claims the trim created food.
                        live().yield_pct = Math.min(100, Math.max(1, Number(e.target.value) || 1))
                      }}
                      className="h-7 w-16 text-end"
                    />
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[12px] font-semibold tabular-nums">
                    <span className="flex items-center justify-end gap-1">
                      {isCheapest && variants.length > 1 && (
                        <Check
                          className="size-3 text-[color:var(--brand-green)]"
                          aria-label={t("field.cheapest")}
                        />
                      )}
                      {ep === null ? "—" : money(ep)}
                    </span>
                    <span className="text-[10px] font-normal text-muted-foreground">
                      {ap === null ? "" : `AP ${money(ap)}`}
                    </span>
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                    {dec2(variant.on_hand)}
                  </TableCell>
                  <TableCell className="px-1.5">
                    <div className="flex items-center gap-1">
                      <NumInput
                        aria-label={`${t("action.receive")} — ${pickName(variant, locale)}`}
                        value={receiving[variant.id] ?? ""}
                        onChange={(e) =>
                          setReceiving((r) => ({ ...r, [variant.id]: e.target.value }))
                        }
                        className="h-7 w-14 text-end"
                      />
                      <Button
                        size="icon-sm"
                        variant="outline"
                        disabled={!Number(receiving[variant.id])}
                        aria-label={t("action.receive")}
                        onClick={() => {
                          receiveStock(variant.id, Number(receiving[variant.id]))
                          setReceiving((r) => ({ ...r, [variant.id]: "" }))
                        }}
                      >
                        <PackagePlus className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="px-1.5 text-end">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${t("action.remove")} — ${pickName(variant, locale)}`}
                      onClick={() => removeVariant(variant.id)}
                    >
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <p className="border-t border-surface-line px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          {t("سعر الشراء يُقسَم على نسبة الاستخلاص للحصول على تكلفة ما يصل الطبق فعلًا.")}
        </p>
      </Card>

      {usedBy.length > 0 && (
        <Disclosure title={t("section.used_by")} count={int(usedBy.length)}>
          <Table className="min-w-[24rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("nav.recipes")}</TableHead>
                <TableHead className="text-end">{t("field.per_batch")}</TableHead>
                <TableHead className="text-end">{t("field.per_portion")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usedBy.map((r) => {
                const line = r.lines.find((l) => l.kind === "item" && l.ref === itemId)!
                return (
                  <TableRow key={r.id}>
                    <TableCell className="px-2.5 text-[12px] font-medium">
                      {pickName(r, locale)}
                    </TableCell>
                    <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                      {dec2(line.qty)} {t(`unit.${item.base_unit}`)}
                    </TableCell>
                    <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                      {money(recipeCost(r.id, catalog).perPortion)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Disclosure>
      )}
    </>
  )
}
