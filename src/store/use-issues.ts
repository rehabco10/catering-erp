import { useMemo } from "react"
import { useSnapshot } from "valtio"

import { useLocale } from "@/i18n/LocaleProvider"
import { catalogFrom, issuesFor, state } from "@/store/ops"
import type { Catalog } from "@/engine/costing"
import type { Issue } from "@/engine/validation"

/**
 * The single way to read validation results in a component.
 *
 * `issuesFor` walks the raw valtio proxy, which does **not** register as
 * property access for `useSnapshot`. A component that called it directly while
 * only touching, say, `snap.policy.overset_pct` would render once with the
 * right count and then never update — the nav rail would sit on a stale error
 * badge while the panel beside it showed the correct number.
 *
 * Reading every slice the validator actually depends on marks them as tracked,
 * so any change to them re-renders the caller.
 */
export function useIssues(): Issue[] {
  const snap = useSnapshot(state)
  const { items, variants, recipes, menus, suppliers, policy } = snap
  // Messages are rendered in the interface language (the validation bridge),
  // so a language switch must recompute them even though no data changed.
  const locale = useLocale()
  return useMemo(
    () => issuesFor(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, variants, recipes, menus, suppliers, policy, locale],
  )
}

export function useErrorCount(): number {
  const issues = useIssues()
  return useMemo(() => issues.filter((i) => i.level === "error").length, [issues])
}

/**
 * The engine's catalog, rebuilt whenever anything it reads changes.
 *
 * Same tracking discipline as `useIssues`: destructuring the snapshot is what
 * subscribes the component, and the catalog itself is built from the raw proxy
 * so the engine sees live objects rather than frozen snapshot copies.
 */
export function useCatalog(): Catalog {
  const snap = useSnapshot(state)
  const { items, variants, recipes, menus, policy } = snap
  return useMemo(
    () => catalogFrom(state),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, variants, recipes, menus, policy],
  )
}
