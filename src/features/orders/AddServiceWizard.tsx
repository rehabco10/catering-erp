import * as React from "react"
import { useTranslation } from "react-i18next"
import { useSnapshot } from "valtio"

import { DatePicker } from "@/components/ui/date-picker"
import { Field, Input, NumInput, SelectField } from "@/components/ui/field"
import { FormWizard, type WizardStep } from "@/components/ui/form-wizard"
import { useLocale } from "@/i18n/LocaleProvider"
import { mealOptions, pickName, styleOptions } from "@/lib/display"
import { addOrder, state, type NewOrder } from "@/store/ops"

/**
 * The add-a-service flow.
 *
 * Three steps in the order the information actually arrives: who and when
 * (the client rings up with a date), what they are eating, then how many.
 * Each step gates on its own `valid`, so a half-specified service can never
 * reach the store — which keeps `order.no_menu` and `order.no_covers` findings
 * about real data rather than about typing.
 *
 * The draft lives here rather than in the store: an abandoned wizard should
 * leave nothing behind, and re-opening starts clean.
 */
export function AddServiceWizard({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded?: (id: string) => void
}) {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()

  const blank = (): NewOrder => ({
    contract: snap.contracts[0]?.id ?? "",
    serves_on: snap.season.starts_on,
    serves_at: "13:00",
    meal_period: "lunch",
    service_style: "buffet",
    menu: null,
    site_ar: "",
    site_en: "",
    expected_covers: 0,
  })

  const [draft, setDraft] = React.useState<NewOrder>(blank)
  // Each opening is a fresh add — never resume a half-finished previous one.
  React.useEffect(() => {
    if (open) setDraft(blank())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = <K extends keyof NewOrder>(key: K, value: NewOrder[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const contractOptions = snap.contracts
    .filter((c) => c.status !== "cancelled")
    .map((c) => ({ value: c.id, label: locale === "en" ? c.client_en : c.client_ar }))

  // Only menus written for this meal period: offering a breakfast menu for a
  // dinner service is the kind of mistake the picker should make impossible
  // rather than the validation page report afterwards.
  const menuOptions = snap.menus
    .filter((m) => m.meal_period === draft.meal_period)
    .map((m) => ({ value: m.id, label: pickName(m, locale) }))

  const steps: WizardStep[] = [
    {
      id: "when",
      title: t("field.date"),
      valid: Boolean(draft.contract && draft.serves_on && (draft.site_ar || draft.site_en)),
      content: (
        <>
          <Field label={t("field.client")}>
            <SelectField
              value={draft.contract}
              onChange={(v) => set("contract", v)}
              options={contractOptions}
              allowEmpty={false}
            />
          </Field>
          <Field label={t("field.date")}>
            <DatePicker value={draft.serves_on} onChange={(v) => set("serves_on", v)} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("field.time")}>
              <Input
                value={draft.serves_at}
                onChange={(e) => set("serves_at", e.target.value)}
                dir="ltr"
                className="tabular-nums"
                placeholder="13:00"
              />
            </Field>
            <Field label={t("field.meal")}>
              <SelectField
                value={draft.meal_period}
                onChange={(v) => {
                  set("meal_period", v as NewOrder["meal_period"])
                  // The menu list is scoped to the period, so a period change
                  // invalidates whatever was picked under the old one.
                  set("menu", null)
                }}
                options={mealOptions(t)}
                allowEmpty={false}
              />
            </Field>
          </div>
          <Field label={t("field.site")}>
            <Input
              value={draft.site_ar}
              onChange={(e) => set("site_ar", e.target.value)}
              placeholder={t("field.site")}
            />
          </Field>
        </>
      ),
    },
    {
      id: "what",
      title: t("field.menu"),
      valid: Boolean(draft.menu),
      content: (
        <>
          <Field label={t("field.style")}>
            <SelectField
              value={draft.service_style}
              onChange={(v) => set("service_style", v as NewOrder["service_style"])}
              options={styleOptions(t)}
              allowEmpty={false}
            />
          </Field>
          <Field
            label={t("field.menu")}
            hint={menuOptions.length === 0 ? t("empty.menus") : undefined}
          >
            <SelectField
              value={draft.menu ?? ""}
              onChange={(v) => set("menu", v || null)}
              options={menuOptions}
              allowEmpty={false}
            />
          </Field>
        </>
      ),
    },
    {
      id: "many",
      title: t("field.expected"),
      valid: draft.expected_covers > 0,
      content: (
        <Field
          label={t("field.expected")}
          hint={t(
            "يُنتَج فوق العدد المثبَّت بنسبة الفائض حتى يأكل القادمون المتأخرون، ولا يُفوتر هذا الفائض ما لم يُستهلك.",
          )}
        >
          <NumInput
            value={draft.expected_covers || ""}
            onChange={(e) => set("expected_covers", Number(e.target.value) || 0)}
          />
        </Field>
      ),
    },
  ]

  return (
    <FormWizard
      open={open}
      onOpenChange={onOpenChange}
      title={t("action.add_order")}
      description={t("page.orders_desc")}
      steps={steps}
      onFinish={() => onAdded?.(addOrder(draft))}
    />
  )
}
