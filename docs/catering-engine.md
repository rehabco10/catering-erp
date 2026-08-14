# The catering engine

Where every rule in `src/engine/` comes from, and why it is modelled the way it
is. This is the reference `CLAUDE.md` points at: if a number here changes, the
change belongs in `Policy` (an engine input) rather than in a function body, and
a rule with no entry here is a guess.

Scope is the raw-to-menu chain and the stock behind it. The commercial and
operations half — covers, guarantees, production plans, demand-driven
procurement, staffing — was cut on `slim/mvp`; its research is kept in
**Appendix A** because that code is on `main` and may come back.

---

## 1. As-purchased vs edible portion

Invoices are for as-purchased weight; recipes consume edible portions. The gap
is the yield, and ignoring it understates every trimmed item by exactly its
trim.

```
EP cost = AP cost ÷ yield%
```

Chicken breast at SAR 4.50/kg yielding 85% costs **5.29/kg on the plate**.
Seeded yields: whole chicken 72%, lamb shoulder 68%, onion 85%, tomato 92%.

→ `costing.ts :: apUnitCost`, `epUnitCost`, `apQtyFor`

`ap_cost_sar` prices a whole **pack**, so a 20 kg sack at SAR 96 is 4.80/kg —
the pack division happens before the yield division, never after.

The inverse matters just as much for buying: to end up with 100 kg on the plate
from a 68%-yield item you must **buy 147 kg**. Ordering the recipe quantity of a
low-yield item buys two-thirds of a service.

An unpriced ingredient returns `null`, not `0`. It contributes nothing to a
cost and is named in `gaps.unpricedIngredients` — a zero that announces itself,
rather than a total that quietly reads as cheap.

## 2. Bill of materials, not a shopping list

Recipe lines are either raw stock or **another recipe**. A biryani references a
spice mix which references cardamom, and the costing has to see the cardamom.
`explodeRecipe` walks the tree scaled by portions, with a cycle guard that cuts
the branch and reports the offending recipe rather than overflowing the stack.

→ `costing.ts :: explodeRecipe`, `recipeCost`

Sub-recipe quantities are in **portions of the child**, so the recursion needs no
unit conversion: 40 portions of a 200-portion spice mix is 0.2 batches of it.

## 3. Q factor

Bread, butter, condiments, oil and seasoning are on every cover but on no recipe
card. Convention is to add **5–10%** of raw plate cost rather than itemise them,
because itemising costs more bookkeeping than it saves. Seeded at 7%.

→ `Policy.q_factor_pct`, applied in `costing.ts :: menuCost`

## 4. Pricing runs one direction

Cost is **discovered**, the target is **policy**, and the price falls out:

```
price = cost per cover ÷ target food-cost%
```

Quoting a price first and hoping the cost fits is how a signed contract turns
out unprofitable. Typical food-cost targets: fine dining 25–32%, fast-casual
28–32%, **catering operations 25–30%**. Seeded at 30%.

→ `costing.ts :: priceForTarget`, `menuVerdict`; surfaced as the
«تسعير على المستهدف» button on the menus page.

`menuVerdict` uses a ±2-point band around the target — tighter than that and
every menu reads as off-target from ordinary ingredient price drift. Below the
band is `under_target`, which is reported as *good*: it is margin the operation
keeps, and flagging it is what prompts someone to check the portion spec rather
than assume a windfall.

## 5. Stock and reordering

`on_hand` and `par_level` are **as-purchased** quantities, so the shortfall
needs no yield conversion. Yield only enters when recipes consume the stock.

```
shortfall = max(0, par_level − on_hand)
packs     = ceil(shortfall ÷ pack_size)
arrives   = today + supplier.lead_time_days
```

→ `inventory.ts :: reorderList`

Rounding up to whole packs is not cosmetic: suppliers ship 20 kg sacks, not 20
kilos, and an order for 12.4 kg is one the supplier cannot fill.

A par level is how a kitchen **without a forecast** decides what to buy. It
answers "what is missing", never "what is coming" — the demand-driven version
that answered the second question is in Appendix A.4.

Stock is valued at **EP** prices (`inventoryValue`): a store holding 100 kg of a
68%-yield item holds 68 kg of usable food, and valuing it at the invoice price
overstates what the kitchen can get out of it.

## 6. Compliance

Scoped to what the engine can check mechanically.

- **Halal certification.** Ingredients carry `halal_critical`; suppliers carry
  `halal_cert_no` and `halal_cert_expiry`. A critical ingredient sourced from a
  supplier with no certificate, or a lapsed one, is **blocking**. For Hajj
  operations this is not optional: catering companies work under SFDA and
  Ministry of Hajj and Umrah supervision, meat must come from certified halal
  suppliers, and kitchens are audited with daily random sampling during Hajj
  week.
- **Allergens** are a flat enum on the ingredient (the nine declarable ones), so
  a menu can be checked against a stated restriction mechanically rather than by
  reading free text. *The check itself is not written yet* — the data is in
  place, the rule is not.

**Deliberately out of scope**, and the honest next step: HACCP critical control
points, cook/chill/hold temperature logs, and corrective-action records. These
are documentation workflows with their own state machines, not calculations over
the existing model, so they belong in their own module rather than bolted onto
`validation.ts`. The `ServiceTemp` and `StorageClass` enums are already in place
as the hooks for that work.

## 7. What the engine does not do

