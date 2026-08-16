import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import { useQueryState } from "nuqs"
import { useSnapshot } from "valtio"
import { LayoutList, Network } from "lucide-react"

import { MasterDetail } from "@/components/MasterDetail"
import { PageHeader } from "@/components/PageShell"
import { FilterChips } from "@/components/ui/filter-chips"
import { AddDishSheet } from "@/features/menus/AddDishSheet"
import { MenuForm } from "@/features/menus/MenuForm"
import { MenuGraph } from "@/features/menus/graph/MenuGraph"
import { useLocale, useLocalePath } from "@/i18n/LocaleProvider"
import { menuCost } from "@/engine/costing"
import { foodCostTone, money, pct, pickName, toneClasses } from "@/lib/display"
import { ServiceLine, type MenuCourseValue, type ServiceLineValue } from "@/engine/schemas"
import { cn } from "@/lib/utils"
import { select, state, toggleExpandedMenu } from "@/store/ops"
import { useCatalog } from "@/store/use-issues"

/**
 * Menus, two ways.
 *
 * The same catalogue answers two different questions and they want different
 * shapes:
 *
 *   **form** — "what exactly is in this menu and what does it sell for". A
 *   list to pick from and a structured editor: identity, composition, pricing,
 *   in the order the decisions are actually made.
 *
 *   **graph** — "which dish is eating the margin, and how does the catalogue
 *   sit against the target". A composition question, so it gets a tree:
 *   catalogue → service line → package → dish, where the expensive branch is
 *   literally wider. Modelled on the package wizard's canvas.
 *
 * The mode lives in the URL (`?view=`), so a link carries which view the sender
 * was looking at — the graph is worth sending, and a mode kept in component
 * state cannot be shared.
 */
export function MenusPage() {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const navigate = useNavigate()
  const localePath = useLocalePath()
  const { menuId } = useParams()

  const [view, setView] = useQueryState("view")
  const graph = view === "graph"

  const [line, setLine] = useState<ServiceLineValue | null>(null)
  // Which menu, and into which section — a dish is never added loose.
  const [adding, setAdding] = useState<{ menu: string; course: MenuCourseValue } | null>(null)

  const costed = useMemo(
    () => snap.menus.map((m) => ({ menu: m, cost: menuCost(m.id, catalog) })),
    [snap.menus, catalog],
  )
  const shown = line ? costed.filter((c) => c.menu.service_line === line) : costed
  const selected = menuId ? snap.menus.find((m) => m.id === menuId) : undefined
  const go = (id: string | null) => navigate(localePath(id ? `/menus/${id}` : "/menus"))

  /** Graph → form: open that menu's editor, and leave the canvas. */
  const openFromGraph = (id: string) => {
    void setView(null)
    go(id)
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-page">
      <PageHeader
        title={t("page.menus")}
        description={t(graph ? "page.menus_graph_desc" : "page.menus_desc")}
        actions={
          <div
            role="group"
            aria-label={t("view.label")}
            className="flex items-center rounded-lg border border-surface-line bg-surface-raised p-0.5"
          >
            <ModeButton
              active={!graph}
              label={t("view.form")}
              onClick={() => void setView(null)}
              icon={<LayoutList className="size-3.5" />}
            />
            <ModeButton
              active={graph}
              label={t("view.graph")}
              onClick={() => {
                // Entering the canvas with a menu already open should show that
                // menu's branch, not a collapsed tree the user has to re-find.
                if (selected) {
                  select(selected.id)
                  if (state.expandedMenuId !== selected.id) toggleExpandedMenu(selected.id)
                }
                void setView("graph")
              }}
              icon={<Network className="size-3.5" />}
            />
          </div>
        }
      />

      {graph ? (
        <div className="min-h-0 flex-1">
          {/* The canvas has no section to add into, so it opens the picker on
              mains — the section a dish most often belongs to. */}
          <MenuGraph
            onMenuActivated={openFromGraph}
            onAddDish={(menu) => setAdding({ menu, course: "main" })}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 px-4 py-4">
          <MasterDetail
            detailOpen={Boolean(selected)}
            onBack={() => go(null)}
            placeholder={t("empty.menus")}
            master={
              <>
                <FilterChips
                  value={line}
                  onChange={setLine}
                  options={ServiceLine.options
                    .map((v) => ({
                      value: v,
                      label: t(`line.${v}`),
                      count: costed.filter((c) => c.menu.service_line === v).length,
                    }))
                    .filter((o) => o.count > 0)}
                />
                {shown.map(({ menu, cost }) => {
                  const tone =
                    toneClasses[
                      foodCostTone(cost.foodCostPct, snap.policy.target_food_cost_pct)
                    ]
                  return (
                    <button
                      key={menu.id}
                      type="button"
                      onClick={() => go(menu.id)}
                      className={cn(
                        "block w-full rounded-xl border bg-surface-raised p-3 text-start shadow-[var(--elev-1)] transition-colors",
                        menu.id === menuId
                          ? "border-[color:var(--brand-navy)] ring-1 ring-[color:var(--brand-navy)]"
                          : "border-surface-line hover:bg-surface-sunken",
                      )}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[13px] font-bold">
                          {pickName(menu, locale)}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {t(`line.${menu.service_line}`)}
                          {menu.level !== null ? ` ${menu.level}` : ""}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {menu.meal_period ? `${t(`meal.${menu.meal_period}`)} · ` : ""}
                        {t("graph.dish_count", { n: menu.items.length })}
                      </p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[12px] tabular-nums">
                          {/* "≥" because uncosted dishes can only add to it —
                              see the pricing block in MenuForm. */}
                          {menu.items.some((i) => catalog.recipes.get(i.recipe)?.draft) ? "≥ " : ""}
                          {money(cost.perCover)}
                          <span className="text-muted-foreground">
                            {" / "}
                            {cost.pricePerCover === null ? "—" : money(cost.pricePerCover)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
                            tone.bg,
                            tone.fg,
                          )}
                        >
                          {pct(cost.foodCostPct)}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </>
            }
            detail={
              selected ? (
                <MenuForm
                  menuId={selected.id}
                  onAddDish={(menu, course) => setAdding({ menu, course })}
                />
              ) : null
            }
          />
        </div>
      )}

      {/* One picker for both modes — the canvas (+) and the form button open
          the same sheet, so adding a dish is one flow however you got here. */}
      <AddDishSheet
        menuId={adding?.menu ?? null}
        course={adding?.course ?? "main"}
        open={adding !== null}
        onOpenChange={(o) => !o && setAdding(null)}
      />
    </div>
  )
}

function ModeButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors",
        active
          ? "bg-[color:var(--brand-navy)] text-white shadow-[var(--elev-1)]"
          : "text-muted-foreground hover:bg-surface-sunken",
      )}
    >
      {icon}
      {label}
    </button>
  )
}
