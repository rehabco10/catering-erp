import * as React from "react"
import { useTranslation } from "react-i18next"
import { Check } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ResponsivePanel } from "@/components/ui/responsive-panel"
import { cn, arNum } from "@/lib/utils"

/**
 * A small multi-step form base: numbered steps, a validity gate on «التالي»,
 * and a finish action on the last step. Hosted in `ResponsivePanel`, so it is
 * a side sheet on wide screens and a swipeable drawer on narrow ones — the
 * same shell as the canvas wizard, which is what makes it read as one family.
 *
 * The steps carry their content as plain ReactNode and their own `valid` flag;
 * the caller owns the draft being edited. This base only owns *where the user
 * is*, so any "add X" flow can reuse it without inheriting form state.
 */

export interface WizardStep {
  id: string
  title: string
  /** Gates «التالي» (and finish on the last step). Omit for always-passable. */
  valid?: boolean
  content: React.ReactNode
}

export function FormWizard({
  open,
  onOpenChange,
  title,
  description,
  steps,
  onFinish,
  finishLabel,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  steps: WizardStep[]
  /** Called on the last step's confirm; the panel closes afterwards. */
  onFinish: () => void
  /** Defaults to the shared «إضافة» label. */
  finishLabel?: string
}) {
  const { t } = useTranslation()
  const [idx, setIdx] = React.useState(0)

  // Each opening is a fresh add — never resume a half-finished previous one.
  React.useEffect(() => {
    if (open) setIdx(0)
  }, [open])

  const at = Math.min(idx, steps.length - 1)
  const step = steps[at]
  const last = at === steps.length - 1
  const passable = step?.valid !== false

  return (
    <ResponsivePanel
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={at === 0} onClick={() => setIdx(at - 1)}>
            {t("action.prev")}
          </Button>
          <span className="flex-1 text-center text-[10px] tabular-nums text-muted-foreground">
            {arNum(at + 1)} / {arNum(steps.length)}
          </span>
          <Button
            size="sm"
            disabled={!passable}
            onClick={() => {
              if (!last) return setIdx(at + 1)
              onFinish()
              onOpenChange(false)
            }}
          >
            {last ? (finishLabel ?? t("action.finish")) : t("action.next")}
          </Button>
        </div>
      }
    >
      <div className="p-4">
        <ol className="flex items-center gap-1.5">
          {steps.map((s, i) => {
            const done = i < at
            const current = i === at
            return (
              <li key={s.id} className={cn("flex items-center gap-1.5", i > 0 && "flex-1")}>
                {i > 0 && <span aria-hidden className="h-px flex-1 bg-surface-line" />}
                {/* Backtracking is free; jumping forward still goes through the gates. */}
                <button
                  type="button"
                  disabled={!done && !current}
                  onClick={() => setIdx(i)}
                  aria-current={current ? "step" : undefined}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full py-0.5 pe-2 ps-0.5 transition-colors",
                    done && "text-[color:var(--brand-navy-deep)] hover:bg-surface-sunken",
                    current && "text-foreground",
                    !done && !current && "text-muted-foreground/60",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-full text-[10px] font-bold tabular-nums",
                      done && "bg-[color:var(--brand-navy-soft)]",
                      current && "bg-[color:var(--brand-navy-deep)] text-white",
                      !done && !current && "bg-surface-sunken",
                    )}
                  >
                    {done ? <Check className="size-3" /> : arNum(i + 1)}
                  </span>
                  <span className={cn("text-[11px]", current && "font-semibold")}>{s.title}</span>
                </button>
              </li>
            )
          })}
        </ol>

        <div className="mt-4 space-y-3">{step?.content}</div>
      </div>
    </ResponsivePanel>
  )
}
