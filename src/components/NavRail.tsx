import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useLocation } from "react-router-dom"
import {
  BookOpen,
  Boxes,
  ChefHat,
  Menu,
  Settings,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react"

import { BrandPattern } from "@/components/BrandPattern"
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer"
import { useLocaleNavigate, useLocalePath } from "@/i18n/LocaleProvider"
import { withLocale } from "@/i18n/locale"
import { SIDE_PANEL_QUERY, useMediaQuery } from "@/hooks/use-media-query"
import { useErrorCount } from "@/store/use-issues"
import { cn, arNum } from "@/lib/utils"

interface Item {
  to: string
  /** Catalog key under `nav.` — the label is resolved at render. */
  key: string
  icon: LucideIcon
  /** Show the blocking-finding count on this item. */
  badge?: boolean
}

/**
 * Ordered along the chain, not alphabetically: raw stock, what it is turned
 * into, what that is sold as — then the checks over all three.
 */
const ITEMS: Item[] = [
  { to: "/inventory", key: "inventory", icon: Boxes },
  { to: "/recipes", key: "recipes", icon: ChefHat },
  { to: "/menus", key: "menus", icon: BookOpen },
  { to: "/validation", key: "validation", icon: ShieldCheck, badge: true },
  { to: "/settings", key: "settings", icon: Settings },
]

/**
 * Wide screens get the rail; narrow ones get a burger that opens the same
 * destinations as a drawer. A 72px rail on a 390px viewport is nearly a fifth
 * of the width permanently spent on navigation.
 */
export function Navigation() {
  const wide = useMediaQuery(SIDE_PANEL_QUERY)
  return wide ? <NavRail /> : <NavBurger />
}

/**
 * The rail carries the brand: Mystic Navy, REHAB's diamond motif behind it, the
 * wordmark at the top. Everything else in the app is a light surface, so this
 * is the one element that says whose product this is — and it anchors the
 * layout on the start edge at every breakpoint.
 */
export function NavRail() {
  const errorCount = useErrorCount()
  const localePath = useLocalePath()
  const { t } = useTranslation()

  return (
    <nav
      aria-label={t("nav.sections")}
      className="no-trim relative z-20 flex w-18 shrink-0 flex-col items-center gap-1 overflow-hidden bg-surface-brand py-3 text-surface-brand-foreground shadow-[var(--elev-2)]"
    >
      <BrandPattern className="text-white" size={22} opacity={0.08} />

      {/* The white wordmark, not a chip: the asset is drawn for a dark ground,
          so putting it straight on the navy is what it was made for. */}
      <img
        src={`${import.meta.env.BASE_URL}rehab-logo-white.svg`}
        alt={t("brand")}
        className="relative mb-3 w-12"
      />

      <div className="relative flex flex-col items-center gap-1">
        {ITEMS.map((item, i) => (
          <div key={item.to} className="contents">
            {/* Separates the three parts of the chain from the pages that
                sit over all of them. */}
            {i === 3 && <span className="my-1.5 h-px w-8 bg-white/15" />}
            <NavLink
              to={localePath(item.to)}
              title={t(`nav.${item.key}`)}
              aria-label={t(`nav.${item.key}`)}
              className={({ isActive }) =>
                cn(
                  "group relative grid size-11 place-items-center rounded-xl transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
                  isActive
                    ? "bg-white text-[color:var(--brand-navy-deep)] shadow-[var(--elev-1)]"
                    : "text-white/65 hover:bg-white/12 hover:text-white",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active marker in Dark Ruby, inset so it stays within the
                      rail rather than spilling onto the page beside it. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute end-0 h-6 w-1 rounded-full bg-[color:var(--brand-ruby)] transition-opacity",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <item.icon className="size-5" />
                  {item.badge && errorCount > 0 && (
                    <span
                      className="absolute -top-0.5 -end-0.5 min-w-4 rounded-full bg-[color:var(--brand-ruby)] px-1 text-[9px] leading-4 font-bold text-white ring-2 ring-[color:var(--surface-brand)] tabular-nums"
                      aria-label={t("nav.error_count", { count: errorCount })}
                    >
                      {arNum(errorCount)}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </div>
        ))}
      </div>
    </nav>
  )
}

/* ── narrow screens ─────────────────────────────────────────────── */

function NavBurger() {
  const errorCount = useErrorCount()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const navigate = useLocaleNavigate()
  const { t } = useTranslation()

  // A route change means the user picked something — close behind them.
  useEffect(() => setOpen(false), [pathname])

  // Match against the locale-stripped path so `/en/menus` still resolves to
  // the menus item.
  const bare = withLocale(pathname, "ar")
  const current = ITEMS.find((i) => bare.startsWith(i.to))

  return (
    <>
      {/* A slim brand bar instead of a rail: wordmark, current section, burger. */}
      <div className="no-trim fixed inset-x-0 top-0 z-30 flex h-12 items-center gap-3 bg-surface-brand px-3 text-surface-brand-foreground shadow-[var(--elev-2)]">
        <img
          src={`${import.meta.env.BASE_URL}rehab-logo-white.svg`}
          alt={t("brand")}
          className="h-4 w-auto shrink-0"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold">
          {current ? t(`nav.${current.key}`) : t("app")}
        </span>
        <button
          type="button"
          aria-label={t("nav.open_menu")}
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="relative grid size-9 shrink-0 place-items-center rounded-lg text-white/85 transition-colors hover:bg-white/12 hover:text-white"
        >
          <Menu className="size-5" />
          {errorCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 min-w-4 rounded-full bg-[color:var(--brand-ruby)] px-1 text-[9px] leading-4 font-bold text-white ring-2 ring-[color:var(--surface-brand)] tabular-nums">
              {arNum(errorCount)}
            </span>
          )}
        </button>
      </div>
      {/* Spacer so page content is not hidden behind the fixed bar. */}
      <div aria-hidden className="h-12 shrink-0" />

      <Drawer open={open} onOpenChange={setOpen} showSwipeHandle swipeDirection="down">
        <DrawerContent className="bg-popover">
          <DrawerTitle className="border-b border-surface-line px-4 py-3 text-[13px] font-bold">
            {t("nav.sections")}
          </DrawerTitle>
          <ul className="py-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {ITEMS.map((item) => {
              const active = bare.startsWith(item.to)
              return (
                <li key={item.to}>
                  <button
                    type="button"
                    onClick={() => navigate(item.to)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-start text-[13px] transition-colors",
                      active
                        ? "bg-[color:var(--brand-navy-soft)] font-semibold text-[color:var(--brand-navy-deep)]"
                        : "text-foreground hover:bg-surface-sunken",
                    )}
                  >
                    <item.icon className="size-4.5 shrink-0" />
                    <span className="flex-1">{t(`nav.${item.key}`)}</span>
                    {item.badge && errorCount > 0 && (
                      <span className="rounded-full bg-[color:var(--brand-ruby)] px-1.5 text-[10px] leading-5 font-bold text-white tabular-nums">
                        {arNum(errorCount)}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </DrawerContent>
      </Drawer>
    </>
  )
}
