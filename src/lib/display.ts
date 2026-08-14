import type { TFunction } from "i18next"

import { formats } from "@/lib/intl"
import type { SelectOption } from "@/components/ui/select-field"
import {
  Allergen,
  IngredientCategory,
  MealPeriod,
  MenuTier,
  ServiceStyle,
  Station,
  StorageClass,
} from "@/lib/schemas"

/**
 * Display helpers — one place that knows how a domain value becomes a string.
 *
 * Two rules the pages inherit by using these rather than formatting inline:
 * money is always rounded at the point of display and never in the engine, and
 * an enum's label always comes from the catalog, so an untranslated value shows
 * as its key rather than as a hardcoded Arabic word inside an English page.
 */

/** Bilingual records display in the interface language, falling back the other way. */
export const pickName = (
  e: { name_ar?: string | null; name_en?: string | null },
  locale: string,
): string => (locale === "en" ? e.name_en || e.name_ar : e.name_ar || e.name_en) ?? ""

/** Two decimals — the unit costs where a halala matters. */
export const money = (n: number) => formats().money.format(n)

/** Whole riyals — totals, where two decimals are noise. */
export const money0 = (n: number) => formats().number.format(Math.round(n))

/** One decimal, for percentages and quantities. */
export const dec1 = (n: number) => formats().number.format(Math.round(n * 10) / 10)

export const dec2 = (n: number) => formats().number.format(Math.round(n * 100) / 100)

export const int = (n: number) => formats().number.format(Math.round(n))

export const pct = (n: number | null) => (n === null ? "—" : `${dec1(n)}%`)

export const isoDate = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (!m) return d
  return formats().date.format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])))
}

/** Short weekday + day, for the production day picker. */
export const shortDay = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d)
  if (!m) return d
  return new Intl.DateTimeFormat(formats().date.resolvedOptions().locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])))
}

/* ── enum option lists ──────────────────────────────────────────── */

/**
 * Build a `SelectField` option list from a zod enum and a catalog prefix, so
 * the options and the labels can never drift apart — adding a value to the
 * schema surfaces it in every picker, untranslated but visible.
 */
const optionsFrom = (values: readonly string[], prefix: string, t: TFunction): SelectOption[] =>
  values.map((value) => ({ value, label: t(`${prefix}.${value}`) }))

export const mealOptions = (t: TFunction) => optionsFrom(MealPeriod.options, "meal", t)
export const styleOptions = (t: TFunction) => optionsFrom(ServiceStyle.options, "style", t)
export const tierOptions = (t: TFunction) => optionsFrom(MenuTier.options, "tier", t)
export const stationOptions = (t: TFunction) => optionsFrom(Station.options, "station", t)
export const storageOptions = (t: TFunction) => optionsFrom(StorageClass.options, "storage", t)
export const categoryOptions = (t: TFunction) => optionsFrom(IngredientCategory.options, "cat", t)
export const allergenOptions = (t: TFunction) => optionsFrom(Allergen.options, "allergen", t)

/* ── tone mapping ───────────────────────────────────────────────── */

export type Tone = "neutral" | "good" | "warn" | "bad"

/**
 * How a food-cost percentage reads against the target.
 *
 * Under target is `good`, not `neutral`: a menu costing less than planned is
 * margin the operation gets to keep, and flagging it green is what prompts
 * someone to check the portion spec rather than assume a windfall.
 */
export function foodCostTone(pct: number | null, target: number): Tone {
  if (pct === null) return "neutral"
  if (pct > target + 8) return "bad"
  if (pct > target + 2) return "warn"
  return "good"
}

export const toneClasses: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: "bg-surface-sunken", fg: "text-foreground" },
  good: {
    bg: "bg-[color:var(--brand-green-soft)]",
    fg: "text-[color:var(--brand-green-deep)]",
  },
  warn: {
    bg: "bg-[color:var(--brand-amber-soft)]",
    fg: "text-[color:var(--brand-amber-deep)]",
  },
  bad: { bg: "bg-[color:var(--brand-ruby-soft)]", fg: "text-[color:var(--brand-ruby-deep)]" },
}
