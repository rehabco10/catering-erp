# The catering business-logic engine

Where every rule in `src/lib/` comes from, and why it is modelled the way it is.
This is the reference the code comments point at; if a number here changes, the
change belongs in `Policy` (an engine input) rather than in a function body.

---

## 1. The three cover counts

The single most common modelling mistake in catering software is treating
"number of guests" as one field. Operationally it is three, and they do
different jobs:

| Count | Set by | Used for |
|---|---|---|
| `expected_covers` | the caterer, at quoting time | forecasting only; plans nothing |
| `guaranteed_covers` | the **client**, by the cutoff | billing floor **and** the production base |
| `actual_covers` | the banquet captain, at service | billing ceiling |

### The guarantee is a floor, not an estimate

Industry convention is deliberately asymmetric: if the head count comes in
**below** the guarantee, the client is still billed the guarantee (the food was
bought); if it comes in **above**, the client is billed the actual number (it
was eaten). A mean, or a plain `actual`, would hand the caterer the downside in
both directions.

```
billable = max(guaranteed ?? expected, actual ?? 0)
```

→ `planning.ts :: billableCovers`

### The cutoff

The guarantee is due a fixed lead time before service, because that is when the
kitchen has to shop and prep. Common values:

- **48–72 hours** — hotel banquet desks, drawing on standing supply.
- **5–7 business days** — independent caterers who buy per event.

Modelled as `Policy.guarantee_lead_hours`, seeded at 72.
→ `planning.ts :: guaranteeDeadline`, `guaranteeState`

`due_soon` fires inside the last quarter of the lead window — enough runway to
chase the client, close enough to be worth interrupting someone for.

### The overset

Kitchens set and produce above the guarantee so unexpected arrivals eat. The
convention is **~5% over**, and the overset is **not billed** unless it is
actually consumed.

```
production = ceil(planning_covers × (1 + overset% / 100))
```

→ `planning.ts :: productionCovers`, `oversetCovers`

Two consequences the engine enforces:

- Food cost is computed on **production**, not on billable covers. An operation
  that costs on billable covers reports a margin it never earned.
- `actual > production` is a **blocking** finding: either someone went hungry or
  the line was topped up off-plan.

---

## 2. Costing: as-purchased vs edible portion

Invoices are for as-purchased weight; recipes consume edible portions. The gap
is the yield, and ignoring it understates every trimmed item by exactly its trim.

```
EP cost = AP cost ÷ yield%
```

Chicken breast at SAR 4.50/kg yielding 85% costs **5.29/kg on the plate**.
Seeded yields: whole chicken 72%, lamb shoulder 68%, onion 85%, tomato 92%.

→ `costing.ts :: apUnitCost`, `epUnitCost`, `apQtyFor`

The inverse matters just as much for procurement: to end up with 100 kg on the
plate from a 68%-yield item you must **buy 147 kg**. Ordering the recipe
quantity of a low-yield item buys two-thirds of a service.

### Bill of materials, not a shopping list

Recipe lines are either raw stock or **another recipe**. A biryani references a
spice mix which references cardamom, and the purchase list has to see the
cardamom. `explodeRecipe` walks the tree, scaled by portions, with a cycle guard
that cuts the branch and reports the offending recipe rather than overflowing
the stack.

→ `costing.ts :: explodeRecipe`, `recipeCost`

### Q factor

Bread, butter, condiments, oil and seasoning are on every cover but on no recipe
card. Convention is to add **5–10%** of raw plate cost rather than itemise them,
because itemising costs more bookkeeping than it saves. Seeded at 7%.

→ `Policy.q_factor_pct`, applied in `costing.ts :: menuCost`

### Pricing direction

Cost is **discovered**, the target is **policy**, and the price falls out:

```
price = cost per cover ÷ target food-cost%
```

Quoting a price first and hoping the cost fits is how a signed contract turns
out to be unprofitable. Typical food-cost targets: fine dining 25–32%,
fast-casual 28–32%, **catering operations 25–30%**. Seeded at 30%.

→ `costing.ts :: priceForTarget`, `menuVerdict`; exposed as the
«تسعير على المستهدف» button on the menus page.

`menuVerdict` uses a ±2-point band around the target — tighter than that and
every menu reads as off-target from ordinary ingredient price drift.

---

## 3. Production planning

The production plan is built **per service date, aggregated across orders**.
Three services each needing 40 portions of the same rice is one 120-portion run;
planning them separately is how a kitchen ends up with three part-batches and a
shortfall.

Batches are rounded **up** to whole batches, and the explosion runs on the
batches actually cooked — the shopping has to cover the part-batch that got
rounded up.

→ `planning.ts :: productionPlan`, `costing.ts :: batchesFor`

`shelf_life_hours < 24` marks a line **same-day only**, which is what turns a
production list into a schedule: a 500-cover Saturday event realistically starts
Wednesday with dry-goods inventory, Thursday with vegetable prep and sauces,
Friday with proteins, Saturday with assembly and final cooking.

---

## 4. Procurement

Three conversions, in this exact order. Any other order either under-buys or
orders fractions of a sack:

1. **EP → AP** — buy the trim back (`÷ yield%`).
2. **Net off stock, holding the par level** — consuming into the buffer is what
   leaves the *next* service short before anyone notices.
3. **Round up to whole packs** — suppliers ship 20 kg sacks, not 20 kilos.

```
shortfall_AP = max(0, needed_AP + par_level − on_hand)
packs        = ceil(shortfall_AP ÷ pack_size)
order_by     = service_date − supplier.lead_time_days
```

→ `planning.ts :: purchaseList`

