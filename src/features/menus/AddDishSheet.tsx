import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSnapshot } from "valtio"
import { Search } from "lucide-react"

import { Input } from "@/components/ui/field"
import { ResponsivePanel } from "@/components/ui/responsive-panel"
import { useLocale } from "@/i18n/LocaleProvider"
import { recipeCost } from "@/engine/costing"
import { money, pickName } from "@/lib/display"
import type { MenuCourseValue, StationValue } from "@/engine/schemas"
import { addMenuItem, state } from "@/store/ops"
import { useCatalog } from "@/store/use-issues"

/**
 * Picking a dish for a menu.
 *
 * Same shape as the recipe page's line picker, deliberately: one search, the
 * grouping as the answer rather than the question, and the cost visible at the
 * moment of choosing. Grouped by station here because that is how a menu is
 * balanced — you notice you have four hot dishes and no salad by looking at
 * the headings, not by reading names.
 */
export function AddDishSheet({
  menuId,
  course,
  open,
  onOpenChange,
}: {
  menuId: string | null
  /** The section the dish is being added into. */
  course: MenuCourseValue
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const [query, setQuery] = useState("")

  const menu = menuId ? snap.menus.find((m) => m.id === menuId) : undefined
  const taken = new Set(menu?.items.map((i) => i.recipe) ?? [])
  const q = query.trim().toLowerCase()

  const byStation = useMemo(() => {
    const groups = new Map<StationValue, Array<{ id: string; label: string; cost: number }>>()
    for (const r of snap.recipes) {
      if (taken.has(r.id)) continue
      if (q && !r.name_ar.toLowerCase().includes(q) && !r.name_en.toLowerCase().includes(q)) continue
      const list = groups.get(r.station) ?? []
      list.push({
        id: r.id,
        label: pickName(r, locale),
        cost: recipeCost(r.id, catalog).perPortion,
      })
      groups.set(r.station, list)
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap.recipes, q, locale, catalog, menu?.items.length])

  const add = (recipeId: string) => {
    if (!menuId) return
    // One portion per cover is the common case; fractions (a shared mezze, a
    // salad half the room takes) are set on the card, where the running food
    // cost is visible.
    addMenuItem(menuId, recipeId, course, 1)
    setQuery("")
    onOpenChange(false)
  }

  const empty = byStation.size === 0

  return (
    <ResponsivePanel
      open={open}
      onOpenChange={onOpenChange}
      title={t("action.add_dish")}
      description={
        menu ? `${pickName(menu, locale)} · ${t(`course.${course}`)}` : t(`course.${course}`)
      }
    >
      <div className="border-b border-surface-line p-3">
        <div className="relative">
          {/* `start-2`, not `left-2`: the app is RTL by default. */}
          <Search className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("action.search")}
            autoFocus
            className="ps-8"
          />
        </div>
      </div>

      {empty ? (
        <p className="px-4 py-8 text-center text-[13px] text-muted-foreground">
          {t("empty.no_results")}
        </p>
      ) : (
        [...byStation.entries()].map(([station, rows]) => (
          <section key={station}>
            <h3 className="sticky top-0 bg-surface-sunken px-4 py-1.5 text-[10px] font-bold text-muted-foreground">
              {t(`station.${station}`)}
            </h3>
            <ul>
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => add(row.id)}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-start transition-colors hover:bg-surface-sunken"
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                      {row.label}
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                      {money(row.cost)}
                      <span className="opacity-70"> / {t("unit.portion")}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </ResponsivePanel>
  )
}
