# منظومة الإعاشة — رحاب / REHAB Catering Operations

An ERP-shaped MVP scaffold for catering operations: contracts and service
orders (BEOs), menu costing, recipe bills of materials, day-by-day production
planning, and procurement netted against stock.

Two things were deliberately inherited rather than invented:

- **Branding** from `dispute-platform` — REHAB's palette (Cloud Dancer, Rich
  Black, Mystic Navy, Dark Ruby) and *The Year of Handicrafts* typeface.
- **Structure and flow** from `hajj-package-wizard` — the same shell, the same
  UI primitives, the same Arabic-first bilingual routing, the same
  pure-engine / valtio-draft / derived-view separation.

The business logic is new, and is the point. See
**[`docs/catering-engine.md`](docs/catering-engine.md)** for where every rule
comes from.

## Running it

```bash
pnpm install
pnpm dev          # http://127.0.0.1:5181
pnpm typecheck
pnpm build
```

Arabic is at `/`, English at `/en`. No stored language preference — the URL
prefix *is* the locale, so a shared link always opens in the language it was
shared in.

## What is here

| Route | What it does |
|---|---|
| `/` | Season rollup: billable vs produced covers, revenue/cost/margin, daily kitchen load against capacity, blocking findings |
| `/orders` | The service book. Guarantee state per order, cutoff countdown, per-order economics and staffing, add-a-service wizard |
| `/menus` | Menu engineering: cost per cover vs price, food-cost % against target, one-click price-at-target |
| `/recipes` | Recipes as a bill of materials — lines as written (incl. sub-recipes) *and* the exploded raw requirement underneath |
| `/production` | The day's production sheet, aggregated across orders, grouped by station, with batch counts and same-day-only flags |
| `/procurement` | Purchase list net of stock in whole packs with order-by dates, plus the stock table against par levels |
| `/validation` | Every finding, click-through to the entity that caused it |
| `/settings` | Operating policy — the six numbers the whole engine keys off |

## Layout

```
src/
  lib/            pure engine — no React, no store, no i18next runtime
    schemas.ts      the domain, as zod schemas
    costing.ts      yield → EP cost → recipe explosion → cost per cover
    planning.ts     covers, guarantees, production plans, purchase lists, staffing
    validation.ts   the rules, as Issues with stable codes
    display.ts      formatting and enum option lists
    intl.ts         per-locale Intl formatters (Gregorian + Latin digits in Arabic)
  store/          the mutable draft (valtio) + actions + seed
  components/     shell (PageShell, NavRail, MasterDetail) and ui/ primitives
  routes/         one file per section
  features/       flows that are bigger than a page (the add-service wizard)
  i18n/           locale-as-URL-prefix routing and the i18next bootstrap
```

The boundary that matters: `lib/` takes plain records and returns numbers.
It never reads the store, so the same functions serve the UI, a future export,
and node tests. `store/` owns the draft and the actions. Screens derive; they
do not cache.

## Domain shape

```
supplier → ingredient → recipe ⇄ sub-recipe
                            ↓
                          menu → service order (BEO) → contract
                            ↓                    ↓
                     production plan  ────→ purchase list
```

A service order is one menu, at one site, on one date, for one meal period —
the single sheet the kitchen, the service team and the invoice all read from.

## Seed data

A worked Hajj season: two client contracts, five suppliers, sixteen
ingredients, ten recipes (one a shared sub-recipe), four menus, and fifteen
service orders straddling today. Dates are generated relative to today, so the
seed never goes stale.

Several rows are deliberately imperfect, so the checks page has real findings on
first run rather than an empty state that proves nothing. It currently reports
**~19 blocking and ~8 advisory** findings across ten distinct rules:

- a lapsed halal certificate on the poultry supplier (compliance, blocking);
- Arabic bread with no purchase price, so the breakfast menu costs light;
- the premium lunch at ~41% food cost against a 30% target;
- a service two days out with no guarantee, past its 72-hour cutoff;
- tomorrow's two services together exceeding the kitchen's daily capacity;
- short-lead items for the next few days already past their order-by date —
  the operation is genuinely under-stocked going into the season, which is the
  realistic picture and what the procurement page exists to surface.

The four menus cost out at 13.3% / 20.1% / 41.1% / 29.0% food cost, so the
menus page shows an under-costed one, two healthy ones, and one over target.

## Known gaps

Listed in full in [`docs/catering-engine.md` §7](docs/catering-engine.md). The
short version: no persistence (the store is in-memory; shapes are 1:1 with
`schemas.ts` so PocketBase drops in behind `store/ops.ts`), no labour costing,
no invoicing, and no HACCP/temperature-log module.
