import * as React from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet"
import { useLocale } from "@/i18n/LocaleProvider"
import { LOCALE_DIR } from "@/i18n/locale"
import { SIDE_PANEL_QUERY, useMediaQuery } from "@/hooks/use-media-query"
import { cn } from "@/lib/utils"

/**
 * One panel, two hosts: a side Sheet when there is horizontal room, and Base
 * UI's real swipeable Drawer in narrow portrait.
 *
 * This used to be a hand-rolled Dialog with a plain opacity/transform
 * transition, which is why it felt sluggish next to the other apps: the real
 * Drawer tracks the pointer during a swipe, scales its close duration by swipe
 * velocity, and handles snap points and nested stacking. None of that is
 * reproducible with a CSS transition on `data-ending-style`.
 */

/**
 * Both layouts render the same body, but the heading elements have to come from
 * whichever primitive is hosting it — Base UI wires Title/Description to its own
 * popup for labelling, so a Drawer title inside a Sheet would not register.
 */
interface PanelParts {
  Title: React.ComponentType<{ className?: string; children: React.ReactNode }>
  Description: React.ComponentType<{ className?: string; children: React.ReactNode }>
  Close: React.ComponentType<{ render?: React.ReactElement; children?: React.ReactNode }>
}

const DRAWER_PARTS: PanelParts = {
  Title: DrawerTitle,
  Description: DrawerDescription,
  Close: DrawerClose,
}
const SHEET_PARTS: PanelParts = {
  Title: SheetTitle,
  Description: SheetDescription,
  Close: SheetClose,
}

export function ResponsivePanel({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  const isSide = useMediaQuery(SIDE_PANEL_QUERY)
  const dir = LOCALE_DIR[useLocale()]

  const body = (parts: PanelParts) => (
    <>
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <parts.Title className="text-sm font-bold text-foreground">{title}</parts.Title>
          {description && (
            <parts.Description className="mt-0.5 text-[11px] text-muted-foreground">
              {description}
            </parts.Description>
          )}
        </div>
        <parts.Close render={<Button variant="ghost" size="icon-sm" aria-label="إغلاق" />}>
          <X className="size-4" />
        </parts.Close>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>

      {footer && <div className="shrink-0 border-t border-border px-4 py-3">{footer}</div>}
    </>
  )

  // Wide or landscape: a side sheet OPPOSITE the nav rail, so the two never
  // crowd the same edge. `side` is physical, so it flips with the locale:
  // the rail sits on the start edge (right in Arabic, left in English), and
  // the sheet takes the other one.
  if (isSide) {
    return (
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        // Non-modal so the canvas stays live and pannable beside the panel.
        modal={false}
        // The panel opens on a node click, and selection resolves on pointer-up
        // — the trailing click would otherwise land outside and close it again.
        disablePointerDismissal
      >
        <SheetContent
          side={dir === "rtl" ? "left" : "right"}
          showOverlay={false}
          showCloseButton={false}
          // Focus belongs on the canvas the user is driving.
          initialFocus={false}
          className={cn("flex w-[min(30rem,55vw)] flex-col border-e border-border bg-popover shadow-[var(--elev-3)] sm:max-w-none")}
        >
          {body(SHEET_PARTS)}
        </SheetContent>
      </Sheet>
    )
  }

  // Narrow portrait: the swipeable bottom drawer.
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
      disablePointerDismissal
      showSwipeHandle
      swipeDirection="down"
    >
      <DrawerContent initialFocus={false} className="bg-popover">
        {body(DRAWER_PARTS)}
      </DrawerContent>
    </Drawer>
  )
}
