import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { SIDE_PANEL_QUERY, TALL_ENOUGH_QUERY, useMediaQuery } from "@/hooks/use-media-query"

/**
 * Page chrome for the routed pages.
 *
 * One structure everywhere: a branded header band, then a centred column of
 * `Card` sections on the tinted page surface. The canvas route opts out — it
 * needs the full viewport with no scroll container of its own.
 */
export function PageShell({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-page">
      <PageHeader title={title} description={description} actions={actions} />
      <div className={cn("min-h-0 flex-1 overflow-y-auto", className)}>
        {/* Start-aligned, not centred: the rail lives on the start edge, so a
            centred column left a gap against it and pushed the content adrift
            in the middle of the viewport. `me-auto` takes up the slack on the
            far side instead. */}
        <div className="space-y-4 px-4 py-5">{children}</div>
      </div>
    </div>
  )
}

/**
 * The header band. The identity's geometric motif sits behind it at very low
 * opacity, fading out toward the content — enough to make the chrome feel like
 * Ithraa's rather than a generic admin template, not enough to read as texture
 * competing with the text.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  const tall = useMediaQuery(TALL_ENOUGH_QUERY)
  // When the burger bar is showing (narrow portrait), it already carries the
  // section title — repeating it here as a big h1 + description cost ~180px of
  // an 844px phone before any content. Keep the h1 for the accessibility tree,
  // collapse the band to one truncated description line + the actions.
  const barAbove = !useMediaQuery(SIDE_PANEL_QUERY)
  const full = tall && !barAbove
  return (
    <header className="relative shrink-0 overflow-hidden border-b border-surface-line bg-surface-raised">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.045]"
        style={{
          backgroundImage: "var(--brand-pattern)",
          backgroundSize: "420px",
          maskImage: "linear-gradient(to bottom, black, transparent)",
        }}
      />
      {/* A hairline of brand colour along the top edge ties every page to the rail. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-0.5"
        style={{
          background:
            "linear-gradient(to left, var(--brand-navy), var(--brand-green) 45%, var(--brand-amber))",
        }}
      />
      {/* Actions sit immediately after the title, never pushed to the far end.
       *
       * `justify-between` looked right on paper but the header row is a
       * right-aligned `max-w-4xl` column, so "the far end" is wherever that
       * column happens to stop — mid-screen on a wide display. The button ended
       * up hundreds of pixels from the title it belongs to, floating in space
       * with no edge to anchor against. Keeping it adjacent reads as "this
       * action belongs to this page" at every width. */}
      <div
        className={cn(
          "relative flex items-center gap-4 px-4",
          full ? "py-3.5" : "py-2",
        )}
      >
        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              "font-bold text-foreground",
              barAbove ? "sr-only" : full ? "text-lg tracking-tight" : "text-sm",
            )}
          >
            {title}
          </h1>
          {description && (full || barAbove) && (
            <p
              className={cn(
                "text-muted-foreground",
                barAbove ? "truncate text-[11px]" : "mt-0.5 text-xs leading-relaxed",
              )}
            >
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

/** A raised section on the page surface. */
export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-surface-line bg-surface-raised shadow-[var(--elev-1)]",
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-surface-line px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-[13px] font-bold text-foreground">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  )
}

/**
 * A collapsed section on the page surface.
 *
 * For the material that is worth keeping but not worth carrying: a recipe's
 * exploded raw requirement matters when a sub-recipe is involved or someone is
 * checking what gets bought, and is noise the rest of the time. Rendering it as
 * a second always-open table beside the one being edited is what made the old
 * page hard to read — two views of the same data, side by side, to reconcile.
 */
export function Disclosure({
  title,
  count,
  children,
  defaultOpen = false,
  className,
}: {
  title: string
  /** Rendered as a chip after the title. Omit for none. */
  count?: string
  children: React.ReactNode
  defaultOpen?: boolean
  className?: string
}) {
  return (
    <details
      open={defaultOpen}
      className={cn(
        "group overflow-hidden rounded-xl border border-surface-line bg-surface-raised shadow-[var(--elev-1)]",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-[12px] font-bold hover:bg-surface-sunken">
        <ChevronDown
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {count != null && (
          <span className="shrink-0 rounded-full bg-surface-sunken px-2 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
            {count}
          </span>
        )}
      </summary>
      <div className="border-t border-surface-line">{children}</div>
    </details>
  )
}

/** A short explanatory strip. Used for the "why this page exists" line. */
export function Note({
  children,
  tone = "neutral",
  icon,
}: {
  children: React.ReactNode
  tone?: "neutral" | "brand" | "warn"
  icon?: React.ReactNode
}) {
  return (
    <p
      className={cn(
        "flex gap-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed",
        tone === "neutral" && "bg-surface-sunken text-muted-foreground",
        tone === "brand" &&
          "bg-[color:var(--brand-navy-soft)] text-[color:var(--brand-navy-deep)]",
        tone === "warn" &&
          "bg-[color:var(--brand-amber-soft)] text-[color:var(--brand-amber-deep)]",
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/** A number + label tile, for the stat rows at the top of a page. */
export function Stat({
  value,
  label,
  tone = "neutral",
}: {
  value: string
  label: string
  tone?: "neutral" | "good" | "warn" | "bad"
}) {
  return (
    <div
      className={cn(
        "rounded-lg px-3 py-2.5",
        tone === "neutral" && "bg-surface-sunken",
        tone === "good" && "bg-[color:var(--brand-green-soft)]",
        tone === "warn" && "bg-[color:var(--brand-amber-soft)]",
        tone === "bad" && "bg-[color:var(--brand-ruby-soft)]",
      )}
    >
      <div
        className={cn(
          "text-xl font-bold tabular-nums",
          tone === "neutral" && "text-foreground",
          tone === "good" && "text-[color:var(--brand-green-deep)]",
          tone === "warn" && "text-[color:var(--brand-amber-deep)]",
          tone === "bad" && "text-[color:var(--brand-ruby-deep)]",
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          "mt-0.5 text-[10px]",
          tone === "neutral" && "text-muted-foreground",
          tone === "good" && "text-[color:var(--brand-green-deep)]",
          tone === "warn" && "text-[color:var(--brand-amber-deep)]",
          tone === "bad" && "text-[color:var(--brand-ruby-deep)]",
        )}
      >
        {label}
      </div>
    </div>
  )
}
