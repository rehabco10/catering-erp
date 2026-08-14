import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { useSnapshot } from "valtio"
import { CalendarClock, Plus, Users } from "lucide-react"

import { MasterDetail } from "@/components/MasterDetail"
import { Card, Note, PageHeader, Stat } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Field, NumInput } from "@/components/ui/field"
import { FilterChips } from "@/components/ui/filter-chips"
import { Price } from "@/components/ui/price"
import { StatusPill } from "@/components/ui/status-pill"
import { AddServiceWizard } from "@/features/orders/AddServiceWizard"
import { useLocale, useLocalePath } from "@/i18n/LocaleProvider"
import { int, isoDate, money0, pct, pickName } from "@/lib/display"
import {
  guaranteeDeadline,
  guaranteeState,
  orderEconomics,
  oversetCovers,
  productionCovers,
  productionPlan,
  staffPlan,
  type GuaranteeState,
} from "@/lib/planning"
import { cn } from "@/lib/utils"
import {
  contractById,
  contractUse,
  menuById,
  setActualCovers,
  setGuarantee,
  state,
} from "@/store/ops"
import { useCatalog } from "@/store/use-issues"

/**
 * The service book — every BEO, and the one number that matters on each.
 *
 * Selection lives in the URL (`/orders/:orderId`), which is what lets the
 * validation page deep-link straight at the service that is short a guarantee.
 * The list leads with guarantee state rather than status: an operations manager
 * opens this page to answer "what still needs a number from the client", and a
 * lifecycle status does not say that.
 */

const GUARANTEE_TONE: Record<GuaranteeState, string> = {
  locked: "bg-[color:var(--brand-green-soft)] text-[color:var(--brand-green-deep)]",
  open: "bg-surface-sunken text-muted-foreground",
  due_soon: "bg-[color:var(--brand-amber-soft)] text-[color:var(--brand-amber-deep)]",
  overdue: "bg-[color:var(--brand-ruby-soft)] text-[color:var(--brand-ruby-deep)]",
  not_required: "bg-muted text-muted-foreground",
}

export function OrdersPage() {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const localePath = useLocalePath()
  const { orderId } = useParams()
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<GuaranteeState | null>(null)

  const now = useMemo(() => new Date(), [])

  const rows = useMemo(
    () =>
      [...snap.orders]
        .sort((a, b) => a.serves_on.localeCompare(b.serves_on) || a.serves_at.localeCompare(b.serves_at))
        .map((o) => ({ order: o, guarantee: guaranteeState(o, snap.policy, now) })),
    [snap.orders, snap.policy, now],
  )

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.guarantee] = (acc[r.guarantee] ?? 0) + 1
    return acc
  }, {})

  const shown = filter ? rows.filter((r) => r.guarantee === filter) : rows
  const selected = orderId ? snap.orders.find((o) => o.id === orderId) : undefined

  const go = (id: string | null) => navigate(localePath(id ? `/orders/${id}` : "/orders"))

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-page">
      <PageHeader
        title={t("page.orders")}
        description={t("page.orders_desc")}
        actions={
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            {t("action.add_order")}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 px-4 py-4">
        <MasterDetail
          detailOpen={Boolean(selected)}
          onBack={() => go(null)}
          placeholder={t("empty.orders")}
          master={
            <>
              <FilterChips
                value={filter}
                onChange={setFilter}
                options={(["overdue", "due_soon", "open", "locked"] as GuaranteeState[]).map(
                  (g) => ({ value: g, label: t(`guarantee.${g}`), count: counts[g] ?? 0 }),
                )}
              />
              {shown.map(({ order, guarantee }) => {
                const menu = order.menu ? menuById(order.menu, state) : undefined
                const active = order.id === orderId
                return (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => go(order.id)}
                    className={cn(
                      "block w-full rounded-xl border bg-surface-raised p-3 text-start shadow-[var(--elev-1)] transition-colors",
                      active
                        ? "border-[color:var(--brand-navy)] ring-1 ring-[color:var(--brand-navy)]"
                        : "border-surface-line hover:bg-surface-sunken",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[13px] font-bold">
                        {order.site_ar || order.site_en}
                      </span>
                      <StatusPill status={order.status} />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <CalendarClock className="size-3.5 shrink-0" />
                      <span className="tabular-nums">{isoDate(order.serves_on)}</span>
                      <span dir="ltr" className="tabular-nums">
                        {order.serves_at}
                      </span>
                      <span className="truncate">
                        · {t(`meal.${order.meal_period}`)} · {t(`style.${order.service_style}`)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-muted-foreground">
                        {menu ? pickName(menu, locale) : "—"}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                          GUARANTEE_TONE[guarantee],
                        )}
                      >
                        {t(`guarantee.${guarantee}`)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold tabular-nums">
                      <Users className="size-3.5 text-muted-foreground" />
                      {int(order.guaranteed_covers ?? order.expected_covers)}
                      {order.guaranteed_covers === null && (
                        <span className="text-[10px] font-normal text-muted-foreground">
                          ({t("field.expected")})
                        </span>
                      )}
                    </div>
                  </button>
                )
              })}
            </>
          }
          detail={selected ? <OrderDetail orderId={selected.id} catalog={catalog} now={now} /> : null}
        />
      </div>

      <AddServiceWizard open={adding} onOpenChange={setAdding} onAdded={go} />
    </div>
  )
}

/* ── detail ─────────────────────────────────────────────────────── */

