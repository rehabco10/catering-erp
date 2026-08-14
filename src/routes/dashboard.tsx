import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { useSnapshot } from "valtio"
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { AlertTriangle, TrendingUp } from "lucide-react"

import { Card, Note, PageShell, Stat } from "@/components/PageShell"
import { Meter } from "@/components/ui/meter"
import { Price } from "@/components/ui/price"
import { LocaleLink, useLocale } from "@/i18n/LocaleProvider"
import { dec1, int, money0, pct, shortDay } from "@/lib/display"
import { categoryOf } from "@/lib/validation"
import { contractUse, dailyLoad, seasonTotals, state } from "@/store/ops"
import { day } from "@/store/seed"
import { useIssues } from "@/store/use-issues"

/**
 * The season at a glance.
 *
 * Four numbers, in the order someone actually asks them: how much are we
 * feeding, what does it earn, what does it cost, and is anything on fire. The
 * load chart underneath is the one thing a cover count cannot show — a season
 * can be comfortably within capacity in total and still have a day that is not.
 */
export function DashboardPage() {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const issues = useIssues()

  // `snap` is read above so the whole page re-renders on any change; the
  // rollups themselves walk the raw proxy (see store/use-issues.ts).
  const totals = useMemo(() => seasonTotals(state), [snap])
  const load = useMemo(() => dailyLoad(state), [snap])
  const today = day(0)

  const errors = issues.filter((i) => i.level === "error")
  const overCapacity = load.filter((d) => d.covers > snap.policy.daily_capacity_covers)

  const chartData = load.map((d) => ({
    ...d,
    label: shortDay(d.date),
    past: d.date < today,
  }))

  return (
    <PageShell title={t("page.dashboard")} description={t("page.dashboard_desc")}>
      <Card>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat value={int(totals.billable)} label={t("field.billable")} />
          <Stat value={int(totals.production)} label={t("field.production")} tone="neutral" />
          <Stat
            value={pct(totals.foodCostPct)}
            label={t("field.food_cost_pct")}
            tone={
              totals.foodCostPct === null
                ? "neutral"
                : totals.foodCostPct > snap.policy.target_food_cost_pct + 2
                  ? "warn"
                  : "good"
            }
          />
          <Stat
            value={int(totals.upcomingDays)}
            label={t("page.production")}
            tone={overCapacity.length > 0 ? "bad" : "neutral"}
          />
        </div>
        <Note tone="brand" icon={<TrendingUp className="size-3.5" />}>
          {t(
            "الضمان هو أرضية الفوترة: أقل من العدد المثبَّت يُفوتر بالعدد المثبَّت، وأكثر منه يُفوتر بالحضور الفعلي.",
          )}
        </Note>
      </Card>

      {/* Money is masked by default — this screen is routinely projected in
          meetings with the very clients whose margin it shows. */}
      <Card title={t("field.revenue")}>
        <dl className="grid grid-cols-3 gap-3 text-center">
          <div>
            <dt className="text-[11px] text-muted-foreground">{t("field.revenue")}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums">
              <Price value={money0(totals.revenue)} />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">{t("field.cost")}</dt>
            <dd className="mt-1 text-lg font-bold tabular-nums">
              <Price value={money0(totals.foodCost)} />
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-muted-foreground">{t("field.margin")}</dt>
            <dd
              className={
                "mt-1 text-lg font-bold tabular-nums " +
                (totals.margin < 0 ? "text-[color:var(--brand-ruby-deep)]" : "")
              }
            >
              <Price value={money0(totals.margin)} />
            </dd>
          </div>
        </dl>
      </Card>

      <Card
        title={t("page.production")}
        description={t("policy.daily_capacity_covers") + ": " + int(snap.policy.daily_capacity_covers)}
      >
        <div className="h-56 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--surface-line)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--surface-line)" }}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                tickLine={false}
                axisLine={false}
                width={44}
              />
              <Tooltip
                cursor={{ fill: "var(--surface-sunken)" }}
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid var(--surface-line)",
                  background: "var(--surface-raised)",
                }}
                formatter={(v) => [int(Number(v ?? 0)), t("field.production")]}
              />
              <Bar dataKey="covers" radius={[4, 4, 0, 0]} fill="var(--brand-navy)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {overCapacity.length > 0 && (
          <Note tone="warn" icon={<AlertTriangle className="size-3.5" />}>
            {overCapacity.map((d) => shortDay(d.date)).join("، ")} —{" "}
            {t("nav.error_count", { count: overCapacity.length })}
          </Note>
        )}
      </Card>

      <Card title={t("nav.orders")}>
        <ul className="space-y-3">
          {snap.contracts.map((c) => {
            const use = contractUse(c.id, state)
            return (
              <li key={c.id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold">
                    {locale === "en" ? c.client_en : c.client_ar}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                    {c.contract_no}
                  </span>
                </div>
                <Meter value={use.scheduled} max={use.committed} bound="max" />
              </li>
            )
          })}
        </ul>
      </Card>

      {errors.length > 0 && (
        <Card
          title={t("issue.errors")}
          actions={
            <LocaleLink
              to="/validation"
              className="text-[11px] font-semibold text-[color:var(--brand-navy-deep)] underline-offset-2 hover:underline"
            >
              {t("nav.validation")}
            </LocaleLink>
          }
        >
          <ul className="space-y-1.5">
            {errors.slice(0, 5).map((issue, i) => (
              <li key={`${issue.code}-${issue.entityId}-${i}`} className="flex gap-2 text-[12px]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[color:var(--brand-ruby)]" />
                <span className="min-w-0">
                  <span className="text-muted-foreground">
                    {t(`issue.${categoryOf(issue.code)}`)} ·{" "}
                  </span>
                  {issue.message}
                </span>
              </li>
            ))}
          </ul>
          {errors.length > 5 && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              +{dec1(errors.length - 5)}
            </p>
          )}
        </Card>
      )}
    </PageShell>
  )
}
