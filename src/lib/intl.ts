import { arSA, enUS } from "date-fns/locale"

import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale"

/**
 * One place that knows how numbers and dates are formatted per locale, so the
 * call sites (`arNum`, the date picker, the calendar) stay one-liners and no
 * component grows its own `Intl` constant.
 *
 * Arabic keeps Latin digits deliberately (`-u-nu-latn`): Nusuk Hajj, the
 * ministry forms and every export in `ocr/` use them, so a number here has to
 * match what the operator types into the platform. Gregorian is likewise
 * explicit — plain `ar-SA` formats dates in the Islamic calendar while all of
 * the supply data (contracts, flights, PocketBase) is Gregorian.
 */

const TAG: Record<Locale, string> = {
  ar: "ar-SA-u-ca-gregory-nu-latn",
  en: "en-US",
}

interface Formats {
  number: Intl.NumberFormat
  money: Intl.NumberFormat
  date: Intl.DateTimeFormat
  monthYear: Intl.DateTimeFormat
  weekdayNarrow: Intl.DateTimeFormat
  time: Intl.DateTimeFormat
  dateFns: typeof arSA
}

const build = (locale: Locale): Formats => {
  const tag = TAG[locale]
  return {
    number: new Intl.NumberFormat(tag, { useGrouping: true }),
    money: new Intl.NumberFormat(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    date: new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric" }),
    monthYear: new Intl.DateTimeFormat(tag, { month: "long", year: "numeric" }),
    weekdayNarrow: new Intl.DateTimeFormat(tag, { weekday: "narrow" }),
    time: new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit" }),
    dateFns: locale === "ar" ? arSA : enUS,
  }
}

const CACHE: Partial<Record<Locale, Formats>> = {}
let current: Locale = DEFAULT_LOCALE

/** Called by the locale layout on every language change. */
export function setIntlLocale(locale: Locale): void {
  current = locale
}

export function formats(): Formats {
  return (CACHE[current] ??= build(current))
}
