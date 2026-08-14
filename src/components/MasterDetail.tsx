import { useTranslation } from "react-i18next"
import * as React from "react"
import { ArrowRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The inventory pages' split view, chat-app style: the page never scrolls —
 * the master column and the detail column each scroll independently, so the
 * hotel list stays under your hand while a 7-contract detail runs long.
 * Host pages must give this a bounded height (flex-1 min-h-0 chain from the
 * route shell); on narrow screens the master IS the page and selecting pushes
 * the detail with a back button — CSS-only, no breakpoint hook.
 *
 * Selection itself lives in the URL (the pages navigate on select), which is
 * what lets validation issues deep-link straight to an entity.
 */
export function MasterDetail({
  master,
  detail,
  detailOpen,
  onBack,
  placeholder,
}: {
  master: React.ReactNode
  detail: React.ReactNode
  /** Whether an entity is selected — drives the narrow-screen push. */
  detailOpen: boolean
  /** Narrow-screen back action; navigate to the bare route. */
  onBack: () => void
  /** Wide-screen filler while nothing is selected. */
  placeholder: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div className="flex h-full min-h-0 items-stretch gap-4">
      <aside
        className={cn(
          "min-h-0 w-full shrink-0 overflow-y-auto overscroll-contain lg:block lg:w-[21rem]",
          detailOpen && "hidden",
        )}
      >
        {/* px-1: a scroll container clips on BOTH axes, so without breathing
            room the cards' shadows and selection rings get shaved off at the
            pane edges. */}
        <div className="space-y-4 px-1 pb-6">{master}</div>
      </aside>
      <section
        className={cn("min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain lg:block", !detailOpen && "hidden")}
      >
        {/* Wide screens show whatever detail the page supplies — pages may
            default to their biggest entity so the pane is never an empty
            placeholder. The narrow-screen push still follows detailOpen,
            i.e. an explicit selection in the URL. */}
        {detail ? (
          <div className="space-y-4 px-1 pb-8">
            {detailOpen && (
              // A real button, not a text link: it is the only way back on a
              // phone, so it earns a visible surface and a 40px target.
              <Button variant="outline" className="h-10 px-4 lg:hidden" onClick={onBack}>
                <ArrowRight className="size-4" />
                {t("رجوع")}
              </Button>
            )}
            {detail}
          </div>
        ) : (
          <div className="hidden h-full items-center justify-center rounded-xl border border-dashed border-surface-line text-[13px] text-muted-foreground lg:flex">
            {placeholder}
          </div>
        )}
      </section>
    </div>
  )
}
