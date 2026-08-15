import * as React from "react"
import { useTranslation } from "react-i18next"
import { useSnapshot } from "valtio"

import { Checkbox, Field, Input, NumInput, SelectField } from "@/components/ui/field"
import { FormWizard, type WizardStep } from "@/components/ui/form-wizard"
import { useLocale } from "@/i18n/LocaleProvider"
import { categoryOptions, pickName, storageOptions } from "@/lib/display"
import { BaseUnit, PackUnit } from "@/engine/schemas"
import { addItem, state, type NewItem, type NewVariant } from "@/store/ops"

/**
 * The add-an-item flow, and the reference for how any "add X" is built here:
 * a `FormWizard` in a `ResponsivePanel` — a side sheet where there is
 * horizontal room, a swipeable drawer in narrow portrait.
 *
 * It collects an item **and its first purchase variant together**, on purpose.
 * An item with no way to buy it is `item.no_variants`, a blocking finding the
 * moment it exists — so offering a path that creates one would be offering a
 * path that creates a defect.
 *
 * Three steps in the order the information arrives: what it is, how it is
 * bought, and what the kitchen gets out of it. Each gates on its own `valid`.
 *
 * The draft lives here rather than in the store: an abandoned wizard should
 * leave nothing behind, and re-opening starts clean.
 */
export function AddItemWizard({
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

  const blankItem = (): NewItem => ({
    name_ar: "",
    name_en: "",
    category: "dry_goods",
    base_unit: "kg",
    allergens: [],
    halal_critical: false,
    par_level: 0,
  })

  const blankVariant = (): NewVariant => ({
    name_ar: "",
    name_en: "",
    supplier: null,
    supplier_ref: null,
    pack_unit: "sack",
    pack_size: 1,
    ap_cost_sar: null,
    // 100 = no loss. The checks page questions this for meat and produce
    // rather than the form refusing it — plenty of dry goods really are 100.
    yield_pct: 100,
    storage: "dry",
  })

  const [item, setItem] = React.useState<NewItem>(blankItem)
  const [variant, setVariant] = React.useState<NewVariant>(blankVariant)

  // Each opening is a fresh add — never resume a half-finished previous one.
  React.useEffect(() => {
    if (!open) return
    setItem(blankItem())
    setVariant(blankVariant())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const setI = <K extends keyof NewItem>(key: K, value: NewItem[K]) =>
    setItem((d) => ({ ...d, [key]: value }))
  const setV = <K extends keyof NewVariant>(key: K, value: NewVariant[K]) =>
    setVariant((d) => ({ ...d, [key]: value }))

  const supplierOptions = snap.suppliers.map((s) => ({
    value: s.id,
    label: pickName(s, locale),
  }))

  const steps: WizardStep[] = [
    {
      id: "what",
      title: t("field.name"),
      valid: Boolean(item.name_ar || item.name_en),
      content: (
        <>
          <Field label={t("field.name")} hint={t("field.item_name_hint")}>
            <Input value={item.name_ar} onChange={(e) => setI("name_ar", e.target.value)} />
          </Field>
          <Field label={`${t("field.name")} (EN)`}>
            <Input
              dir="ltr"
              value={item.name_en}
              onChange={(e) => setI("name_en", e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("field.category")}>
              <SelectField
                value={item.category}
                onChange={(v) => setI("category", v as NewItem["category"])}
                options={categoryOptions(t)}
                allowEmpty={false}
              />
            </Field>
            <Field label={t("field.base_unit")} hint={t("field.base_unit_hint")}>
              <SelectField
                value={item.base_unit}
                onChange={(v) => setI("base_unit", v as NewItem["base_unit"])}
                options={BaseUnit.options.map((o) => ({ value: o, label: t(`unit.${o}`) }))}
                allowEmpty={false}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[12px]">
            <Checkbox
              checked={item.halal_critical}
              onCheckedChange={(v) => setI("halal_critical", v === true)}
            />
            {t("field.halal_critical")}
          </label>
        </>
      ),
    },
    {
      id: "buy",
      title: t("section.first_variant"),
      // The pack price is the root of every downstream number, so the wizard
      // will not create a row without it — unlike an imported row, which may
      // legitimately arrive unpriced and gets flagged instead.
      valid:
        Boolean(variant.name_ar || variant.name_en) &&
        variant.ap_cost_sar !== null &&
        variant.pack_size > 0,
      content: (
        <>
          <Field label={t("field.variant_name")} hint={t("field.variant_name_hint")}>
            <Input value={variant.name_ar} onChange={(e) => setV("name_ar", e.target.value)} />
          </Field>
          <Field label={t("field.supplier")}>
            <SelectField
              value={variant.supplier ?? ""}
              onChange={(v) => setV("supplier", v || null)}
              options={supplierOptions}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("field.pack")}>
              <SelectField
                value={variant.pack_unit}
                onChange={(v) => setV("pack_unit", v as NewVariant["pack_unit"])}
                options={PackUnit.options.map((o) => ({ value: o, label: t(`packunit.${o}`) }))}
                allowEmpty={false}
              />
            </Field>
            <Field
              label={t("field.pack_size")}
              hint={`${t(`unit.${item.base_unit}`)} / ${t(`packunit.${variant.pack_unit}`)}`}
            >
              <NumInput
                value={variant.pack_size}
                onChange={(e) => setV("pack_size", Number(e.target.value) || 0)}
              />
            </Field>
          </div>
          <Field label={t("field.ap_cost")}>
            <NumInput
              value={variant.ap_cost_sar ?? ""}
              onChange={(e) =>
                setV("ap_cost_sar", e.target.value === "" ? null : Number(e.target.value))
              }
            />
          </Field>
        </>
      ),
    },
    {
      id: "kitchen",
      title: t("field.yield"),
      valid: variant.yield_pct >= 1 && variant.yield_pct <= 100,
      content: (
        <>
          <Field
            label={t("field.yield")}
            hint={t("سعر الشراء يُقسَم على نسبة الاستخلاص للحصول على تكلفة ما يصل الطبق فعلًا.")}
          >
            <NumInput
              value={variant.yield_pct}
              onChange={(e) => setV("yield_pct", Number(e.target.value) || 0)}
            />
          </Field>
          <Field label={t("field.storage")}>
            <SelectField
              value={variant.storage}
              onChange={(v) => setV("storage", v as NewVariant["storage"])}
              options={storageOptions(t)}
              allowEmpty={false}
            />
          </Field>
          {/* Par is on the item, not the variant: the kitchen runs out of the
              thing, not of one way of buying it. */}
          <Field label={t("field.par")} hint={t("field.par_hint")}>
            <NumInput
              value={item.par_level}
              onChange={(e) => setI("par_level", Number(e.target.value) || 0)}
            />
          </Field>
        </>
      ),
    },
  ]

  return (
    <FormWizard
      open={open}
      onOpenChange={onOpenChange}
      title={t("action.add_item")}
      description={t("page.inventory_desc")}
      steps={steps}
      onFinish={() => onAdded?.(addItem(item, variant))}
    />
  )
}
