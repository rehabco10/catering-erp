import * as React from "react"
import { DirectionProvider } from "@base-ui/react/direction-provider"
import {
  Link,
  useLocation,
  useNavigate,
  type LinkProps,
  type NavigateOptions,
} from "react-router-dom"
import { useTranslation } from "react-i18next"

import { setIntlLocale } from "@/lib/intl"
import { DEFAULT_LOCALE, LOCALE_DIR, withLocale, type Locale } from "./locale"

/**
 * Everything the app needs to know it is in a locale: the current one, the
 * document's `lang`/`dir`, Base UI's direction context (so its popups,
 * selects and drawers flip with the page), and the helpers that keep internal
 * navigation inside the current prefix.
 *
 * A single link built with a bare `/hotels` would silently drop an English
 * user back into Arabic, so `useLocalePath` / `LocaleLink` / `useLocaleNavigate`
 * are the only sanctioned ways to move around.
 */

const LocaleContext = React.createContext<Locale>(DEFAULT_LOCALE)

export const useLocale = () => React.useContext(LocaleContext)

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const { i18n } = useTranslation()
  const dir = LOCALE_DIR[locale]

  // Layout effect, not a render side effect: the document attributes and the
  // formatters must be right before the browser paints this locale.
  React.useLayoutEffect(() => {
    const root = document.documentElement
    root.lang = locale
    root.dir = dir
    setIntlLocale(locale)
    if (i18n.resolvedLanguage !== locale) void i18n.changeLanguage(locale)
  }, [locale, dir, i18n])

  return (
    <LocaleContext.Provider value={locale}>
      <DirectionProvider direction={dir}>{children}</DirectionProvider>
    </LocaleContext.Provider>
  )
}

/* ── navigation helpers ─────────────────────────────────────────── */

/** Prefixes an app-absolute path with the current locale (`/x` → `/en/x`). */
export function useLocalePath() {
  const locale = useLocale()
  return React.useCallback((path: string) => withLocale(path, locale), [locale])
}

/** `<Link>` that stays inside the current locale. */
export function LocaleLink({ to, ...props }: Omit<LinkProps, "to"> & { to: string }) {
  const localePath = useLocalePath()
  return <Link to={localePath(to)} {...props} />
}

/** `navigate()` that stays inside the current locale. */
export function useLocaleNavigate() {
  const navigate = useNavigate()
  const localePath = useLocalePath()
  return React.useCallback(
    (to: string, options?: NavigateOptions) => navigate(localePath(to), options),
    [navigate, localePath],
  )
}

/**
 * Switches locale in place — same page, other prefix.
 *
 * Deliberately the ONLY way the language changes: there is no stored
 * preference redirecting the bare root, because `/` is the canonical Arabic
 * URL and a remembered choice silently rewriting it means a shared link opens
 * in a language the sender never saw. (The first run of the screenshot matrix
 * caught exactly that: `/` served English to a session that had visited
 * `/en` once.) An English user bookmarks `/en`.
 */
export function useSwitchLocale() {
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  return React.useCallback(
    (next: Locale) => navigate(`${withLocale(pathname, next)}${search}`, { replace: true }),
    [navigate, pathname, search],
  )
}
