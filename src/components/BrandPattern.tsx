import { cn } from "@/lib/utils"

/**
 * REHAB's decorative diamond grid, drawn inline so it takes its colour from
 * the parent's `currentColor` — which is what lets the same motif sit white on
 * the navy rail and navy on a light card. The file version
 * (`public/pattern.svg`, wired to `--brand-pattern`) exists for the places
 * that need a CSS background-image instead.
 *
 * Purely decorative — always aria-hidden.
 */
export function BrandPattern({
  className,
  size = 26,
  opacity = 0.05,
}: {
  className?: string
  size?: number
  opacity?: number
}) {
  const id = `bp-${size}`
  return (
    <svg
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 h-full w-full", className)}
      style={{ opacity }}
    >
      <defs>
        <pattern id={id} width={size} height={size} patternUnits="userSpaceOnUse">
          <rect
            x={size / 2 - size / 5}
            y={size / 2 - size / 5}
            width={(size * 2) / 5}
            height={(size * 2) / 5}
            transform={`rotate(45 ${size / 2} ${size / 2})`}
            fill="currentColor"
          />
        </pattern>
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity="1" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id={`${id}-mask`}>
          <rect width="100%" height="100%" fill={`url(#${id}-fade)`} />
        </mask>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} mask={`url(#${id}-mask)`} />
    </svg>
  )
}