function OrderDetail({
  orderId,
  catalog,
  now,
}: {
  orderId: string
  catalog: ReturnType<typeof useCatalog>
  now: Date
}) {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const order = snap.orders.find((o) => o.id === orderId)
  const [guaranteeDraft, setGuaranteeDraft] = useState("")
  const [actualDraft, setActualDraft] = useState("")

  if (!order) return null
  const contract = contractById(order.contract, state)
  const menu = order.menu ? menuById(order.menu, state) : undefined
  const live = state.orders.find((o) => o.id === orderId)!
  const econ = orderEconomics(live, catalog)
  const guarantee = guaranteeState(live, snap.policy, now)
  const due = guaranteeDeadline(live, snap.policy)
  const overset = oversetCovers(live, snap.policy)

  // Staffing needs the day's prep load for this order alone, so the plan is
  // built for the order's own date and read back for its recipes.
  const dayPlan = productionPlan(order.serves_on.slice(0, 10), [live], catalog)
  const staff = staffPlan(order.service_style, productionCovers(live, snap.policy), dayPlan.prepMinutes)
  const use = contract ? contractUse(contract.id, state) : null

  return (
    <>
      <Card
        title={order.site_ar || order.site_en}
        description={`${isoDate(order.serves_on)} · ${order.serves_at} · ${t(`meal.${order.meal_period}`)}`}
        actions={<StatusPill status={order.status} />}
      >
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat value={int(order.expected_covers)} label={t("field.expected")} />
          <Stat
            value={order.guaranteed_covers === null ? "—" : int(order.guaranteed_covers)}
            label={t("field.guaranteed")}
            tone={guarantee === "overdue" ? "bad" : guarantee === "locked" ? "good" : "warn"}
          />
          <Stat value={int(econ.production)} label={t("field.production")} />
          <Stat value={int(econ.billable)} label={t("field.billable")} tone="good" />
        </div>

        {guarantee !== "locked" && guarantee !== "not_required" && (
          <Note tone={guarantee === "overdue" ? "warn" : "neutral"}>
            {t("field.order_by")}: {due ? due.toISOString().slice(0, 16).replace("T", " ") : "—"}
          </Note>
        )}
      </Card>

      <Card title={t("action.set_guarantee")}>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("field.guaranteed")} className="min-w-32 flex-1">
            <NumInput
              value={guaranteeDraft}
              placeholder={String(order.guaranteed_covers ?? order.expected_covers)}
              onChange={(e) => setGuaranteeDraft(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            disabled={!Number(guaranteeDraft)}
            onClick={() => {
              setGuarantee(orderId, Number(guaranteeDraft))
              setGuaranteeDraft("")
            }}
          >
            {t("action.set_guarantee")}
          </Button>
          <Field label={t("field.actual")} className="min-w-32 flex-1">
            <NumInput
              value={actualDraft}
              placeholder={order.actual_covers === null ? "—" : String(order.actual_covers)}
              onChange={(e) => setActualDraft(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            variant="outline"
            disabled={!Number(actualDraft)}
            onClick={() => {
              setActualCovers(orderId, Number(actualDraft))
              setActualDraft("")
            }}
          >
            {t("action.set_actual")}
          </Button>
        </div>
        <Note tone="brand">
          {t(
            "الضمان هو أرضية الفوترة: أقل من العدد المثبَّت يُفوتر بالعدد المثبَّت، وأكثر منه يُفوتر بالحضور الفعلي.",
          )}
        </Note>
      </Card>

      <Card title={t("field.revenue")} description={menu ? pickName(menu, locale) : undefined}>
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Figure label={t("field.revenue")} value={money0(econ.revenue)} />
          <Figure label={t("field.cost")} value={money0(econ.foodCost)} />
          <Figure
            label={t("field.margin")}
            value={money0(econ.margin)}
            bad={econ.margin < 0}
          />
          <Figure label={t("field.food_cost_pct")} value={pct(econ.foodCostPct)} plain />
        </dl>
        {overset > 0 && (
          <Note>
            {t("field.overset")}: {int(overset)}
          </Note>
        )}
      </Card>

      <Card title={t("page.production")}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Stat value={int(staff.servers)} label={t("style." + order.service_style)} />
          <Stat value={int(staff.bussers)} label={t("issue.other")} />
          <Stat value={int(staff.kitchen)} label={t("station.hot")} />
          <Stat value={int(staff.total)} label={t("field.scheduled")} tone="good" />
        </div>
      </Card>

      {use && contract && (
        <Card title={t("field.client")} description={contract.contract_no}>
          <p className="text-[13px] font-semibold">
            {locale === "en" ? contract.client_en : contract.client_ar}
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Figure label={t("field.committed")} value={int(use.committed)} plain />
            <Figure label={t("field.scheduled")} value={int(use.scheduled)} plain />
            <Figure
              label={t("field.remaining")}
              value={int(use.remaining)}
              plain
              bad={use.remaining < 0}
            />
          </dl>
        </Card>
      )}
    </>
  )
}

/**
 * A labelled figure. `plain` opts out of price masking — cover counts and
 * percentages are not commercially sensitive, only money is.
 */
function Figure({
  label,
  value,
  bad,
  plain,
}: {
  label: string
  value: string
  bad?: boolean
  plain?: boolean
}) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-0.5 text-[15px] font-bold tabular-nums",
          bad && "text-[color:var(--brand-ruby-deep)]",
        )}
      >
        {plain ? value : <Price value={value} />}
      </dd>
    </div>
  )
}
