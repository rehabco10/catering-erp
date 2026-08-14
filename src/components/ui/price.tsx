import { useTranslation } from "react-i18next"
import * as React from "react"
import { useSnapshot } from "valtio"

import { state, togglePrices } from "@/store/ops"
import { NumInput } from "@/components/ui/field"
import { cn } from "@/lib/utils"

/**
 * Spoiler-mode prices. The wizard is routinely projected in meetings with the
 * very hotels and providers being negotiated with, so every price renders
 * masked until deliberately revealed. The flag is global on purpose — one
 * click reveals all prices, one click hides them all, so the presenter always
 * knows which state the whole screen is in. Clicking any mask is the toggle.
 */

export function Price({
  value,
  className,
  interactive = true,
}: {
  /** Already-formatted display string, e.g. «42,427 ر.س». */
  value: string
  className?: string
  /**
   * Pass false when the mask sits inside another interactive element (a
   * clickable master row) — <button> may not nest in <button>, so the mask
   * renders as a plain span there and reveal happens elsewhere.
   */
  interactive?: boolean
}) {
  const { t } = useTranslation()
  const snap = useSnapshot(state)
  if (snap.showPrices) return <span className={className}>{value}</span>
  const maskCls = cn(
    "select-none rounded bg-foreground/10 px-1.5 tracking-widest text-foreground/40",
    className,
  )
  if (!interactive) {
    return (
      <span title={t("سعر مخفي")} className={maskCls}>
        ••••
      </span>
    )
  }
  return (
    <button
      type="button"
      title={t("سعر محجوب — النقر يُظهره")}
      aria-label={t("سعر محجوب — النقر يُظهره")}
      onClick={(e) => {
        e.stopPropagation()
        togglePrices()
      }}
      className={cn("nodrag nopan cursor-pointer transition-colors hover:bg-foreground/15", maskCls)}
    >
      ••••
    </button>
  )
}

/** A price input that stays masked until prices are revealed. */
export function MaskedPriceInput(props: React.ComponentProps<typeof NumInput>) {
  const { t } = useTranslation()
  const snap = useSnapshot(state)
  if (snap.showPrices) return <NumInput {...props} />
  return (
    <button
      type="button"
      title={t("سعر محجوب — النقر يُظهره")}
      onClick={togglePrices}
      className={cn(
        "flex h-9 w-full cursor-pointer select-none items-center rounded-md border border-input bg-muted/50 px-3 text-[12px] tracking-widest text-muted-foreground transition-colors hover:bg-muted",
        props.className,
      )}
    >
      ••••
    </button>
  )
}
