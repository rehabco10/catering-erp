import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { useSnapshot } from "valtio"
import { CornerDownLeft, Search } from "lucide-react"

import { Input } from "@/components/ui/field"
import { ResponsivePanel } from "@/components/ui/responsive-panel"
import { useLocale } from "@/i18n/LocaleProvider"
import { itemUnitCost, recipeCost } from "@/engine/costing"
import { money, pickName } from "@/lib/display"
import { addRecipeLine, state } from "@/store/ops"
import { useCatalog } from "@/store/use-issues"

/**
 * Picking what goes into a recipe.
 *
 * Replaces the two-select-and-a-button cluster that used to sit in the build
 * card's header. That cluster made you choose *kind* before you could search,
 * which is backwards — a chef knows they want cardamom, not that cardamom is
 * filed as an ingredient rather than a sub-recipe. Here one search covers both
 * and the grouping is the answer, not the question.
 *
 * Each row carries its unit cost, so the price is visible at the moment of
 * choosing rather than after the line has been added and the total has moved.
 */
export function AddLineSheet({
  recipeId,
  open,
  onOpenChange,
}: {
  recipeId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const snap = useSnapshot(state)
  const { t } = useTranslation()
  const locale = useLocale()
  const catalog = useCatalog()
  const [query, setQuery] = useState("")

  const recipe = snap.recipes.find((r) => r.id === recipeId)
  const taken = new Set(recipe?.lines.map((l) => l.ref) ?? [])
  const q = query.trim().toLowerCase()
  const matches = (e: { name_ar: string; name_en: string }) =>
    !q || e.name_ar.toLowerCase().includes(q) || e.name_en.toLowerCase().includes(q)

  const items = useMemo(
    () =>
      snap.items
        .filter((i) => !taken.has(i.id) && matches(i))
        .map((i) => ({
          id: i.id,
          label: pickName(i, locale),
          meta: t(`cat.${i.category}`),
          unit: t(`unit.${i.base_unit}`),
          // Priced through the item's costing basis, so the figure here is the
          // one the line will actually carry once added.
          cost: itemUnitCost(i.id, catalog),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap.items, snap.variants, q, locale, catalog, recipe?.lines.length],
  )

  const subRecipes = useMemo(
    () =>
      snap.recipes
        // Self-reference is refused outright; deeper cycles are caught by the
        // explosion and reported, so they are not hidden from the picker.
        .filter((r) => r.id !== recipeId && !taken.has(r.id) && matches(r))
        .map((r) => ({
          id: r.id,
          label: pickName(r, locale),
          meta: t(`station.${r.station}`),
          unit: t("unit.portion"),
          cost: recipeCost(r.id, catalog).perPortion,
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap.recipes, q, locale, catalog, recipeId, recipe?.lines.length],
  )

  const add = (kind: "item" | "recipe", ref: string) => {
    // Quantity starts at 1 and is set on the card, where the running cost is
    // visible — asking for it here would mean typing a number against a total
    // you cannot see yet.
    addRecipeLine(recipeId, kind, ref, 1)
    setQuery("")
    onOpenChange(false)
  }

  const group = (
    title: string,
    rows: typeof items,
    kind: "item" | "recipe",
  ) =>
    rows.length > 0 && (
      <section>
        <h3 className="sticky top-0 bg-surface-sunken px-4 py-1.5 text-[10px] font-bold text-muted-foreground">
          {title}
        </h3>
        <ul>
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => add(kind, row.id)}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-start transition-colors hover:bg-surface-sunken"
              >
                {kind === "recipe" && (
                  <CornerDownLeft className="size-3.5 shrink-0 text-[color:var(--brand-navy)]" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{row.label}</span>
                  <span className="block text-[10px] text-muted-foreground">{row.meta}</span>
                </span>
                <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                  {row.cost === null ? "—" : money(row.cost)}
                  <span className="opacity-70"> / {row.unit}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    )

  const empty = items.length === 0 && subRecipes.length === 0

  return (
    <ResponsivePanel
      open={open}
      onOpenChange={onOpenChange}
      title={t("action.add_line")}
      description={recipe ? pickName(recipe, locale) : undefined}
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
        <>
          {group(t("group.items"), items, "item")}
          {group(t("group.sub_recipes"), subRecipes, "recipe")}
        </>
      )}
    </ResponsivePanel>
  )
}
