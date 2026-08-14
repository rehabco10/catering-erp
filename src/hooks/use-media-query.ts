import * as React from "react"

/**
 * Side sheet vs bottom drawer.
 *
 * Width alone is the wrong test. A phone in landscape is ~896×414 — under the
 * 1024px bar, so it got the bottom drawer, and an 85dvh drawer on a 414px-tall
 * viewport buries the canvas completely. Vertical space is the scarce axis in
 * landscape, horizontal space is not. So: side sheet whenever the viewport is
 * wide *or* landscape (comma = OR in a media query list); drawer only for
 * narrow portrait, where a bottom sheet is the natural gesture.
 */
export const SIDE_PANEL_QUERY = "(min-width: 1024px), (orientation: landscape)"

/**
 * Canvas overlays (minimap, zoom controls) are only worth their space on a
 * reasonably tall viewport. On a 414px-tall phone in landscape the minimap
 * covered roughly a quarter of the canvas it was meant to help navigate.
 */
export const ROOMY_CANVAS_QUERY = "(min-height: 620px) and (min-width: 700px)"

/**
 * Enough vertical room for a full page header. Below this the header collapses
 * to a single line: on a 414px-tall landscape viewport the two-line version
 * plus padding took 165px — 40% of the screen — before any content appeared.
 */
export const TALL_ENOUGH_QUERY = "(min-height: 560px)"

/**
 * The MasterDetail split point — must match its `lg:` classes. Below this the
 * master IS the page and the detail is a pushed screen, which changes what
 * "selected" should look like: a highlighted row beside no visible detail
 * reads as "this is all there is".
 */
export const MASTER_DETAIL_WIDE_QUERY = "(min-width: 1024px)"

/**
 * Subscribes to a CSS media query.
 *
 * Base UI ships `unstable_useMediaQuery`, but the stable primitive is a few
 * lines of `useSyncExternalStore`, so we keep it local rather than depend on
 * an API still marked unstable.
 */
export function useMediaQuery(query: string) {
  const subscribe = React.useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query)
      list.addEventListener("change", onChange)
      return () => list.removeEventListener("change", onChange)
    },
    [query],
  )

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}
