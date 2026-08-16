# Working in this repo

REHAB catering catalogue. Three parts, in dependency order:

```
inventory  →  recipes  →  menus
(items and    (bill of     (what a cover
 the variants  materials,   costs and
 you buy them  sub-recipes) what it sells for)
 as)
```

An **item** is what a recipe asks for; a **variant** is a way of buying it,
carrying the supplier, pack, price, yield and stock. One variant per item is
the **costing basis** and prices everything downstream. Never let a recipe
reference a variant.

Everything else — contracts, service orders, guarantees, production plans,
procurement against demand, staffing — was cut on `slim/mvp` and is on `main`
if it is wanted back. Do not re-add it piecemeal; take it from `main`.

## Commands

```bash
pnpm dev         # http://127.0.0.1:5181
pnpm typecheck   # tsc -b --noEmit
pnpm test        # compiles src/engine, runs node --test
pnpm build       # typecheck + vite build
pnpm shot "/menus?view=graph" menus-graph   # headless render check
```

Run `pnpm typecheck && pnpm test` before saying a change works — and for
anything that touches a page, `pnpm shot` too, with the dev server up. Those
three catch different things and none of them substitutes for another: the
route-param rename that broke `/inventory/:id` typechecked and tested clean,
and only the screenshot showed the detail pane sitting empty.

`pnpm shot` fails on any console error, failed request or unhandled rejection,
and reports node/edge counts plus anything that looks like an untranslated
`some.key`. Screenshots land in `screenshots/` (gitignored).

## The boundary

Three layers, and the direction of dependency never reverses:

| Layer | May import | Must never import |
|---|---|---|
| `src/engine/` | other engine modules, `zod` | React, the store, i18next, `@/components`, `@/lib` |
| `src/store/` | `@/engine`, `valtio` | React components, routes |
| `src/routes/`, `src/features/` | anything | — |

`src/engine/` is **pure**: plain records in, numbers out. That purity is not a
style preference — it is what lets `tsconfig.test.json` compile the engine to
plain ESM and run real assertions against it with no bundler, no DOM and no
test framework. **If a test ever needs a mock, something impure has leaked into
the engine.** Fix the leak, not the test.

`src/lib/` is the view layer's helpers (`display`, `intl`, `utils`). It is
*not* the engine and is not covered by tests. If something in `lib/` starts
doing arithmetic that matters, move it to `engine/`.

`src/store/` owns the mutable draft and the actions that edit it. Screens
**derive**; they never cache a computed value in state. Reading validation or
costing from a component goes through `store/use-issues.ts` — `useIssues`,
`useCatalog` — because those hooks destructure the valtio snapshot, which is
what subscribes the component. Calling an engine function on the raw proxy
directly renders once and then never updates.

## Adding things

**A rule to the engine.** Three files move together, always:

1. the function in `src/engine/`,
2. a line in `docs/catering-engine.md` saying where the rule comes from — a
   convention, a formula, a regulation — with a source,
3. a case in `test/engine.test.mjs`.

A rule with no sourcing is a guess, and a guess about food cost is how a
signed contract turns out unprofitable. If you cannot source it, say so in the
doc rather than leaving it implicit.

**A validation finding.** Add the code to `validateCatalogue`, decide
`error` vs `warning` deliberately — `error` means the menu cannot be sold or
the money is wrong; everything else is `warning` — and add the Arabic template
to `src/locales/en/validation.json` so English is not left rendering Arabic.
If the finding points at an entity, make sure `ROUTE_FOR` in
`src/routes/routes.tsx` can link to it.

**An "add X" flow.** Copy `src/features/inventory/AddItemWizard.tsx`.
`FormWizard` inside `ResponsivePanel` is the house pattern: a side sheet where
there is horizontal room, a swipeable drawer in narrow portrait. The draft
lives in the component, never in the store, so an abandoned wizard leaves
nothing behind. Gate each step with `valid` on the fields the engine cannot do
without.

**A page.** `PageShell` for a simple scrolling page, `PageHeader` +
`MasterDetail` for a list/detail split. Selection goes in the URL, not in
state — that is what lets a finding deep-link at the row that caused it. A
*view mode* goes in the URL too (`?view=graph`), so a link carries which view
the sender was looking at.

**Anything on the canvas** (`src/features/menus/graph/`). Four rules that are
not obvious and were each paid for once:

- **Layout runs on structure only.** Hover and selection must never reach
  `computeLayout` — routing them through that memo rebuilds every node and
  re-runs the solver on each mouse-over, which reads as a flicker across the
  whole canvas. Hover affordances are pure CSS (`group-hover`), never state.
- **The solver wins, except during a drag.** `reconcileNodes` keeps React
  Flow's position only while `dragging` is set. Anything cleverer (comparing
  against a snapshot of the last layout) goes stale and pins every card to its
  first position.
- **Hand React Flow the same box the layout used.** Nodes carry explicit
  `width`/`height` so nothing is measured and the two cannot disagree.
- **Refit only when the shape changes**, and compute the branch rect yourself:
  `fitView({nodes})` silently falls back to fitting everything, which zooms the
  whole grid out on every expand.

The canvas wrapper is `dir="ltr"` because React Flow's transform math needs it;
each card sets its own direction from the locale.

**A string.** Never hardcode user-facing text. Structured keys
(`field.yield`) go in `src/locales/{ar,en}/ui.json`; one-off Arabic prose is
its own key and gets an English entry in `en/copy.json`. Arabic's `copy.json`
stays empty on purpose — the key *is* the Arabic, so it cannot drift.

**A dependency.** Its own commit, with the justification in the message. The
bundle is already ~1.2 MB; anything added to it should be earning its place.

## Conventions that are load-bearing

- **Arabic is the product's language**, English is the translation. `/` is
  Arabic, `/en` is English, and the URL prefix *is* the locale — no stored
  preference, so a shared link opens in the language it was shared in. Navigate
  with `useLocalePath` / `useLocaleNavigate`, never a bare `<Link to="/x">`.
- **Latin digits in Arabic**, and the Gregorian calendar. Nusuk, the ministry
  forms and every supplier invoice use them. `@/lib/intl` pins this; do not
  reach for `toLocaleString` directly.
- **Brand tokens, not hex.** `--surface-{brand,page,raised,sunken,line}` and
  `--brand-{navy,green,amber,ruby,stone}` with `-soft`/`-deep` pairs. The
  `-deep` variants are verified AAA against both white and their own `-soft`
  tint; use them for text on a tinted surface.
- **Logical properties**, not left/right: `ms-`/`me-`, `ps-`/`pe-`, `start`/
  `end`. The app is RTL by default and every `ml-` is a bug in Arabic.
- **Tables scroll inside their card.** Give the `<Table>` a `min-w-*`; the
  wrapper already handles `overflow-x`.

## Reference

`docs/catering-engine.md` is the sourcing for every rule — yields, the Q
factor, food-cost targets, halal certification. Read it before changing a
number in the engine, and update it when you do.

`docs/glossary.json` is the shared vocabulary — one Arabic headword per idea,
with the English term as the canonical reference when the Arabic drifts.
`pnpm glossary` regenerates `docs/glossary.html` (standalone, no build step,
open it in a browser). Edit the JSON, never the HTML. If you introduce a word
the business will say out loud — a new course, a new costing basis, a new
compliance check — it belongs there before it belongs in a locale file.
