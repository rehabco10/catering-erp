# Working in this repo

REHAB catering catalogue. Three parts, in dependency order:

```
inventory  →  recipes  →  menus
(stock,       (bill of     (what a cover
 yields,       materials,   costs and
 suppliers)    sub-recipes) what it sells for)
```

Everything else — contracts, service orders, guarantees, production plans,
procurement against demand, staffing — was cut on `slim/mvp` and is on `main`
if it is wanted back. Do not re-add it piecemeal; take it from `main`.

## Commands

```bash
pnpm dev         # http://127.0.0.1:5181
pnpm typecheck   # tsc -b --noEmit
pnpm test        # compiles src/engine, runs node --test
pnpm build       # typecheck + vite build
```

Run `pnpm typecheck && pnpm test` before saying a change works. There is no
browser-render check in this repo, so "it builds" is not "it renders" — say
which one you verified.

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

**An "add X" flow.** Copy `src/features/inventory/AddIngredientWizard.tsx`.
`FormWizard` inside `ResponsivePanel` is the house pattern: a side sheet where
there is horizontal room, a swipeable drawer in narrow portrait. The draft
lives in the component, never in the store, so an abandoned wizard leaves
nothing behind. Gate each step with `valid` on the fields the engine cannot do
without.

**A page.** `PageShell` for a simple scrolling page, `PageHeader` +
`MasterDetail` for a list/detail split. Selection goes in the URL, not in
state — that is what lets a finding deep-link at the row that caused it.

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
