import { useCallback, useEffect, useMemo, useRef } from "react"
import { useTranslation } from "react-i18next"
import {
  Background,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type CoordinateExtent,
  type Edge,
  type Node,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useSnapshot } from "valtio"
import { LayoutGrid, PinOff, Plus } from "lucide-react"

import { useLocale } from "@/i18n/LocaleProvider"
import { LOCALE_DIR } from "@/i18n/locale"
import { ROOMY_CANVAS_QUERY, useMediaQuery } from "@/hooks/use-media-query"
import { menuCost, recipeCost } from "@/engine/costing"
import { pickName } from "@/lib/display"
import { cn } from "@/lib/utils"
import {
  addMenu,
  pinNode,
  select,
  state,
  toggleExpandedMenu,
  unpinAll,
  unpinNode,
} from "@/store/ops"
import { useCatalog, useIssues } from "@/store/use-issues"
import {
  computeLayout,
  reconcileNodes,
  structureKeyOf,
  tierNodeId,
  worldExtent,
  TIER_ORDER,
  type LayoutSizes,
  type LayoutTree,
} from "./layout"
import {
  DISH_H,
  DISH_W,
  MENU_H,
  MENU_W,
  ROOT_H,
  ROOT_W,
  TIER_H,
  TIER_TINT,
  TIER_W,
  nodeTypes,
  type CatalogueData,
  type DishData,
  type MenuNodeData,
  type TierData,
  type Tint,
} from "./nodes"

/**
 * The menu catalogue as a tree: catalogue → tier → menu → dish.
 *
 * Why a canvas at all, when the form says the same thing: a menu's cost is a
 * *composition*, and the question people actually bring to it — "which dish is
 * eating the margin, and does anything else use it" — is a question about
 * shape. A table answers it by making you read and divide; a tree answers it
 * by making the expensive branch wider.
 *
 * Modelled directly on the package wizard's canvas so the two products' graphs
 * are one idea: same accordion, same pin-on-drag, same bounded world, same
 * "the solver wins except during a drag" reconciliation.
 *
 * Ingredients are deliberately not a fifth rank. That level belongs to the
 * recipe page, and putting it here would double the node count to say
 * something the costing card already says better.
 */

/** Pointer travel under this many px still counts as a tap, not a drag. */
const TAP_SLOP = 5
/** How much empty space to leave around the graph when bounding the pan. */
const WORLD_PAD = 400

const SIZES: LayoutSizes = {
  root: { w: ROOT_W, h: ROOT_H },
  tier: { w: TIER_W, h: TIER_H },
  menu: { w: MENU_W, h: MENU_H },
  dish: { w: DISH_W, h: DISH_H },
}

const boxOf = (id: string) =>
  id === "root"
    ? SIZES.root
    : id.startsWith("tier_")
      ? SIZES.tier
      : id.startsWith("dish_")
        ? SIZES.dish
        : SIZES.menu

/** Dish node ids are synthetic — a menu item has an id, but it is not unique-safe across menus. */
const dishNodeId = (menuId: string, itemId: string) => `dish_${menuId}_${itemId}`

type AnyData = CatalogueData | TierData | MenuNodeData | DishData

const tintVar = (t: Tint) => `var(--brand-${t})`

interface Props {
  /** Fired when the user picks a menu — the host opens the form for it. */
  onMenuActivated?: (menuId: string) => void
  /** Fired by a menu card's (+) — the host opens the dish picker. */
  onAddDish?: (menuId: string) => void
}

