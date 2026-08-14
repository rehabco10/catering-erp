import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { formats } from "@/lib/intl"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Numbers, in whichever locale is active — the formats themselves (and the
 * Latin-digits rule that survives in Arabic) live in `@/lib/intl`.
 *
 * The name stays `arNum` on purpose: it is called from ~40 places, and the
 * rename would be the only churn in an otherwise behaviour-free change.
 */
export const arNum = (n: number) => formats().number.format(n)
export const sar = (n: number) => formats().money.format(n)
