/**
 * Locale as a path prefix (docs/i18n-plan.md §2): `/` is Arabic, `/en/…` is
 * English. No `?lang` param — the prefix IS the locale, so a pasted link
 * carries its language, and the route tree is mounted once per locale rather
 * than parameterised by an optional segment (`:lang?` would happily swallow
 * `/hotels` as a language).
 *
 * Pure module — no React, no i18next — so the router, the bootstrap and the
 * tests can all read it without pulling the runtime in.
 */

export const LOCALES = ["ar", "en"] as const
export type Locale = (typeof LOCALES)[number]

/** Arabic is the product's own language; English is the translation. */
export const DEFAULT_LOCALE: Locale = "ar"

export const LOCALE_DIR: Record<Locale, "rtl" | "ltr"> = { ar: "rtl", en: "ltr" }

/** The URL segment each locale lives under ("" = the bare root). */
export const LOCALE_PREFIX: Record<Locale, string> = { ar: "", en: "/en" }

const isLocale = (v: string): v is Locale => (LOCALES as readonly string[]).includes(v)

/** Strip the Vite base ("/" or "/stagging/") off a raw pathname. */
export function stripBase(pathname: string, base = import.meta.env.BASE_URL): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base
  const p = b && pathname.startsWith(b) ? pathname.slice(b.length) : pathname
  return p.startsWith("/") ? p : `/${p}`
}

/** The locale a router-relative path belongs to. */
export function localeFromPath(path: string): Locale {
  const seg = path.split("/")[1] ?? ""
  return isLocale(seg) && seg !== DEFAULT_LOCALE ? seg : DEFAULT_LOCALE
}

/** The same page in another locale — `/hotels/x` ⇄ `/en/hotels/x`. */
export function withLocale(path: string, locale: Locale): string {
  const seg = path.split("/")[1] ?? ""
  const bare = isLocale(seg) && seg !== DEFAULT_LOCALE ? path.slice(seg.length + 1) || "/" : path
  const prefixed = `${LOCALE_PREFIX[locale]}${bare}`
  return prefixed === "" ? "/" : prefixed
}

/*
 * No stored preference on purpose: the prefix in the URL is the only source
 * of truth for the language, so a link always opens in the language it was
 * shared in. See `useSwitchLocale` for the reasoning the screenshot matrix
 * forced.
 */