function MenuGraphInner({ onMenuActivated, onAddDish }: Props) {
  const { t } = useTranslation()
  const locale = useLocale()
  const snap = useSnapshot(state)
  const catalog = useCatalog()
  const flow = useReactFlow()
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  // Overlays only earn their space on a tall enough canvas.
  const roomy = useMediaQuery(ROOMY_CANVAS_QUERY)

  // Shared with the rail badge and the checks page — one computation.
  const issues = useIssues()
  const errorCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of issues) {
      if (i.level !== "error") continue
      m.set(i.entityId, (m.get(i.entityId) ?? 0) + 1)
    }
    return m
  }, [issues])

  /* ── build + lay out ─────────────────────────────────────────── */

  /**
   * Layout runs on *structure* only — which menus exist and which dishes the
   * open one contributes. Hover and selection must never reach the solver:
   * routing them through this memo would rebuild every node and re-run the
   * layout on each mouse-over, which reads as a flicker across the canvas.
   */
  const tree: LayoutTree = useMemo(
    () => ({
      menus: state.menus.map((m) => ({
        id: m.id,
        tier: m.tier,
        dishIds:
          m.id === state.expandedMenuId ? m.items.map((i) => dishNodeId(m.id, i.id)) : [],
      })),
      pinned: { ...state.pinned },
    }),
    // snap is the reactive trigger; we read the live proxy for the values.
    [snap.menus, snap.pinned, snap.expandedMenuId],
  )

  const structureKey = useMemo(() => structureKeyOf(tree), [tree])

  const layout = useMemo(
    () => computeLayout(tree, SIZES),
    // structureKey is the whole dependency — see the comment above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [structureKey],
  )

  const built = useMemo(() => {
    const nodes: Node<AnyData>[] = []
    const edges: Edge[] = []
    const at = (id: string) => layout.get(id) ?? { x: 0, y: 0 }

    const costed = snap.menus.map((m) => ({ menu: m, cost: menuCost(m.id, catalog) }))
    const priced = costed.filter((c) => c.cost.foodCostPct !== null)
    const avgFoodCostPct =
      priced.length === 0
        ? null
        : priced.reduce((sum, c) => sum + (c.cost.foodCostPct ?? 0), 0) / priced.length
    const overTarget = priced.filter(
      (c) => (c.cost.foodCostPct ?? 0) > snap.policy.target_food_cost_pct + 2,
    ).length

    nodes.push({
      id: "root",
      type: "catalogue",
      position: at("root"),
      // Hand React Flow the same box the layout used, so nothing has to be
      // measured and the two can never disagree.
      width: ROOT_W,
      height: ROOT_H,
      draggable: false,
      selectable: true,
      data: {
        menuCount: snap.menus.length,
        overTarget,
        avgFoodCostPct,
        targetPct: snap.policy.target_food_cost_pct,
        selected: snap.selectedId === "root",
        onAdd: () => addMenu(),
      } satisfies CatalogueData,
    })

    for (const tier of TIER_ORDER) {
      const members = costed.filter((c) => c.menu.tier === tier)
      if (!members.length) continue
      const id = tierNodeId(tier)
      const tint = TIER_TINT[tier as keyof typeof TIER_TINT]
      nodes.push({
        id,
        type: "tier",
        position: at(id),
        width: TIER_W,
        height: TIER_H,
        draggable: true,
        selectable: false,
        className: snap.pinned[id] ? "is-pinned" : undefined,
        data: {
          tier: tier as TierData["tier"],
          label: t(`tier.${tier}`),
          count: members.length,
          onAdd: () => addMenu(tier as TierData["tier"]),
        } satisfies TierData,
      })
      edges.push({
        id: `root->${id}`,
        source: "root",
        target: id,
        type: "smoothstep",
        style: {
          stroke: `color-mix(in srgb, ${tintVar(tint)} 60%, transparent)`,
          strokeWidth: 2,
        },
      })
    }

    for (const { menu, cost } of costed) {
      const tint = TIER_TINT[menu.tier]
      nodes.push({
        id: menu.id,
        type: "menu",
        position: at(menu.id),
        width: MENU_W,
        height: MENU_H,
        draggable: true,
        selectable: true,
        className: snap.pinned[menu.id] ? "is-pinned" : undefined,
        data: {
          name: pickName(menu, locale),
          tier: menu.tier,
          mealLabel: t(`meal.${menu.meal_period}`),
          dishCount: menu.items.length,
          costPerCover: cost.perCover,
          pricePerCover: cost.pricePerCover,
          foodCostPct: cost.foodCostPct,
          targetPct: snap.policy.target_food_cost_pct,
          selected: snap.selectedId === menu.id,
          pinned: Boolean(snap.pinned[menu.id]),
          invalid: (errorCounts.get(menu.id) ?? 0) > 0,
          errorCount: errorCounts.get(menu.id) ?? 0,
          expanded: snap.expandedMenuId === menu.id,
          onToggle: () => toggleExpandedMenu(menu.id),
          onAdd: () => onAddDish?.(menu.id),
        } satisfies MenuNodeData,
      })
      edges.push({
        id: `${tierNodeId(menu.tier)}->${menu.id}`,
        source: tierNodeId(menu.tier),
        target: menu.id,
        type: "smoothstep",
        style: { stroke: `color-mix(in srgb, ${tintVar(tint)} 55%, transparent)`, strokeWidth: 1.75 },
      })

      if (snap.expandedMenuId !== menu.id) continue
      for (const item of menu.items) {
        const recipe = snap.recipes.find((r) => r.id === item.recipe)
        const perPortion = recipeCost(item.recipe, catalog).perPortion
        const contribution = perPortion * item.portions_per_cover
        const id = dishNodeId(menu.id, item.id)
        nodes.push({
          id,
          type: "dish",
          position: at(id),
          width: DISH_W,
          height: DISH_H,
          draggable: true,
          selectable: true,
          className: snap.pinned[id] ? "is-pinned" : undefined,
          data: {
            name: recipe ? pickName(recipe, locale) : item.recipe,
            station: recipe?.station ?? "assembly",
            stationLabel: recipe ? t(`station.${recipe.station}`) : "—",
            portionsPerCover: item.portions_per_cover,
            costPerCover: contribution,
            sharePct: cost.rawPerCover > 0 ? (contribution / cost.rawPerCover) * 100 : 0,
            selected: snap.selectedId === id,
            pinned: Boolean(snap.pinned[id]),
            invalid: !recipe,
          } satisfies DishData,
        })
        edges.push({
          id: `${menu.id}->${id}`,
          source: menu.id,
          target: id,
          type: "smoothstep",
          // Neutral, not the tier tint: dish edges belong to the recipe family,
          // and a tinted line blended into the gradient cards.
          style: { stroke: "color-mix(in srgb, black 35%, transparent)", strokeWidth: 1.5 },
        })
      }
    }

    return { nodes, edges }
  }, [snap, catalog, layout, errorCounts, locale, t, onAddDish])

  /* ── live node state ──────────────────────────────────────────
   * React Flow must own positions during a drag. Passing `built.nodes`
   * straight to the `nodes` prop without an `onNodesChange` handler means every
   * render clobbers the in-flight drag position, and the card only appears to
   * move once the drag ends. */
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AnyData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  useEffect(() => {
    setNodes((prev) => reconcileNodes(prev, built.nodes))
  }, [built.nodes, setNodes])

  useEffect(() => {
    setEdges(built.edges)
  }, [built.edges, setEdges])

  const translateExtent: CoordinateExtent = useMemo(
    () => worldExtent(nodes, boxOf, WORLD_PAD),
    [nodes],
  )

  /* ── refit only when the shape changes, never on hover ───────── */

  /**
   * Deciding to refocus happens when the structure mutates; executing has to
   * wait until the target nodes are actually in the state React Flow renders,
   * or `fitBounds` resolves empty bounds and parks the viewport over blank
   * canvas. One rule: frame the open branch. Collapsing leaves the viewport
   * where the user is.
   */
  const shape = `${snap.menus.length}:${snap.menus.map((m) => m.items.length).join(",")}:${snap.expandedMenuId ?? ""}`
  const lastShape = useRef<string | null>(null)
  const pendingFocus = useRef<"all" | string | null>(null)
  useEffect(() => {
    if (lastShape.current === shape) return
    const first = lastShape.current === null
    lastShape.current = shape
    pendingFocus.current = first ? "all" : state.expandedMenuId
  }, [shape])

  useEffect(() => {
    const target = pendingFocus.current
    if (!target) return

    if (target === "all") {
      if (nodes.length === 0) return
      pendingFocus.current = null
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!wrapperRef.current) return
          flow.fitView({ padding: 0.18, duration: 420, minZoom: 0.2, maxZoom: 1 })
        }),
      )
      return
    }

    const menu = state.menus.find((m) => m.id === target)
    if (!menu) return
    const ids = [target, ...menu.items.map((i) => dishNodeId(target, i.id))]
    const present = new Set(nodes.map((n) => n.id))
    if (!ids.every((id) => present.has(id))) return // not committed yet

    // We own the layout, so the branch rect is computed here rather than asked
    // of React Flow — `fitView({nodes})` silently falls back to fitting
    // everything, which zooms the whole grid out on every expand.
    const boxes = ids
      .map((id) => ({ pos: layout.get(id), box: boxOf(id) }))
      .filter((b): b is { pos: { x: number; y: number }; box: { w: number; h: number } } =>
        Boolean(b.pos),
      )
    if (!boxes.length) return
    pendingFocus.current = null

    const minX = Math.min(...boxes.map((b) => b.pos.x))
    const minY = Math.min(...boxes.map((b) => b.pos.y))
    const maxX = Math.max(...boxes.map((b) => b.pos.x + b.box.w))
    const maxY = Math.max(...boxes.map((b) => b.pos.y + b.box.h))
    const el = wrapperRef.current
    // Inflate so the implied zoom never exceeds ~0.95 — a lone branch would
    // otherwise fill the screen edge to edge.
    const w = Math.max((maxX - minX) * 1.5, (el?.clientWidth ?? 1200) / 0.95)
    const h = Math.max((maxY - minY) * 1.6, (el?.clientHeight ?? 800) / 0.95)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (!wrapperRef.current) return
        flow.fitBounds(
          { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, width: w, height: h },
          { duration: 420 },
        )
      }),
    )
  }, [nodes, layout, flow])

  /* ── drag: pin where dropped, but only past the tap threshold ── */

  // React Flow hands us a DOM event here, not a React one.
  const onNodeDragStart = useCallback((_e: MouseEvent | TouchEvent, node: Node) => {
    dragStart.current = { x: node.position.x, y: node.position.y }
  }, [])

  const onNodeDragStop = useCallback((_e: MouseEvent | TouchEvent, node: Node) => {
    const from = dragStart.current
    dragStart.current = null
    if (!from) return
    // Under the slop this was a tap that wobbled — leave the node to the solver.
    if (Math.hypot(node.position.x - from.x, node.position.y - from.y) <= TAP_SLOP) return
    pinNode(node.id, node.position.x, node.position.y)
  }, [])

  const pinnedCount = Object.keys(snap.pinned).length

  return (
    // React Flow's transform math needs LTR; the cards inside are dir-aware.
    <div ref={wrapperRef} dir="ltr" className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        translateExtent={translateExtent}
        fitView
        fitViewOptions={{ padding: 0.18, minZoom: 0.2, maxZoom: 1 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        panOnDrag
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        minZoom={0.2}
        maxZoom={1.8}
        // Touch reports sub-pixel jitter even on a stationary finger; at the
        // default threshold that registers as a drag start and React Flow then
        // suppresses the click, so on phones taps never reach `onNodeClick`.
        nodeDragThreshold={TAP_SLOP}
        onNodeClick={(_e, n) => {
          // Tier nodes are derived grouping chrome — nothing to inspect.
          if (n.id.startsWith("tier_")) return
          select(n.id)
          if (snap.menus.some((m) => m.id === n.id)) onMenuActivated?.(n.id)
        }}
        onNodeDoubleClick={(_e, n) => {
          // Double-click hands a node back to the auto-layout.
          if (state.pinned[n.id]) unpinNode(n.id)
        }}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => select("root")}
      >
        <Background gap={20} size={1} color="rgba(148,163,184,0.18)" />

        <Panel position={roomy ? "top-right" : "bottom-right"} className="!m-3">
          <div
            dir={LOCALE_DIR[locale]}
            className="flex items-center gap-1 rounded-lg border border-surface-line bg-card/95 px-1 py-1 shadow-[var(--elev-1)] backdrop-blur"
          >
            <ToolbarButton title={t("action.add_menu")} onClick={() => addMenu()}>
              <Plus className="size-3.5" />
              <span>{t("action.add_menu")}</span>
            </ToolbarButton>
            <div className="h-5 w-px bg-border" />
            <ToolbarButton
              title={t("graph.fit_view")}
              onClick={() =>
                flow.fitView({ padding: 0.18, duration: 420, minZoom: 0.2, maxZoom: 1 })
              }
            >
              <LayoutGrid className="size-3.5" />
              <span>{t("graph.fit_view")}</span>
            </ToolbarButton>
            <ToolbarButton
              title={t("graph.unpin_all")}
              disabled={pinnedCount === 0}
              onClick={unpinAll}
            >
              <PinOff className="size-3.5" />
              <span>{t("graph.unpin_all")}</span>
              {pinnedCount > 0 && (
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary tabular-nums">
                  {pinnedCount}
                </span>
              )}
            </ToolbarButton>
          </div>
        </Panel>

        {snap.menus.length === 0 && (
          <Panel position="top-center" className="!mt-3">
            <div
              dir={LOCALE_DIR[locale]}
              className="rounded-lg border border-dashed border-border bg-card/90 px-4 py-3 text-center shadow-sm backdrop-blur"
            >
              <div className="text-sm font-semibold text-foreground">{t("empty.menus")}</div>
            </div>
          </Panel>
        )}

        {/* Zoom stays available at every size — pinch on touch is imprecise and
            "fit" is the escape hatch when the tree wanders off screen. Only the
            minimap, the actual space hog, is gated on a roomy canvas. */}
        <Controls
          position="bottom-left"
          showInteractive={false}
          className="!rounded-lg !border !border-surface-line !bg-surface-raised !shadow-[var(--elev-1)]"
        />
        {roomy && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeStrokeWidth={0}
            nodeColor={(n) => {
              if (n.type === "catalogue") return "var(--brand-navy)"
              if (n.type === "tier") return tintVar(TIER_TINT[(n.data as TierData).tier])
              if (n.type === "menu") return tintVar(TIER_TINT[(n.data as MenuNodeData).tier])
              return "var(--brand-stone)"
            }}
            maskColor="rgba(19,39,63,0.06)"
            className="!rounded-lg !border !border-surface-line !bg-surface-raised !shadow-[var(--elev-1)]"
          />
        )}
      </ReactFlow>
    </div>
  )
}

function ToolbarButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
        disabled
          ? "cursor-not-allowed text-muted-foreground/50"
          : "text-foreground hover:bg-surface-sunken",
      )}
    >
      {children}
    </button>
  )
}

export function MenuGraph(props: Props) {
  return (
    <ReactFlowProvider>
      <MenuGraphInner {...props} />
    </ReactFlowProvider>
  )
}
