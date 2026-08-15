/**
 * Canvas layout, kept pure and free of React.
 *
 * A deterministic sideways grid rather than a solver: catalogue root on the
 * start edge, tier sections stacked down, menus flowing across, and the one
 * expanded menu's dishes in a band beside it. Horizontal because the chain
 * *is* a sequence — menu, then what is in it — and screens are wide.
 *
 * Deliberately simpler than the wizard's version it is modelled on. That one
 * wraps columns at seven because a real season carries 39 packages; a menu
 * catalogue is a handful per tier, so wrapping would be machinery with nothing
 * to do.
 */

export interface Pos {
  x: number
  y: number
}

export interface Box {
  w: number
  h: number
}

export interface LayoutTree {
  /** Menus in display order, each with the dishes it should contribute. */
  menus: Array<{ id: string; tier: string; dishIds: string[] }>
  /** Nodes the user has dragged; these override the solver's position. */
  pinned: Record<string, Pos>
}

export interface LayoutSizes {
  root: Box
  tier: Box
  menu: Box
  dish: Box
}

export const ROOT_ID = "root"
/** Fixed display order; unknown tiers append after. */
export const TIER_ORDER = ["premium", "standard", "economy"]
export const tierNodeId = (tier: string) => `tier_${tier}`

const MARGIN = 40
const GAP_Y = 24
const RANK_GAP = 84
const DISH_DROP = 52
const DISH_GAP_Y = 14
const SECTION_GAP = 64

export function computeLayout(tree: LayoutTree, sizes: LayoutSizes): Map<string, Pos> {
  const out = new Map<string, Pos>()
  const place = (id: string, x: number, y: number) => {
    const pin = tree.pinned[id]
    out.set(id, pin ? { x: pin.x, y: pin.y } : { x, y })
  }

  const byTier = new Map<string, LayoutTree["menus"]>()
  for (const menu of tree.menus) {
    const list = byTier.get(menu.tier) ?? []
    list.push(menu)
    byTier.set(menu.tier, list)
  }
  const tiers = [
    ...TIER_ORDER.filter((t) => byTier.has(t)),
    ...[...byTier.keys()].filter((t) => !TIER_ORDER.includes(t)),
  ]

  const sectionH = (count: number) =>
    Math.max(1, count) * sizes.menu.h + Math.max(0, count - 1) * GAP_Y

  const totalH =
    tiers.reduce((t, tier) => t + sectionH(byTier.get(tier)!.length), 0) +
    Math.max(0, tiers.length - 1) * SECTION_GAP

  place(ROOT_ID, MARGIN, MARGIN + Math.max(totalH, sizes.root.h) / 2 - sizes.root.h / 2)

  const tierX = MARGIN + sizes.root.w + RANK_GAP
  const menuX = tierX + sizes.tier.w + RANK_GAP
  const dishX = menuX + sizes.menu.w + DISH_DROP

  let sectionTop = MARGIN
  for (const tier of tiers) {
    const menus = byTier.get(tier)!
    const secH = sectionH(menus.length)
    place(tierNodeId(tier), tierX, sectionTop + secH / 2 - sizes.tier.h / 2)

    // The dish band walks down with a cursor so an expanded menu's dishes can
    // never overlap the menu card below it, however many dishes it holds.
    let cursor = -Infinity
    menus.forEach((menu, i) => {
      const y = sectionTop + i * (sizes.menu.h + GAP_Y)
      place(menu.id, menuX, y)
      if (!menu.dishIds.length) return
      const bandH =
        menu.dishIds.length * sizes.dish.h + (menu.dishIds.length - 1) * DISH_GAP_Y
      const centre = y + sizes.menu.h / 2
      const bandY = Math.max(centre - bandH / 2, cursor + DISH_GAP_Y)
      menu.dishIds.forEach((id, j) => place(id, dishX, bandY + j * (sizes.dish.h + DISH_GAP_Y)))
      cursor = bandY + bandH
    })

    sectionTop += secH + SECTION_GAP
  }

  return out
}

/** A stable key for "has the tree's shape or pinning changed?". */
export function structureKeyOf(tree: LayoutTree): string {
  const shape = tree.menus.map((m) => `${m.id}~${m.tier}:${m.dishIds.join("|")}`).join(";")
  const pins = Object.entries(tree.pinned)
    .map(([k, v]) => `${k}@${v.x},${v.y}`)
    .sort()
    .join(";")
  return `${shape}#${pins}`
}

export interface ReconcilableNode {
  id: string
  position: Pos
  selected?: boolean
  dragging?: boolean
}

/**
 * Merge a freshly derived node list into the one React Flow is holding.
 *
 * The rule: **the solver wins, except during a live drag.** Pinned coordinates
 * are already baked into the layout, so an idle node has no reason to hold a
 * position the layout does not give it. React Flow owns the position only
 * between dragstart and dragstop, which is what `dragging` marks — comparing
 * against that needs no external state and cannot go stale.
 */
export function reconcileNodes<T extends ReconcilableNode>(prev: T[], next: T[]): T[] {
  const prevById = new Map(prev.map((n) => [n.id, n]))
  return next.map((n) => {
    const old = prevById.get(n.id)
    if (!old) return { ...n, selected: false }
    return {
      ...n,
      position: old.dragging ? old.position : n.position,
      // React Flow owns the selection flag; our ring comes from `data.selected`.
      selected: old.selected ?? false,
      dragging: old.dragging,
    }
  })
}

/** Bounding box of every node, padded — the pannable world. */
export function worldExtent(
  nodes: Array<{ id: string; position: Pos }>,
  boxOf: (id: string) => Box,
  pad: number,
): [[number, number], [number, number]] {
  if (nodes.length === 0) {
    return [
      [-pad, -pad],
      [pad, pad],
    ]
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const n of nodes) {
    const b = boxOf(n.id)
    minX = Math.min(minX, n.position.x)
    minY = Math.min(minY, n.position.y)
    maxX = Math.max(maxX, n.position.x + b.w)
    maxY = Math.max(maxY, n.position.y + b.h)
  }
  return [
    [minX - pad, minY - pad],
    [maxX + pad, maxY + pad],
  ]
}
