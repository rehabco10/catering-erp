import * as React from "react"
import { format } from "date-fns"
import { CalendarDays } from "lucide-react"

import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { formats } from "@/lib/intl"
import { cn } from "@/lib/utils"

/**
 * The app's date control — the shadcn base date-picker recipe (Popover +
 * Calendar, no DatePicker root primitive) with an ISO-string API so call
 * sites stay in the store's `yyyy-MM-dd` currency.
 *
 * Replaces every native `<input type="date">`: the native control renders its
 * value in the *browser* locale (MM/DD/YYYY on most machines — «05/12/2026»
 * reads as 5 ديسمبر but means May 12), and its popup ignores the app's RTL
 * and typography entirely. Enforced by ast-grep `no-native-date-input`.
 *
 * Formatting follows the active locale (@/lib/intl), which pins the Gregorian
 * calendar and Latin digits for Arabic — plain "ar-SA" would format dates in
 * the Islamic calendar while all the supply data is Gregorian.
 */

/** Local-midnight parse — `new Date("yyyy-MM-dd")` alone would be UTC. */
const fromIso = (iso: string) => new Date(`${iso}T00:00:00`)

export function DatePicker({
  value,
  onChange,
  placeholder = "اختر التاريخ",
  className,
  disabled,
  id,
}: {
  /** ISO `yyyy-MM-dd`, or empty/undefined for none. */
  value?: string
  onChange: (iso: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  id?: string
}) {
  const selected = value ? fromIso(value) : undefined
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        className={cn(
          "flex h-8 w-full min-w-0 items-center justify-between gap-1.5 rounded-lg border border-input bg-card px-2.5 py-1 text-sm transition-colors outline-none select-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          !selected && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate tabular-nums">
          {selected ? formats().date.format(selected) : placeholder}
        </span>
        <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" dir="rtl">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(day) => {
            if (!day) return
            onChange(format(day, "yyyy-MM-dd"))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
