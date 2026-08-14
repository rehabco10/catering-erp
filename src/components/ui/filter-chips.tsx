import { useTranslation } from "react-i18next"

import { cn, arNum } from "@/lib/utils"

/**
 * A single-select chip row for filtering a list — «الكل» plus one chip per
 * bucket, with counts so the filter reads as a summary even before it's used.
 * Null value = no filter (الكل).
 */
export function FilterChips<T extends string>({
  value,
  onChange,
  options,
  allLabel,
  className,
}: {
  value: T | null
  onChange: (v: T | null) => void
  options: { value: T; label: string; count?: number }[]
  allLabel?: string
  className?: string
}) {
  const { t } = useTranslation()
  const all = allLabel ?? t("الكل")
  const chip = (active: boolean, label: React.ReactNode, onClick: () => void, key: string) => (
    <button
      key={key}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
        active
          ? "border-[color:var(--brand-navy)]/50 bg-[color:var(--brand-navy-soft)] text-[color:var(--brand-navy-deep)]"
          : "border-surface-line bg-surface-raised text-muted-foreground hover:bg-surface-sunken",
      )}
    >
      {label}
    </button>
  )
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chip(value === null, all, () => onChange(null), "__all")}
      {options.map((o) =>
        chip(
          value === o.value,
          <>
            {o.label}
            {o.count != null && (
              <span className="tabular-nums opacity-70">{arNum(o.count)}</span>
            )}
          </>,
          () => onChange(value === o.value ? null : o.value),
          o.value,
        ),
      )}
    </div>
  )
}
