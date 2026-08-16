/**
 * Canvas layout, kept pure and free of React.
 *
 * A deterministic sideways grid rather than a solver: catalogue root on the
 * start edge, group sections stacked down, then packages, then the sections of
 * the open package, then the dishes of the open section. Horizontal because the
 * chain *is* a sequence, and screens are wide.
 *
 * Five ranks, and the last two are why. A transcribed buffet package carries up
 * to 81 dishes; hanging those off the package directly put 81 cards on the
 * canvas at once, which is not a graph, it is a wall. The course rank collapses
 * that to five section cards, and only one section's dishes are drawn — so the
 * widest the tree ever gets is one package's biggest section.
 *
 * The module knows no domain vocabulary: groups and courses are opaque strings
 * ordered by the caller. It used to carry a hardcoded tier order, which meant a
 * pure geometry module had an opinion about the catalogue.
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
  menus: Array<{
    id: string
    group: string
    /** Section nodes to draw for this menu — empty unless it is the open one. */
    courses: Array<{ id: string; dishIds: string[] }>
  }>
  /** Nodes the user has dragged; these override the solver's position. */
  pinned: Record<string, Pos>
}

export interface LayoutSizes {
  root: Box
  group: Box
  menu: Box
  course: Box
  dish: Box
}

export const ROOT_ID = "root"
export const groupNodeId = (group: string) => `group_${group}`

const MARGIN = 40
const GAP_Y = 24
const RANK_GAP = 84
const BRANCH_GAP = 52
const BAND_GAP_Y = 14
const SECTION_GAP = 64
/** Dish chips are small and there can be 28 of them; they get their own gap. */
const DISH_GAP_Y = 8
/**
 * Dishes per column before wrapping.
 *
 * A 28-dish section in one column is a 1,300px drop that has to be panned; in
 * columns of twelve it is three short stacks the eye takes in at once. The
 * chips are narrow enough that the extra width costs less than the height did.
 */
const DISH_WRAP_AT = 12

export function computeLayout(tree: LayoutTree, sizes: LayoutSizes): Map<string, Pos> {
  const out = new Map<string, Pos>()
  const place = (id: string, x: number, y: number) => {
    const pin = tree.pinned[id]
    out.set(id, pin ? { x: pin.x, y: pin.y } : { x, y })
  }

  // Sections come out in the order the caller listed the menus.
  const byGroup = new Map<string, LayoutTree["menus"]>()
  for (const menu of tree.menus) {
    const list = byGroup.get(menu.group) ?? []
    list.push(menu)
    byGroup.set(menu.group, list)
  }
  const groups = [...byGroup.keys()]

  const sectionH = (count: number) =>
    Math.max(1, count) * sizes.menu.h + Math.max(0, count - 1) * GAP_Y

  const totalH =
    groups.reduce((t, g) => t + sectionH(byGroup.get(g)!.length), 0) +
    Math.max(0, groups.length - 1) * SECTION_GAP

  place(ROOT_ID, MARGIN, MARGIN + Math.max(totalH, sizes.root.h) / 2 - sizes.root.h / 2)

  const groupX = MARGIN + sizes.root.w + RANK_GAP
  const menuX = groupX + sizes.group.w + RANK_GAP
  const courseX = menuX + sizes.menu.w + BRANCH_GAP
  const dishX = courseX + sizes.course.w + BRANCH_GAP

  /** Stack `ids` in a vertical band centred on `centre`, never above `floor`. */
  const band = (ids: string[], x: number, box: Box, centre: number, floor: number) => {
    if (!ids.length) return floor
    const h = ids.length * box.h + (ids.length - 1) * BAND_GAP_Y
    const top = Math.max(centre - h / 2, floor + BAND_GAP_Y)
    ids.forEach((id, i) => place(id, x, top + i * (box.h + BAND_GAP_Y)))
    return top + h
  }

  /** Same, but wrapping into columns — for the one band that gets long. */
  const wrapped = (ids: string[], x: number, box: Box, centre: number, floor: number) => {
    if (!ids.length) return floor
    const rows = Math.min(DISH_WRAP_AT, ids.length)
    const h = rows * box.h + (rows - 1) * DISH_GAP_Y
    const top = Math.max(centre - h / 2, floor + BAND_GAP_Y)
    ids.forEach((id, i) => {
      const col = Math.floor(i / DISH_WRAP_AT)
      const row = i % DISH_WRAP_AT
      place(id, x + col * (box.w + 16), top + row * (box.h + DISH_GAP_Y))
    })
    return top + h
  }

  let sectionTop = MARGIN
  for (const group of groups) {
    const menus = byGroup.get(group)!
    const secH = sectionH(menus.length)
    place(groupNodeId(group), groupX, sectionTop + secH / 2 - sizes.group.h / 2)

    // Cursors walk down so an expanded branch can never overlap the card below
    // it, however many sections or dishes it holds.
    let courseCursor = -Infinity
    let dishCursor = -Infinity

    menus.forEach((menu, i) => {
      const y = sectionTop + i * (sizes.menu.h + GAP_Y)
      place(menu.id, menuX, y)
      if (!menu.courses.length) return

      const centre = y + sizes.menu.h / 2
      courseCursor = band(
        menu.courses.map((c) => c.id),
        courseX,
        sizes.course,
        centre,
        courseCursor,
      )

      // Only one section is ever open, so at most one dish band is drawn.
      for (const course of menu.courses) {
        if (!course.dishIds.length) continue
        const at = out.get(course.id)
        if (!at) continue
        dishCursor = wrapped(
          course.dishIds,
          dishX,
          sizes.dish,
          at.y + sizes.course.h / 2,
          dishCursor,
        )
      }
    })

    sectionTop += secH + SECTION_GAP
  }

  return out
}

/** A stable key for "has the tree's shape or pinning changed?". */
export function structureKeyOf(tree: LayoutTree): string {
  const shape = tree.menus
    .map((m) => `${m.id}~${m.group}:${m.courses.map((c) => `${c.id}[${c.dishIds.join(",")}]`).join("|")}`)
    .join(";")
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
