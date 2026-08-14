import { DayPicker, type DayPickerProps } from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { useLocale } from "@/i18n/LocaleProvider"
import { LOCALE_DIR } from "@/i18n/locale"
import { formats } from "@/lib/intl"
import { cn } from "@/lib/utils"

/**
 * shadcn-style Calendar on React DayPicker (the shadcn base date-picker
 * recipe: Popover + Calendar, no DatePicker root primitive).
 *
 * Locale notes: month and weekday names come from date-fns via @/lib/intl
 * (arSA / enUS — date-fns never localises digits, exactly the app's rule),
 * and DayPicker is Gregorian-only, which matches the wizard's supply data.
 * The KSA week runs Sunday–Saturday, so weekStartsOn is pinned rather than
 * inherited from the locale.
 */
export function Calendar({ className, classNames, ...props }: DayPickerProps) {
  const locale = useLocale()
  return (
    <DayPicker
      dir={LOCALE_DIR[locale]}
      locale={formats().dateFns}
      weekStartsOn={0}
      showOutsideDays
      fixedWeeks
      formatters={{
        // arSA's weekday names are full words that collide in a 32px cell —
        // narrow initials (ح ن ث ر خ ج س) fit every grid density.
        formatWeekdayName: (day) => formats().weekdayNarrow.format(day),
      }}
      components={{
        Chevron: ({ orientation, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft className="size-4" {...rest} />
          ) : (
            <ChevronRight className="size-4" {...rest} />
          ),
      }}
      className={cn("select-none", className)}
      classNames={{
        months: "relative flex flex-col",
        month: "w-full",
        month_caption: "flex h-8 items-center justify-center",
        caption_label: "text-[13px] font-bold tabular-nums text-foreground",
        nav: "absolute inset-x-0 top-0 flex h-8 items-center justify-between",
        button_previous:
          "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground",
        button_next:
          "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground",
        weekdays: "mt-1.5 flex",
        weekday: "grid size-8 place-items-center text-[10px] font-semibold text-muted-foreground",
        week: "mt-0.5 flex",
        day: "p-0",
        day_button:
          "grid size-8 place-items-center rounded-md text-[12px] tabular-nums text-foreground transition-colors hover:bg-surface-sunken outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        selected:
          "[&>button]:bg-[color:var(--brand-navy)] [&>button]:font-bold [&>button]:text-white [&>button:hover]:bg-[color:var(--brand-navy)]",
        today: "[&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-[color:var(--brand-navy)]/50",
        outside: "[&>button]:text-muted-foreground/40",
        disabled: "[&>button]:pointer-events-none [&>button]:opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  )
}
