# منظومة الإعاشة — رحاب / REHAB Catering

A REHAB-branded catering catalogue: stock and suppliers, recipes as bills of
materials, and menus costed and priced off both.

```
inventory  →  recipes  →  menus
(stock,       (bill of      (what a cover
 yields,       materials,    costs and
 suppliers)    sub-recipes)  what it sells for)
```

Two things were inherited rather than invented:

- **Branding** from `dispute-platform` — REHAB's palette (Cloud Dancer, Rich
  Black, Mystic Navy, Dark Ruby) and *The Year of Handicrafts* typeface.
- **Structure and flow** from `hajj-package-wizard` — the same shell, the same
  UI primitives, the same Arabic-first bilingual routing, the same
  pure-engine / mutable-draft / derived-view separation.

The business logic is new. See **[`docs/catering-engine.md`](docs/catering-engine.md)**
for where every rule comes from, and **[`CLAUDE.md`](CLAUDE.md)** for how to add
to this repo.

## Running it

```bash
pnpm install
pnpm dev         # http://127.0.0.1:5181
pnpm typecheck
pnpm test        # 26 assertions over the pure engine
pnpm build
```

Arabic is at `/`, English at `/en`. No stored language preference — the URL
prefix *is* the locale, so a shared link always opens in the language it was
shared in.

## Sections

| Route | What it does |
|---|---|
| `/inventory` | Stock, suppliers, pack price and yield. The EP unit cost every recipe downstream is costed from, plus a below-par reorder sheet and an add-ingredient wizard |
| `/recipes` | Recipes as a bill of materials — lines as written (including sub-recipes) *and* the exploded raw requirement underneath |
| `/menus` | Two modes. **Form** — identity, composition, pricing, in the order the decisions are made. **Graph** (`?view=graph`) — the catalogue as a tree, catalogue → tier → menu → dish, where a dish's bar is its share of the plate cost |
| `/validation` | Every finding, click-through to the entity that caused it |
| `/settings` | Operating policy — the three numbers the engine keys off |

## Layout

```
src/
  engine/         pure — plain records in, numbers out. No React, no store,
    schemas.ts      no i18next. This is what `pnpm test` compiles and asserts.
    costing.ts      yield → EP cost → recipe explosion → cost per cover
    inventory.ts    stock value, par-level reordering
    validation.ts   the rules, as Issues with stable codes
  store/          the mutable draft (valtio) + actions + seed
  lib/            view helpers — formatting, Intl, class merging
  components/     shell (PageShell, NavRail, MasterDetail) and ui/ primitives
  routes/         one file per section
  features/       flows bigger than a page (the add-ingredient wizard)
  i18n/           locale-as-URL-prefix routing and the i18next bootstrap
test/             node:test assertions against the compiled engine
```

The boundary that matters: `engine/` never imports React, the store, or the
view layer. That is not style — it is what lets the engine compile to plain ESM
and be tested with no bundler, no DOM and no test framework. If a test ever
needs a mock, something impure has leaked in.

## Seed data

A worked Hajj catalogue: five suppliers, sixteen ingredients, ten recipes (one
a shared sub-recipe), four menus. Several rows are deliberately imperfect so the
checks page has real findings on first run:

- a lapsed halal certificate on the poultry supplier (blocking);
- Arabic bread with no purchase price, so the breakfast menu costs light;
- the premium lunch at ~41% food cost against a 30% target;
- fresh chicken below its par level.

Menus cost out at 13.3% / 20.1% / 41.1% / 29.0% food cost, so the menus page
shows an under-costed one, two healthy ones, and one over target.

## Branch state

`main` holds the full scaffold — contracts, service orders and guarantees,
production planning, demand-driven procurement, staffing, and a dashboard.
`slim/mvp` cut all of it down to the three parts above. To bring a piece back,
take it from `main` rather than rewriting it; the research behind it is retained
in Appendix A of the engine doc.

## Known gaps

No persistence (the store is in-memory). No allergen check yet — the data is
modelled, the rule is not. No HACCP/temperature-log module. Full list in
[`docs/catering-engine.md` §7](docs/catering-engine.md).
