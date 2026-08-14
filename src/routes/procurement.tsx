import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useQueryState } from "nuqs"
import { useSnapshot } from "valtio"
import { PackageCheck, ShieldAlert } from "lucide-react"

import { Card, Note, PageShell, Stat } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { FilterChips } from "@/components/ui/filter-chips"
import { Meter } from "@/components/ui/meter"
import { Price } from "@/components/ui/price"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useLocale } from "@/i18n/LocaleProvider"
import { dec2, int, isoDate, money0, pickName, shortDay } from "@/lib/display"
import { inventoryValue, productionPlan, purchaseList, serviceDates } from "@/lib/planning"
import { cn } from "@/lib/utils"
import { receiveStock, state, supplierById, supplierMap } from "@/store/ops"
import { day } from "@/store/seed"
import { useCatalog } from "@/store/use-issues"

/**
 * What has to be bought, and by when.
 *
 * Three conversions happen between the production plan and this table, in this
 * order: edible-portion quantities become as-purchased (buy the trim back),
 * stock is netted off while the par level is held back, and the remainder is
 * rounded up to whole packs. Doing them in any other order either under-buys or
 * orders fractions of a sack.
 *
 * The order-by column is the one that actually bites — a five-day lead time on
 * dry goods means today's sheet is about next week's service, and a date in the
 * past here is a blocking finding, not a note.
 */
