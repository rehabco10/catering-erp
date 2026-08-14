import { useState, type ChangeEvent } from "react"
import { useTranslation } from "react-i18next"
import { useSnapshot } from "valtio"
import { CheckCircle2 } from "lucide-react"

import { Card, Note, PageShell, Stat } from "@/components/PageShell"
import { Button } from "@/components/ui/button"
import { Field, NumInput } from "@/components/ui/field"
import { FilterChips } from "@/components/ui/filter-chips"
import { useLocale, useLocaleNavigate, useSwitchLocale } from "@/i18n/LocaleProvider"
import { int } from "@/lib/display"
import { categoryOf, type IssueCategory } from "@/engine/validation"
import { cn } from "@/lib/utils"
import { state } from "@/store/ops"
import { useIssues } from "@/store/use-issues"

/* ── validation ─────────────────────────────────────────────────── */

/** Where each finding's entity lives, so a row can be clicked through. */
const ROUTE_FOR: Record<string, (id: string) => string> = {
  ingredient: (id) => `/inventory/${id}`,
  recipe: (id) => `/recipes/${id}`,
  menu: (id) => `/menus/${id}`,
}

/**
 * Every finding, grouped the way someone fixes them.
 *
 * Blocking findings first and always visible; the category filter narrows
 * rather than hides, because "the kitchen list is clean" is only meaningful if
 * you can see the count it was filtered from.
 */
export function ValidationPage() {
  const { t } = useTranslation()
  const issues = useIssues()
  const navigate = useLocaleNavigate()
  const [category, setCategory] = useState<IssueCategory | null>(null)

  const errors = issues.filter((i) => i.level === "error")
  const warnings = issues.filter((i) => i.level === "warning")
  const counts = issues.reduce<Record<string, number>>((acc, i) => {
    const c = categoryOf(i.code)
    acc[c] = (acc[c] ?? 0) + 1
    return acc
  }, {})

  const shown = category ? issues.filter((i) => categoryOf(i.code) === category) : issues
  const shownErrors = shown.filter((i) => i.level === "error")
  const shownWarnings = shown.filter((i) => i.level === "warning")

  const row = (issue: (typeof issues)[number], i: number) => {
    const to = ROUTE_FOR[issue.scope]?.(issue.entityId)
    const blocking = issue.level === "error"
    return (
      <li key={`${issue.code}-${issue.entityId}-${i}`}>
        <button
          type="button"
          disabled={!to}
          onClick={() => to && navigate(to)}
          className={cn(
            "flex w-full gap-2.5 rounded-lg px-3 py-2 text-start transition-colors",
            to ? "hover:bg-surface-sunken" : "cursor-default",
          )}
        >
          <span
            className={cn(
              "mt-1.5 size-1.5 shrink-0 rounded-full",
              blocking ? "bg-[color:var(--brand-ruby)]" : "bg-[color:var(--brand-amber)]",
            )}
          />
          <span className="min-w-0 flex-1">
            <span className="block text-[12px] leading-relaxed">{issue.message}</span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground">
              {t(`issue.${categoryOf(issue.code)}`)} · {issue.code}
            </span>
          </span>
        </button>
      </li>
    )
  }

  return (
    <PageShell title={t("page.validation")} description={t("page.validation_desc")}>
      <Card>
        <div className="grid grid-cols-2 gap-2">
          <Stat
            value={int(errors.length)}
            label={t("issue.errors")}
            tone={errors.length ? "bad" : "good"}
          />
          <Stat
            value={int(warnings.length)}
            label={t("issue.warnings")}
            tone={warnings.length ? "warn" : "good"}
          />
        </div>
        <FilterChips
          className="mt-3"
          value={category}
          onChange={setCategory}
          options={(["menu", "kitchen", "supply", "compliance", "other"] as IssueCategory[])
            .filter((c) => counts[c])
            .map((c) => ({ value: c, label: t(`issue.${c}`), count: counts[c] }))}
        />
      </Card>

      {shown.length === 0 ? (
        <Card>
          <p className="flex items-center justify-center gap-2 py-8 text-[13px] text-[color:var(--brand-green-deep)]">
            <CheckCircle2 className="size-4" />
            {t("issue.clean")}
          </p>
        </Card>
      ) : (
        <>
          {shownErrors.length > 0 && (
            <Card title={t("issue.errors")} bodyClassName="p-1.5">
              <ul>{shownErrors.map(row)}</ul>
            </Card>
          )}
          {shownWarnings.length > 0 && (
            <Card title={t("issue.warnings")} bodyClassName="p-1.5">
              <ul>{shownWarnings.map(row)}</ul>
            </Card>
          )}
        </>
      )}
    </PageShell>
  )
}

/* ── settings ───────────────────────────────────────────────────── */

/**
 * The operating policy, in one place.
 *
 * Three numbers, and every one of them is an engine input rather than a
 * constant: changing the food-cost target immediately re-verdicts every menu,
 * and changing the Q factor re-costs every cover.
 */
export function SettingsPage() {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const switchLocale = useSwitchLocale()

  const num = (key: keyof typeof snap.policy) => ({
    value: String(snap.policy[key]),
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      state.policy[key] = Number(e.target.value) || 0
    },
  })

  return (
    <PageShell title={t("page.settings")} description={t("page.settings_desc")}>
      <Card title={t("nav.settings")}>
        <div className="grid gap-3 lg:grid-cols-3">
          <Field
            label={t("policy.target_food_cost_pct")}
            hint={t("التكلفة تُكتشَف، والمستهدف سياسة، والسعر ينتج عنهما — لا العكس.")}
          >
            <NumInput {...num("target_food_cost_pct")} />
          </Field>
          <Field label={t("policy.q_factor_pct")} hint={t("policy.q_factor_hint")}>
            <NumInput {...num("q_factor_pct")} />
          </Field>
          <Field label={t("policy.vat_pct")}>
            <NumInput {...num("vat_pct")} />
          </Field>
        </div>
        <Note tone="brand">
          {t("مواسم الحج تشتغل على أعداد كبيرة وهوامش رفيعة — نقطة مئوية واحدة في تكلفة الطعام تساوي مبلغًا كبيرًا.")}
        </Note>
      </Card>

      <Card title="Language / اللغة">
        <div className="flex gap-2">
          <Button
            variant={locale === "ar" ? "default" : "outline"}
            size="sm"
            onClick={() => switchLocale("ar")}
          >
            العربية
          </Button>
          <Button
            variant={locale === "en" ? "default" : "outline"}
            size="sm"
            onClick={() => switchLocale("en")}
          >
            English
          </Button>
        </div>
      </Card>
    </PageShell>
  )
}
