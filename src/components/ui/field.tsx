import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Field wrappers, built on the shared Base UI primitives (`input.tsx`,
 * `textarea.tsx`, `select.tsx`, `select-field.tsx`) copied from the contracting
 * app so this project's forms look and behave like the others.
 *
 * The one thing layered on top is digit handling — see `NumInput`.
 */

/**
 * Dense-table variant. Applied to the shared `Input` / `SelectField`, not to a
 * raw element — it strips the resting border so a table of eleven rows doesn't
 * read as a wall of boxes, and hands it back on hover/focus.
 */
export const cellCls =
  "h-7 border-transparent bg-transparent px-2 text-sm shadow-none " +
  "hover:border-input hover:bg-background focus-visible:bg-background"

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string
  hint?: string
  error?: string
  htmlFor?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("block", className)}>
      <Label htmlFor={htmlFor} className="text-[11px] font-semibold text-foreground/70">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
      {error ? (
        <span className="mt-1 block text-[10px] font-medium text-[color:var(--brand-ruby-deep)]">
          {error}
        </span>
      ) : (
        hint && (
          <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
            {hint}
          </span>
        )
      )}
    </div>
  )
}

/** Arabic-Indic and Eastern Arabic-Indic digits → Latin. */
const DIGIT_MAP: Record<string, string> = {}
for (let i = 0; i < 10; i++) {
  DIGIT_MAP[String.fromCharCode(0x0660 + i)] = String(i) // ٠-٩
  DIGIT_MAP[String.fromCharCode(0x06f0 + i)] = String(i) // ۰-۹
}
export const toLatinDigits = (s: string) => s.replace(/[٠-٩۰-۹]/g, (d) => DIGIT_MAP[d])

/**
 * Numeric input that always *shows* Latin digits.
 *
 * `type="number"` will not do: Chrome renders its value in the digits of the
 * **browser** locale, so under an Arabic UI it shows ٤٠ regardless of the
 * element's `lang`. A text input with `inputMode="decimal"` keeps the numeric
 * keypad on mobile while leaving the rendered string entirely ours. Pasted
 * Arabic-Indic digits are normalised inbound, so both forms still work.
 *
 * Spreading `register("field")` onto this works: it forwards `name`, `ref`,
 * `onBlur` and calls the registered `onChange` with the sanitised value.
 */
export const NumInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<typeof Input>, "type" | "inputMode">
>(function NumInput({ className, onChange, ...props }, ref) {
  return (
    <Input
      ref={ref}
      type="text"
      lang="en"
      inputMode="decimal"
      autoComplete="off"
      dir="ltr"
      className={cn("text-start tabular-nums", className)}
      onChange={(e) => {
        const cleaned = toLatinDigits(e.target.value).replace(/[^\d.\-]/g, "")
        if (cleaned !== e.target.value) e.target.value = cleaned
        onChange?.(e)
      }}
      {...props}
    />
  )
})

export { Input, Label }
export { Checkbox } from "@/components/ui/checkbox"
export { SelectField, type SelectOption } from "@/components/ui/select-field"
