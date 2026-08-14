import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useQueryState } from "nuqs"
import { useSnapshot } from "valtio"
import { Clock, Flame } from "lucide-react"

import { Card, Note, PageShell, Stat } from "@/components/PageShell"
import { FilterChips } from "@/components/ui/filter-chips"
import { Meter } from "@/components/ui/meter"
import { StatusPill } from "@/components/ui/status-pill"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useLocale } from "@/i18n/LocaleProvider"
import { dec1, int, isoDate, pickName, shortDay } from "@/lib/display"
import { productionPlan, serviceDates, staffPlan } from "@/lib/planning"
import type { StationValue } from "@/lib/schemas"
import { state } from "@/store/ops"
import { day } from "@/store/seed"
import { useCatalog } from "@/store/use-issues"

/**
 * The day's production sheet.
 *
 * Aggregation across orders is the whole point of the page: three services that
 * each need 40 portions of the same rice is one 120-portion run, and planning
 * them separately is how a kitchen ends up with three part-batches and a
 * shortfall. Grouped by station because that is who reads it — the hot line
 * does not care what the bakery is doing.
 *
 * The chosen day lives in the URL (`?d=`), so a shift lead can be sent straight
 * at tomorrow's sheet.
 */
export function ProductionPage() {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()

  // Read off the raw proxy, not the snapshot: the engine's types are the plain
  // records, and `snap` is already destructured into the dep list above.
  const dates = useMemo(() => serviceDates(state.orders), [snap.orders])
  const today = day(0)
  const fallback = dates.find((d) => d >= today) ?? dates[dates.length - 1] ?? today
  const [picked, setPicked] = useQueryState("d")
  const date = picked && dates.includes(picked) ? picked : fallback

  const plan = useMemo(() => productionPlan(date, state.orders, catalog), [date, catalog, snap.orders])

  const byStation = plan.lines.reduce<Record<string, typeof plan.lines>>((acc, line) => {
    ;(acc[line.station] ??= []).push(line)
    return acc
  }, {})

  // One roster for the day, from the heaviest service style present — a day
  // with any plated service is staffed for plated.
  const style = plan.orders.some((o) => o.service_style === "plated")
    ? "plated"
    : plan.orders.some((o) => o.service_style === "buffet")
      ? "buffet"
      : (plan.orders[0]?.service_style ?? "boxed")
  const staff = staffPlan(style, plan.covers, plan.prepMinutes)

  return (
    <PageShell title={t("page.production")} description={t("page.production_desc")}>
      <Card>
        <FilterChips
          value={date}
          onChange={(v) => void setPicked(v)}
          allLabel={shortDay(fallback)}
          options={dates.map((d) => ({ value: d, label: shortDay(d) }))}
        />
      </Card>

      {plan.orders.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-[13px] text-muted-foreground">
            {t("empty.production")}
          </p>
        </Card>
      ) : (
        <>
          <Card title={isoDate(date)}>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat value={int(plan.covers)} label={t("field.production")} />
              <Stat value={int(plan.lines.length)} label={t("nav.recipes")} />
              <Stat value={int(Math.round(plan.prepMinutes / 60))} label={t("field.prep_minutes")} />
              <Stat value={int(staff.total)} label={t("field.scheduled")} tone="good" />
            </div>
            <div className="mt-3">
              <Meter
                value={plan.covers}
                max={snap.policy.daily_capacity_covers}
                label={t("policy.daily_capacity_covers")}
                bound="max"
              />
            </div>
            <Note tone="brand" icon={<Flame className="size-3.5" />}>
              {t("تجميع الطلبات في اليوم الواحد هو المقصود: ثلاث خدمات تحتاج الصنف نفسه هي طبخة واحدة، لا ثلاث.")}
            </Note>
          </Card>

          <Card title={t("nav.orders")} bodyClassName="p-0">
            <Table className="min-w-[30rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("field.site")}</TableHead>
                  <TableHead>{t("field.time")}</TableHead>
                  <TableHead>{t("field.style")}</TableHead>
                  <TableHead className="text-end">{t("field.production")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {plan.orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="px-2.5 text-[12px] font-medium">
                      {o.site_ar || o.site_en}
                    </TableCell>
                    <TableCell className="px-2.5 text-[12px] tabular-nums" dir="ltr">
                      {o.serves_at}
                    </TableCell>
                    <TableCell className="px-2.5 text-[11px] text-muted-foreground">
                      {t(`style.${o.service_style}`)}
                    </TableCell>
                    <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                      {int(Math.ceil((o.guaranteed_covers ?? o.expected_covers) * (1 + snap.policy.overset_pct / 100)))}
                    </TableCell>
                    <TableCell className="px-2.5 text-end">
                      <StatusPill status={o.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {(Object.keys(byStation) as StationValue[]).map((st) => (
            <Card key={st} title={t(`station.${st}`)} bodyClassName="p-0">
              <Table className="min-w-[32rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("nav.recipes")}</TableHead>
                    <TableHead className="text-end">{t("units.portions", { n: "" })}</TableHead>
                    <TableHead className="text-end">{t("units.batches", { n: "" })}</TableHead>
                    <TableHead className="text-end">{t("field.prep_minutes")}</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byStation[st].map((line) => {
                    const recipe = snap.recipes.find((r) => r.id === line.recipeId)
                    return (
                      <TableRow key={line.recipeId}>
                        <TableCell className="px-2.5 text-[12px] font-medium">
                          {recipe ? pickName(recipe, locale) : line.recipeId}
                        </TableCell>
                        <TableCell className="px-2.5 text-end text-[12px] tabular-nums">
                          {int(line.portions)}
                        </TableCell>
                        <TableCell className="px-2.5 text-end text-[12px] font-bold tabular-nums">
                          {int(line.batches)}
                        </TableCell>
                        <TableCell className="px-2.5 text-end text-[11px] text-muted-foreground tabular-nums">
                          {dec1(line.prepMinutes)}
                        </TableCell>
                        <TableCell className="px-2.5 text-end">
                          {line.sameDayOnly && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--brand-amber-soft)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--brand-amber-deep)]">
                              <Clock className="size-3" />
                              {t("field.shelf_life")}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Card>
          ))}
        </>
      )}
    </PageShell>
  )
}
