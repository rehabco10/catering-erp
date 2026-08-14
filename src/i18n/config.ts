import i18n from "i18next"
import ICU from "i18next-icu"
import { initReactI18next } from "react-i18next"

import arUi from "@/locales/ar/ui.json"
import arCopy from "@/locales/ar/copy.json"
import arValidation from "@/locales/ar/validation.json"
import enUi from "@/locales/en/ui.json"
import enCopy from "@/locales/en/copy.json"
import enValidation from "@/locales/en/validation.json"
import { DEFAULT_LOCALE, localeFromPath, stripBase, type Locale } from "./locale"
import { setIntlLocale } from "@/lib/intl"
import { formatMessage, setEntityNameLocalizer, setMessageTranslator } from "@/engine/validation"

/**
 * The i18next runtime.
 *
 * ICU rather than i18next's own plural suffixes: Arabic has six plural forms
 * and most of the counted strings here are Arabic-first, so the catalogs carry
 * real `{n, plural, …}` messages the translators can reason about. Two
 * namespaces — `ui` for the interface, `validation` for the engine messages,
 * which come from a non-React module (`lib/validation.ts`) that calls a
 * registered translator rather than a hook.
 *
 * Catalogs are bundled, not fetched: the whole app is one offline-capable SPA
 * and a language switch must not wait on the network.
 */

/** `{nav:{orders:"…"}}` → `{"nav.orders":"…"}`. */
function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === "object") Object.assign(out, flatten(v as Record<string, unknown>, key))
    else out[key] = String(v)
  }
  return out
}

/** The locale the first paint should use — read from the URL prefix. */
function initialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE
  return localeFromPath(stripBase(window.location.pathname))
}

void i18n
  .use(ICU)
  .use(initReactI18next)
  .init({
    resources: {
      // Arabic carries an empty `copy` catalog on purpose: those keys ARE the
      // Arabic sentences, so i18next's key fallback renders them verbatim and
      // the Arabic UI cannot drift from the source.
      ar: { ui: { ...flatten(arUi), ...arCopy }, validation: arValidation },
      en: { ui: { ...flatten(enUi), ...enCopy }, validation: enValidation },
    },
    // The two key schemes have to coexist: structured keys for the shared
    // vocabulary (`units.covers`) and whole Arabic sentences for one-off copy.
    // A sentence ends in "." and contains ":", so i18next must not read any key
    // as a path — the structured catalogs are pre-flattened to dotted keys
    // above and both separators are turned off here.
    keySeparator: false,
    nsSeparator: false,
    lng: initialLocale(),
    fallbackLng: DEFAULT_LOCALE,
    ns: ["ui", "validation"],
    defaultNS: "ui",
    // React escapes for us; ICU handles the formatting.
    interpolation: { escapeValue: false },
    returnNull: false,
  })

setIntlLocale(initialLocale())

// The validation engine's message bridge: English looks up the `validation`
// namespace; anything missing — and Arabic always — formats the Arabic
// template directly, so the engine's output stays identical to its literals.
setMessageTranslator((key, params) => {
  if (i18n.resolvedLanguage !== "en") return formatMessage(key, params)
  const out = i18n.t(key, { ns: "validation", ...params }) as string
  return out === key ? formatMessage(key, params) : out
})

// Entity display names inside engine messages follow the interface language.
setEntityNameLocalizer((e) =>
  (i18n.resolvedLanguage === "en" ? e.name_en || e.name_ar : e.name_ar || e.name_en) ?? "",
)

export default i18n
