import * as React from "react"

/** Hold this long before the press is promoted to "open the menu". */
const HOLD_MS = 480
/** Moving further than this cancels — the user is panning or dragging a node. */
const MOVE_TOLERANCE = 10
/** How long after release we still swallow the tap's synthesized click. */
const SWALLOW_MS = 500

/**
 * Long-press → context menu, for touch and pen.
 *
 * Three deliberate choices, each earned by an event trace on the emulated
 * canvas (scripts/trace-longpress.mjs):
 *
 * **The callback fires on release, not at the hold threshold.** Opening a
 * bottom drawer while the finger is still down slides the menu *under the
 * fingertip*; Base UI then reads that same touch's release as an outside press
 * and dismisses, and the tap's synthesized `click` lands on whatever item is
 * beneath the finger. The trace showed a menu opening and being consumed
 * inside one gesture, invisibly. Deferring to release (the iOS convention)
 * removes the whole class of races.
 *
 * **Only `pointerdown` comes in as a React prop; move/up/cancel are native
 * window-capture listeners installed per-gesture.** The trace showed the
 * release's `pointerup` bubbling to our wrapper but never reaching React's
 * delegation root — something in the canvas stack stops it — so a React
 * `onPointerUp` prop simply never fires. Window capture runs before anything
 * can call `stopPropagation`.
 *
 * **The synthesized click is swallowed.** Even firing on release, the browser
 * still emits `click` a few ms later, which would route back into the canvas
 * (React Flow's `onNodeClick` → the wizard sheet) and stack a second drawer
 * over the menu.
 *
 * Mouse is excluded on purpose: a mouse has a right button, so holding the
 * left one keeps meaning "drag the node".
 */
export function useLongPress(
  onLongPress: (x: number, y: number, target: EventTarget | null) => void,
) {
  const timer = React.useRef<number | null>(null)
  const origin = React.useRef<{ x: number; y: number; target: EventTarget | null } | null>(null)
  /** The hold threshold passed; fire on the release of this gesture. */
  const armed = React.useRef(false)
  const detach = React.useRef<(() => void) | null>(null)

  const cleanup = React.useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current)
      timer.current = null
    }
    origin.current = null
    armed.current = false
    detach.current?.()
    detach.current = null
  }, [])

  React.useEffect(() => cleanup, [cleanup])

  const swallowNextClick = React.useCallback(() => {
    const swallow = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
    }
    window.addEventListener("click", swallow, { capture: true, once: true })
    // If no click materialises, don't leave a live trap for the next tap.
    window.setTimeout(
      () => window.removeEventListener("click", swallow, { capture: true }),
      SWALLOW_MS,
    )
  }, [])

  const onPointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse") return
      cleanup()
      origin.current = { x: e.clientX, y: e.clientY, target: e.target }
      timer.current = window.setTimeout(() => {
        timer.current = null
        armed.current = true
      }, HOLD_MS)

      const pointerId = e.pointerId
      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        const o = origin.current
        if (o && Math.hypot(ev.clientX - o.x, ev.clientY - o.y) > MOVE_TOLERANCE) cleanup()
      }
      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return
        const o = origin.current
        if (armed.current && o) {
          swallowNextClick()
          // Cleanup first: the callback may open UI that inspects press state.
          const { x, y, target } = o
          cleanup()
          onLongPress(x, y, target)
          return
        }
        cleanup()
      }
      const onCancel = (ev: PointerEvent) => {
        if (ev.pointerId === pointerId) cleanup()
      }
      window.addEventListener("pointermove", onMove, { capture: true })
      window.addEventListener("pointerup", onUp, { capture: true })
      window.addEventListener("pointercancel", onCancel, { capture: true })
      detach.current = () => {
        window.removeEventListener("pointermove", onMove, { capture: true })
        window.removeEventListener("pointerup", onUp, { capture: true })
        window.removeEventListener("pointercancel", onCancel, { capture: true })
      }
    },
    [cleanup, onLongPress, swallowNextClick],
  )

  return {
    /** True while a touch/pen press is in progress — used to ignore the
     *  browser-native `contextmenu` Android fires mid-hold, which would open
     *  the menu under the finger through the other door. */
    isTouchActive: () => origin.current !== null,
    handlers: { onPointerDown },
  }
}