| Gap | Why |
|---|---|
| Allergen checking | Data modelled, rule unwritten |
| Persistence | Store shapes are 1:1 with `schemas.ts`, so PocketBase drops in behind `store/ops.ts` |
| Labour costing | Needs a rate table and a shift model |
| Invoicing / ZATCA e-invoicing | `Policy.vat_pct` exists; the document lifecycle does not |
| Waste and variance tracking | Needs actual-consumption capture, which needs persistence first |
| HACCP / temperature logs | See §6 |

---

## Appendix A — cut on `slim/mvp`

Not in this branch's code. Kept because the research stands on its own and the
implementation is one `git checkout main -- src/lib/planning.ts` away.

### A.1 The three cover counts

The most common modelling mistake in catering software is treating "number of
guests" as one field. Operationally it is three:

| Count | Set by | Used for |
|---|---|---|
| `expected_covers` | the caterer, at quoting time | forecasting only |
| `guaranteed_covers` | the **client**, by the cutoff | billing floor **and** production base |
| `actual_covers` | the banquet captain, at service | billing ceiling |

Billing is asymmetric by convention, deliberately: below the guarantee the
client is still billed the guarantee (the food was bought); above it they are
billed the actual number (it was eaten). `billable = max(guarantee, actual)`.

### A.2 The guarantee cutoff

Due a fixed lead time before service, because that is when the kitchen shops:
**48–72 hours** for a hotel banquet desk drawing on standing supply, **5–7
business days** for a caterer who buys per event.

### A.3 The overset

Kitchens set and produce ~**5% over** the guarantee so unexpected arrivals eat,
and do not bill it unless it is consumed. Two consequences: food cost is
computed on production, not billable covers (costing on billable reports a
margin never earned), and `actual > production` is blocking — someone went
hungry or the line was topped up off-plan.

### A.4 Demand-driven procurement

Given booked orders, requirements come from the production plan and three
conversions run in this exact order — any other order under-buys or orders
fractions of a sack:

1. **EP → AP** — buy the trim back.
2. **Net off stock, holding the par level** — consuming into the buffer leaves
   the *next* service short before anyone notices.
3. **Round up to whole packs.**

`order_by = service_date − supplier.lead_time_days`, and a date in the past is
blocking, not a note.

### A.5 Production planning

Aggregated per service date across orders: three services each needing 40
portions of the same rice is one 120-portion run. Batches round up, and the
explosion runs on batches actually cooked so the shopping covers the part-batch.
`shelf_life_hours < 24` marks a line same-day-only, which is what turns a
production list into a schedule.

### A.6 Staffing

Front-of-house from a service-style ratio, kitchen from prep minutes:

| Style | Covers per server | Covers per busser |
|---|---|---|
| Plated | 12 (8 for complex VIP) | 24 |
| Buffet | 25 (range 20–30) | 40 |
| Boxed | 60 | — |
| Grab & go | 80 | — |

On a staffed plated event, **labour can run three to four times the food cost
per head** — worth remembering before treating food cost as the whole picture.

---

## Sources

Recipe costing, yield and menu engineering:
- [A Chef's Guide to Accurate Recipe Costing — meez](https://www.getmeez.com/blog/a-chefs-guide-to-accurate-recipe-costing)
- [Recipe and Menu Costing — Introduction to Food Production and Service (Penn State)](https://psu.pb.unizin.org/hmd329/chapter/ch7/)
- [How to Use Food Yield Percentage — MarketMan](https://www.marketman.com/blog/food-yield-percentage)
- [Kitchen Calculations — The Culinary Institute of America](https://www.ciachef.edu/wp-content/uploads/2024/07/kitchen-calculations.pdf)

Par levels and kitchen stock:
- [Kitchen Prep List Template — FoodDocs](https://www.fooddocs.com/food-safety-templates/kitchen-prep-list-template)
- [Mastering Kitchen Operations for Large-Scale Catering — FSM](https://fsm.how/catering-facility/mastering-kitchen-operations-large-scale-catering/)

Hajj catering and Saudi food-safety context:
- [Nutrition During Hajj Season — Saudipedia](https://saudipedia.com/en/nutrition-during-hajj-season)
- [Food Safety Practices during Hajj: On-Site Inspections of Food-Serving Establishments — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10610560/)
- [Feeding the Faithful: Inside Hajj Catering Operations — Voye Global](https://voyeglobal.com/hajj-catering-operations/)
- [HACCP Plan: 7 Principles — Spectacular Labs](https://spectacularlabs.com/news/haccp-plan-the-7-principles-essential-guide-to-food-safety-compliance)

Appendix A (guarantees, BEOs, overset, staffing):
- [Banquet Event Order (BEO) Overview — Amadeus Hospitality](https://www.amadeus-hospitality.com/banquet-event-order-beo/)
- [Banquet Event Orders — How to Create and Use a BEO, Planning Pod](https://planningpod.com/blog/banquet-event-orders-how-to-create-and-use-a-beo)
- [What is a Banquet Event Order? — Guidebook](https://www.guidebook.com/glossary/what-is-banquet-event-order)
- [Banquet Service Ratios — Cvent](https://www.cvent.com/en/blog/events/banquet-service-ratios)
- [Event Staffing Ratio Guide — Serve & Savour](https://serveandsavour.com/blog/how-much-event-staff-do-i-need)
- [Meal Preparation Documentation — USDA FNS Menu Planner](https://fns-prod.azureedge.us/sites/default/files/resource-files/menu-planner-chapter-4.pdf)