export function ProcurementPage() {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()

  // Read off the raw proxy, not the snapshot: the engine's types are the plain
  // records, and `snap.orders` is already in the dep list.
  const dates = useMemo(() => serviceDates(state.orders), [snap.orders])
  const today = day(0)
  const fallback = dates.find((d) => d >= today) ?? dates[dates.length - 1] ?? today
  const [picked, setPicked] = useQueryState("d")
  const date = picked && dates.includes(picked) ? picked : fallback

  const lines = useMemo(() => {
    const plan = productionPlan(date, state.orders, catalog)
    return purchaseList(plan.requirements, catalog, supplierMap(state), date)
      .filter((l) => l.packs > 0)
  }, [date, catalog, snap.orders, snap.ingredients])

  const total = lines.reduce((sum, l) => sum + (l.cost ?? 0), 0)
  const late = lines.filter((l) => l.orderBy && l.orderBy < today)
  const stockValue = useMemo(() => inventoryValue(catalog), [catalog, snap.ingredients])
  const belowPar = snap.ingredients.filter((i) => i.on_hand < i.par_level)

  return (
    <PageShell title={t("page.procurement")} description={t("page.procurement_desc")}>
      <Card>
        <FilterChips
          value={date}
          onChange={(v) => void setPicked(v)}
          allLabel={shortDay(fallback)}
          options={dates.map((d) => ({ value: d, label: shortDay(d) }))}
        />
      </Card>

      <Card title={isoDate(date)}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat value={int(lines.length)} label={t("nav.procurement")} />
          <Stat value={int(late.length)} label={t("field.order_by")} tone={late.length ? "bad" : "good"} />
          <Stat value={int(belowPar.length)} label={t("field.par")} tone={belowPar.length ? "warn" : "good"} />
          <Stat value={int(snap.ingredients.length)} label={t("field.on_hand")} />
        </div>
        <Note tone="brand" icon={<PackageCheck className="size-3.5" />}>
          {t(
            "الاحتياج يُحوَّل إلى كمية شراء، ثم يُخصم منه الرصيد مع إبقاء الحد الأدنى، ثم يُقرَّب لأعلى إلى عبوات كاملة.",
          )}
        </Note>
      </Card>

      {lines.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            {t("empty.procurement")}
          </p>
        </Card>
      ) : (
        <Card title={t("nav.procurement")} bodyClassName="p-0">
          <Table className="min-w-[46rem]">
            <TableHeader>
              <TableRow>
                <TableHead>{t("cat.dry_goods")}</TableHead>
                <TableHead className="text-end">{t("field.production")}</TableHead>
                <TableHead className="text-end">{t("field.on_hand")}</TableHead>
                <TableHead className="text-end">{t("field.shortfall")}</TableHead>
                <TableHead className="text-end">{t("field.pack")}</TableHead>
                <TableHead>{t("field.supplier")}</TableHead>
                <TableHead>{t("field.order_by")}</TableHead>
                <TableHead className="text-end">{t("field.cost")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => {
                const sup = supplierById(line.supplierId, state)
                const isLate = Boolean(line.orderBy && line.orderBy < today)
                const certLapsed =
                  line.ingredient.halal_critical &&
                  (!sup?.halal_cert_no || (sup.halal_cert_expiry ?? "") < today)
                return (
                  <TableRow key={line.ingredient.id}>
                    <TableCell className="px-2.5 text-[12px] font-medium">
                      <span className="flex items-center gap-1.5">
                        {certLapsed && (
                          <ShieldAlert
                            className="size-3.5 shrink-0 text-[color:var(--brand-ruby)]"
                            aria-label={t("field.halal_cert")}
                          />
                        )}
                        {pickName(line.ingredient, locale)}
                      </span>
                    </TableCell>
                    <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                      {dec2(line.neededAp)} {line.ingredient.base_unit}
                    </TableCell>
                    <TableCell className="px-2.5 text-end text-[11px] text-muted-foreground tabular-nums">
                      {dec2(line.onHand)}
                    </TableCell>
                    <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                      {dec2(line.shortfallAp)}
                    </TableCell>
                    <TableCell className="px-2.5 text-end text-[12px] font-bold tabular-nums">
                      {int(line.packs)}
                      <span className="ms-1 text-[10px] font-normal text-muted-foreground">
                        {t(`storage.${line.ingredient.storage}`)}
                      </span>
                    </TableCell>
                    <TableCell className="px-2.5 text-[11px] text-muted-foreground">
                      {sup ? pickName(sup, locale) : "—"}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "px-2.5 text-[11px] tabular-nums",
                        isLate
                          ? "font-bold text-[color:var(--brand-ruby-deep)]"
                          : "text-muted-foreground",
                      )}
                    >
                      {line.orderBy ?? "—"}
                    </TableCell>
                    <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                      <Price
                        value={line.cost === null ? "—" : money0(line.cost)}
                        interactive={false}
                      />
                    </TableCell>
                    <TableCell className="px-1.5 text-end">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => receiveStock(line.ingredient.id, line.packs)}
                      >
                        {t("action.receive")}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="px-2.5 text-[12px] font-bold" colSpan={7}>
                  {t("field.cost")}
                </TableCell>
                <TableCell className="px-2.5 text-end text-[12px] font-bold tabular-nums">
                  <Price value={money0(total)} interactive={false} />
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </Card>
      )}

      <Card
        title={t("field.on_hand")}
        description={t("field.par")}
        actions={
          <span className="text-[12px] font-semibold tabular-nums">
            <Price value={money0(stockValue)} />
          </span>
        }
        bodyClassName="p-0"
      >
        <Table className="min-w-[32rem]">
          <TableHeader>
            <TableRow>
              <TableHead>{t("cat.dry_goods")}</TableHead>
              <TableHead>{t("field.supplier")}</TableHead>
              <TableHead>{t("field.on_hand")}</TableHead>
              <TableHead className="text-end">{t("field.ap_cost")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snap.ingredients.map((ing) => {
              const sup = supplierById(ing.supplier, state)
              return (
                <TableRow key={ing.id}>
                  <TableCell className="px-2.5 text-[12px] font-medium">
                    {pickName(ing, locale)}
                    <span className="ms-1.5 text-[10px] text-muted-foreground">
                      {t(`cat.${ing.category}`)}
                    </span>
                  </TableCell>
                  <TableCell className="px-2.5 text-[11px] text-muted-foreground">
                    {sup ? pickName(sup, locale) : "—"}
                  </TableCell>
                  <TableCell className="px-2.5">
                    {/* Bound as a floor: the par level is the goal, and falling
                        under it is what the colour has to say. */}
                    <Meter value={ing.on_hand} max={ing.par_level} bound="min" />
                  </TableCell>
                  <TableCell className="px-2.5 text-end text-[11px] tabular-nums">
                    <Price
                      value={ing.ap_cost_sar === null ? "—" : money0(ing.ap_cost_sar)}
                      interactive={false}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
    </PageShell>
  )
}
