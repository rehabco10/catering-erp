import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

/**
 * The shared status vocabulary. One component so a «موقَّع» pill on a contract
 * and an «عدد مثبَّت» pill on a service order read as the same state
 * (committed), and the tentative/dead states likewise.
 *
 * The label comes from the catalog under `status.*` — deliberately its own key
 * space rather than reusing contract/order status: those are the *editor's*
 * option lists, while this is the shared badge shown across entity kinds.
 *
 * Grouped by what the state means commercially, not by which table it came
 * from — that is what makes a mixed list scannable.
 */
const STYLE: Record<string, string> = {
  // committed: money and food are both spoken for
  signed: "bg-[color:var(--brand-green-soft)] text-[color:var(--brand-green-deep)]",
  confirmed: "bg-[color:var(--brand-green-soft)] text-[color:var(--brand-green-deep)]",
  guaranteed: "bg-[color:var(--brand-green-soft)] text-[color:var(--brand-green-deep)]",
  // in flight: the kitchen has acted, the books have not closed
  produced: "bg-[color:var(--brand-navy-soft)] text-[color:var(--brand-navy-deep)]",
  served: "bg-[color:var(--brand-navy-soft)] text-[color:var(--brand-navy-deep)]",
  // tentative: a forecast, not a commitment
  proposed: "bg-[color:var(--brand-amber-soft)] text-[color:var(--brand-amber-deep)]",
  draft: "bg-[color:var(--brand-amber-soft)] text-[color:var(--brand-amber-deep)]",
  // done / dead
  closed: "bg-surface-sunken text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
}

export function StatusPill({ status, className }: { status: string; className?: string }) {
  const { t } = useTranslation()
  const known = status in STYLE
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        known ? STYLE[status] : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {known ? t(`status.${status}`) : status}
    </span>
  )
}
