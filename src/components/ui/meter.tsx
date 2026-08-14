import { cn, arNum } from "@/lib/utils"

/**
 * A small utilization bar: value against max, colored by how close the ratio
 * runs — teal while comfortable, gold when tight (≥85%), rose when over.
 * The inventory pages lead with these, so coverage is readable at row level
 * without opening anything.
 */
export function Meter({
  value,
  max,
  label,
  bound = "max",
  className,
}: {
  value: number
  max: number
  /** Rendered before the bar, e.g. «وصول». Omit for a bare bar. */
  label?: string
  /**
   * What `max` means. `"max"` = a ceiling (over it is bad — rose);
   * `"min"` = a floor (meeting it is the goal — under it is bad).
   */
  bound?: "max" | "min"
  className?: string
}) {
  const ratio = max > 0 ? value / max : 0
  const tone =
    bound === "min"
      ? ratio >= 1
        ? "bg-[color:var(--brand-green)]"
        : ratio >= 0.85
          ? "bg-[color:var(--brand-amber)]"
          : "bg-[color:var(--brand-ruby)]"
      : ratio > 1
        ? "bg-[color:var(--brand-ruby)]"
        : ratio >= 0.85
          ? "bg-[color:var(--brand-amber)]"
          : "bg-[color:var(--brand-navy)]"
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      {label && <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>}
      <div className="h-1.5 min-w-10 flex-1 overflow-hidden rounded-full bg-surface-sunken">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", tone)}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </div>
      {/* dir=ltr pins the order — RTL bidi otherwise renders "180 / 70" as
          "70 / 180" and the reader can't tell value from ceiling. */}
      <span
        dir="ltr"
        className={cn(
          "shrink-0 text-[11px] font-semibold tabular-nums",
          (bound === "min" ? ratio < 1 : ratio > 1)
            ? "text-[color:var(--brand-ruby-deep)]"
            : "text-foreground/80",
        )}
      >
        {arNum(value)}
        <span className="font-normal text-muted-foreground"> / {arNum(max)}</span>
      </span>
    </div>
  )
}
