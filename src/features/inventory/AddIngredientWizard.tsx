import * as React from "react"
import { useTranslation } from "react-i18next"
import { useSnapshot } from "valtio"

import { Checkbox, Field, Input, NumInput, SelectField } from "@/components/ui/field"
import { FormWizard, type WizardStep } from "@/components/ui/form-wizard"
import { useLocale } from "@/i18n/LocaleProvider"
import { categoryOptions, pickName, storageOptions } from "@/lib/display"
import { BaseUnit, PackUnit } from "@/engine/schemas"
import { addIngredient, state, type NewIngredient } from "@/store/ops"

/**
 * The add-an-ingredient flow, and the reference for how any "add X" is built
 * here: a `FormWizard` in a `ResponsivePanel` — a side sheet where there is
 * horizontal room, a swipeable drawer in narrow portrait.
 *
 * Three steps in the order the information arrives: what it is, how it is
 * bought, and what the kitchen gets out of it. Each step gates on its own
 * `valid`, so an ingredient cannot be created without the two fields every
 * downstream cost depends on — the pack price and the yield.
 *
 * The draft lives here rather than in the store: an abandoned wizard should
 * leave nothing behind, and re-opening starts clean.
 */
export function AddIngredientWizard({
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

  const blank = (): NewIngredient => ({
    name_ar: "",
    name_en: "",
    category: "dry_goods",
    storage: "dry",
    base_unit: "kg",
    pack_unit: "sack",
    pack_size: 1,
    ap_cost_sar: null,
    // 100 = no loss. The checks page questions this for meat and produce
    // rather than the form refusing it — plenty of dry goods really are 100.
    yield_pct: 100,
    allergens: [],
    par_level: 0,
    supplier: null,
    halal_critical: false,
  })

  const [draft, setDraft] = React.useState<NewIngredient>(blank)
  // Each opening is a fresh add — never resume a half-finished previous one.
  React.useEffect(() => {
    if (open) setDraft(blank())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const set = <K extends keyof NewIngredient>(key: K, value: NewIngredient[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  const supplierOptions = snap.suppliers.map((s) => ({
    value: s.id,
    label: pickName(s, locale),
  }))

  const steps: WizardStep[] = [
    {
      id: "what",
      title: t("field.name"),
      valid: Boolean(draft.name_ar || draft.name_en),
      content: (
        <>
          <Field label={t("field.name")}>
            <Input value={draft.name_ar} onChange={(e) => set("name_ar", e.target.value)} />
          </Field>
          <Field label={`${t("field.name")} (EN)`}>
            <Input
              value={draft.name_en}
              onChange={(e) => set("name_en", e.target.value)}
              dir="ltr"
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("field.category")}>
              <SelectField
                value={draft.category}
                onChange={(v) => set("category", v as NewIngredient["category"])}
                options={categoryOptions(t)}
                allowEmpty={false}
              />
            </Field>
            <Field label={t("field.storage")}>
              <SelectField
                value={draft.storage}
                onChange={(v) => set("storage", v as NewIngredient["storage"])}
                options={storageOptions(t)}
                allowEmpty={false}
              />
            </Field>
          </div>
        </>
      ),
    },
    {
      id: "buy",
      title: t("field.ap_cost"),
      // The pack price is the root of every downstream number, so the wizard
      // will not create a row without it — unlike an imported row, which may
      // legitimately arrive unpriced and gets flagged instead.
      valid: draft.ap_cost_sar !== null && draft.pack_size > 0,
      content: (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("field.pack")}>
              <SelectField
                value={draft.pack_unit}
                onChange={(v) => set("pack_unit", v as NewIngredient["pack_unit"])}
                options={PackUnit.options.map((o) => ({ value: o, label: t(`pack.${o}`) }))}
                allowEmpty={false}
              />
            </Field>
            <Field label={t("field.base_unit")}>
              <SelectField
                value={draft.base_unit}
                onChange={(v) => set("base_unit", v as NewIngredient["base_unit"])}
                options={BaseUnit.options.map((o) => ({ value: o, label: t(`unit.${o}`) }))}
                allowEmpty={false}
              />
            </Field>
          </div>
          <Field
            label={t("field.pack_size")}
            hint={`${t("field.base_unit")} / ${t(`pack.${draft.pack_unit}`)}`}
          >
            <NumInput
              value={draft.pack_size}
              onChange={(e) => set("pack_size", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label={t("field.ap_cost")}>
            <NumInput
              value={draft.ap_cost_sar ?? ""}
              onChange={(e) =>
                set("ap_cost_sar", e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </Field>
        </>
      ),
    },
    {
      id: "kitchen",
      title: t("field.yield"),
      valid: draft.yield_pct >= 1 && draft.yield_pct <= 100,
      content: (
        <>
          <Field
            label={t("field.yield")}
            hint={t("سعر الشراء يُقسَم على نسبة الاستخلاص للحصول على تكلفة ما يصل الطبق فعلًا.")}
          >
            <NumInput
              value={draft.yield_pct}
              onChange={(e) => set("yield_pct", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label={t("field.par")}>
            <NumInput
              value={draft.par_level}
              onChange={(e) => set("par_level", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label={t("field.supplier")}>
            <SelectField
              value={draft.supplier ?? ""}
              onChange={(v) => set("supplier", v || null)}
              options={supplierOptions}
            />
          </Field>
          <label className="flex items-center gap-2 text-[12px]">
            <Checkbox
              checked={draft.halal_critical}
              onCheckedChange={(v) => set("halal_critical", v === true)}
            />
            {t("field.halal_critical")}
          </label>
        </>
      ),
    },
  ]

  return (
    <FormWizard
      open={open}
      onOpenChange={onOpenChange}
      title={t("action.add_ingredient")}
      description={t("page.inventory_desc")}
      steps={steps}
      onFinish={() => onAdded?.(addIngredient(draft))}
    />
  )
}