An `order_by` in the past is a **blocking** finding, not a note: a five-day lead
time on dry goods means today's sheet is about next week's service, and it
cannot be fixed by a trip to the market.

---

## 5. Staffing

Front-of-house comes from a service-style ratio; the kitchen comes from the
production plan's prep minutes, because a 400-cover buffet of three dishes is
not the same kitchen load as 400 covers of twelve.

| Style | Covers per server | Covers per busser |
|---|---|---|
| Plated | 12 (8 for complex VIP service) | 24 |
| Buffet | 25 (range 20–30) | 40 |
| Boxed | 60 | — |
| Grab & go | 80 | — |

→ `schemas.ts :: STAFF_RATIOS`, `planning.ts :: staffPlan`

Note for the P&L work that follows this MVP: on a staffed plated event, **labour
can run three to four times the food cost per head**. The current engine models
food cost only; `staffPlan` produces the head counts a labour-cost layer would
price.

---

## 6. Compliance

Scoped to what the engine can actually check mechanically.

- **Halal certification.** Ingredients carry `halal_critical`; suppliers carry
  `halal_cert_no` and `halal_cert_expiry`. A critical ingredient sourced from a
  supplier with no certificate, or a lapsed one, is **blocking**. For Hajj
  operations this is not optional: catering companies work under SFDA and
  Ministry of Hajj and Umrah supervision, meat must come from certified halal
  suppliers, and kitchens are audited with daily random sampling during Hajj
  week.
- **Allergens** are a flat enum on the ingredient (the nine declarable ones), so
  a menu can be checked against a client's stated restrictions mechanically
  rather than by reading free text.

**Deliberately out of scope for the MVP**, and the honest next step: HACCP
critical control points, cook/chill/hold temperature logs, and corrective-action
records. These are documentation workflows with their own state machines, not
calculations over the existing model — they belong in their own module rather
than bolted onto `validation.ts`. The `ServiceTemp` and `StorageClass` enums are
already in place as the hooks for that work.

---

## 7. What the engine does not do yet

Stated plainly so nobody mistakes the scaffold for the product:

| Gap | Why it was left out |
|---|---|
| Labour costing (rates, shifts, overtime) | `staffPlan` gives head counts; pricing them needs a rate table and a shift model |
| Invoicing / ZATCA e-invoicing | `withVat` exists; the document lifecycle does not |
| Persistence | Store shapes are 1:1 with `schemas.ts` so PocketBase drops in behind `store/ops.ts` |
| Multi-kitchen / transport | `daily_capacity_covers` is one number for one kitchen |
| Waste and variance tracking | Needs actual-consumption capture, which needs persistence first |
| HACCP / temperature logs | See §6 |

---

## Sources

Guarantees, BEOs and overset:
- [Banquet Event Order (BEO) Overview — Amadeus Hospitality](https://www.amadeus-hospitality.com/banquet-event-order-beo/)
- [Banquet Event Orders — How to Create and Use a BEO, Planning Pod](https://planningpod.com/blog/banquet-event-orders-how-to-create-and-use-a-beo)
- [What is a Banquet Event Order? — Guidebook](https://www.guidebook.com/glossary/what-is-banquet-event-order)

Recipe costing, yield and menu engineering:
- [A Chef's Guide to Accurate Recipe Costing — meez](https://www.getmeez.com/blog/a-chefs-guide-to-accurate-recipe-costing)
- [Recipe and Menu Costing — Introduction to Food Production and Service (Penn State)](https://psu.pb.unizin.org/hmd329/chapter/ch7/)
- [How to Use Food Yield Percentage — MarketMan](https://www.marketman.com/blog/food-yield-percentage)
- [Kitchen Calculations — The Culinary Institute of America](https://www.ciachef.edu/wp-content/uploads/2024/07/kitchen-calculations.pdf)

Production planning and prep sheets:
- [Mastering Kitchen Operations for Large-Scale Catering — FSM](https://fsm.how/catering-facility/mastering-kitchen-operations-large-scale-catering/)
- [Kitchen Prep List Template — FoodDocs](https://www.fooddocs.com/food-safety-templates/kitchen-prep-list-template)
- [Meal Preparation Documentation — USDA FNS Menu Planner](https://fns-prod.azureedge.us/sites/default/files/resource-files/menu-planner-chapter-4.pdf)

Staffing ratios:
- [Banquet Service Ratios — Cvent](https://www.cvent.com/en/blog/events/banquet-service-ratios)
- [Event Staffing Ratio Guide — Serve & Savour](https://serveandsavour.com/blog/how-much-event-staff-do-i-need)
- [Event Catering Staff Planning Guide — Breakroom](https://www.breakroomapp.com/blog/large-event-catering-staffing)

ERP module scope:
- [How Odoo ERP Transforms Event & Catering Management Businesses — Aenten](https://www.aenten.com/for-odoo/articles/how-odoo-erp-transforms-event-and-catering-management-businesses/)
- [Catering Event Calendar Management — Cloud Catering Manager](https://cloudcateringmanager.com/catering-event-calendar-management/)

Hajj catering and Saudi food-safety context:
- [Nutrition During Hajj Season — Saudipedia](https://saudipedia.com/en/nutrition-during-hajj-season)
- [Food Safety Practices during Hajj: On-Site Inspections of Food-Serving Establishments — PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10610560/)
- [Feeding the Faithful: Inside Hajj Catering Operations — Voye Global](https://voyeglobal.com/hajj-catering-operations/)
- [HACCP Plan: 7 Principles — Spectacular Labs](https://spectacularlabs.com/news/haccp-plan-the-7-principles-essential-guide-to-food-safety-compliance)
