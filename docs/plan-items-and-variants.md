# Plan — items, purchase variants, and a suppliers section

Status: **steps 1–2 landed** (model, engine, store, seed, tests, and the
rebuilt `/inventory`). Step 3 — the suppliers section — is outstanding, as is
the naming sweep of `ingredient` in prose. The model section is now duplicated
in `docs/catering-engine.md` §0, which is the version to trust; delete this file
once step 3 lands.

## The problem

`Ingredient` flattens two different things into one record:

- **what a recipe consumes** — "6 kg of basmati rice", a kitchen fact;
- **what you buy** — "a 20 kg sack from Al-Moun at 96 SAR, 100% yield", a
  purchasing fact.

Because they share a row, an item can have exactly one supplier, one pack size,
one price and one yield. That is wrong in three ways that matter:

1. **No second source.** Al-Moun and Haramain both sell rice. Today you would
   have to create two "ingredients" and pick one in every recipe.
2. **Yield is attached to the wrong thing.** Whole chicken yields ~72%; boned
   breast yields ~98%. Same item, different purchase form, different trim. Yield
   is a property of *what you buy*, not of *what the dish calls for*.
3. **Compliance has no escape hatch.** When the poultry supplier's halal
   certificate lapses — which the seed demonstrates — the only fix is to edit
   the ingredient's supplier field, silently re-pricing every recipe. With a
   second variant on file it is a one-click switch of the costing basis.

## The model

```
SUPPLIER  ──┐
            ├─< VARIANT >──┐
SUPPLIER  ──┘              ├──  ITEM  ──<  recipe line
                           │
                        (preferred)
```

### `Item` — what recipes reference

| field | note |
|---|---|
| `id`, `name_ar`, `name_en` | |
| `category` | `IngredientCategory`, unchanged |
| `base_unit` | kg / l / ea — the unit recipes are written in |
| `allergens[]` | a property of the food, not of the pack |
| `halal_critical` | likewise |
| `par_level` | in base units, **aggregate across variants** |
| `preferred_variant` | `string \| null` — the costing basis |

### `ItemVariant` — what you buy

| field | note |
|---|---|
| `id`, `item` | |
| `name_ar`, `name_en` | e.g. «كيس ٢٠ كجم» / "20 kg sack" |
| `supplier` | `string \| null` — **moved here from the item** |
| `supplier_ref` | the supplier's own code, for a future PO |
| `pack_unit`, `pack_size` | base units per pack |
| `ap_cost_sar` | per pack, nullable |
| `yield_pct` | **moved here** — see §2 above |
| `storage` | **moved here** — frozen and fresh lamb are two variants |
| `on_hand` | base units, per variant |

`Supplier` is unchanged.

### Decisions already taken

- **The preferred variant is the costing basis**, chosen explicitly. Deterministic
  and auditable: a recipe's cost changes only when someone decides it does. The
  UI shows the cheapest variant alongside so a better option is visible without
  being silently applied — and a new `item.cheaper_variant_available` finding
  makes it a checks-page item rather than something you have to notice.
- **Deleting the preferred variant sets `preferred_variant` to null**, it does
  not silently repoint. Repointing would move every recipe cost that touches the
  item without anyone asking for it. The resulting `item.no_preferred` is a
  blocking finding, which is the correct amount of noise.
- **Par is on the item, stock is on the variant.** The kitchen runs out of
  *rice*, not of *Al-Moun rice*; but the shelf holds specific packs. So the par
  check sums variants, and the reorder is placed against the preferred variant —
  that being the one you have decided to buy.

### Naming

`ingredient` → **item** / «مادة»; variant → «عبوة مورد», shortened to «العبوة»
in table headers. This collides with the existing `pack.*` catalog for pack
*units* (sack, box, case), which gets renamed `packunit.*`. Easy to change —
say so before step 1 rather than after step 4.

## Engine changes

`Catalog` gains `variants: Map<string, ItemVariant>` and
`variantsByItem: Map<string, ItemVariant[]>`; `ingredients` becomes `items`.

**`costing.ts`**
- `apUnitCost` / `epUnitCost` / `apQtyFor` take a **variant**. The arithmetic is
  unchanged; only the input type moves.
- new `costingVariant(itemId, catalog)` → the preferred variant, or null.
- new `itemUnitCost(itemId, catalog)` → EP unit cost through the preferred
  variant. Null when there is no preferred variant or it is unpriced — a null
  that announces itself, same as today.
- `explodeRecipe` is untouched in shape: requirements stay keyed by **item id**.
- `recipeCost` resolves item → preferred variant → EP cost.
- `CostingGaps` gains `itemsWithoutPreferred: string[]`.

**`inventory.ts`**
- `itemOnHand(itemId, catalog)` sums the item's variants.
- `reorderList` — shortfall computed against the item's par from summed stock,
  packs computed from the **preferred** variant's `pack_size`, lead time from
  that variant's supplier. Skips items with no preferred variant and reports
  them (they are already a blocking finding).
- `inventoryValue` sums **per variant at its own price and yield**. This is
  strictly more correct than today, where two purchase prices could not coexist.
- new `cheapestVariant(itemId, catalog)`.

**`validation.ts`** — `scope` becomes `"item" | "variant" | "recipe" | "menu"`.

| code | level | note |
|---|---|---|
| `item.no_variants` | error | nothing can be bought |
| `item.no_preferred` | error | variants exist, none is the costing basis |
| `item.preferred_unpriced` | warning | replaces `ingredient.no_cost` |
| `item.below_par` | warning | on summed stock |
| `item.cheaper_variant_available` | warning | preferred is >5% dearer than the cheapest |
| `variant.no_supplier` | error if halal-critical, else warning | |
| `variant.halal_cert_missing` | error | on halal-critical items |
| `variant.halal_cert_expired` | error | |
| `variant.suspicious_yield` | warning | 100% on protein/produce |

The halal checks now run **per variant**, so a lapsed certificate on an
unpreferred variant is still reported — it is stock you may hold.

## UI changes

**`/inventory`** — master list of items (unchanged shape: name, category, par
meter). Detail becomes:

1. **Identity** — names, category, base unit, allergens, halal-critical, par.
2. **Purchase options** — the variant table: supplier, pack, price, yield, EP
   unit cost, stock, and a radio for preferred. Cheapest is marked. This is the
   heart of the page and the reason for the refactor.
3. **Cost** — the headline EP unit cost, with the preferred variant named and
   the cheapest shown beside it when they differ.
4. **Used by** — recipes, as today.

Receiving stock moves onto the variant row, which is where it belongs: you
receive a pack, not an abstraction.

**`/suppliers`** — new section, nav order `Suppliers → Inventory → Recipes →
Menus`, following the chain. Master list with certificate status; detail with
editable details, lead time, certificate + expiry, and the variants they supply
with prices — so "what does Al-Moun cost us" is one page.

**`/recipes`** — `AddLineSheet` lists items with their preferred EP cost; the
raw-requirement table names the preferred variant it priced through.
`RecipeLine.kind` renames `"ingredient"` → `"item"`.

**`/menus`** — unaffected.

## Seed

Every current ingredient becomes one item plus one variant, marked preferred.
Then a handful of genuine second variants, so the model demonstrates itself:

- **Basmati rice** — Al-Moun 20 kg @ 96 (4.80/kg, preferred) and Haramain 10 kg
  @ 52 (5.20/kg). Preferred is already the cheapest: the healthy case.
- **Fresh chicken** — Taif 10 kg @ 185, 72% yield, *lapsed certificate*,
  preferred — plus **frozen chicken**, National Meat 12 kg @ 210, 74% yield,
  valid certificate. The compliance story becomes actionable: a blocking finding
  with a fix one radio button away.
- **Lamb** — fresh and frozen, different yields, so two variants of one item
  visibly cost differently.
- **Tomato** — two produce suppliers at different pack sizes.

## Tests

Extend `test/engine.test.mjs`:

- preferred variant drives item cost; changing it changes the recipe cost
- an item with no preferred variant costs nothing and reports the gap
- two variants of one item with different yields cost differently
- reorder sums stock across variants and orders packs of the preferred one
- `inventoryValue` prices each variant at its own cost, not a blend
- `cheapestVariant` and the >5% finding
- halal certification is checked per variant, on halal-critical items only

## Sequencing

Each step ends green — `tsc` clean, tests passing, build succeeding.

1. **Model + engine + store + seed + tests.** Necessarily one commit: a schema
   split cannot land half-applied. Routes get the minimum edits to keep
   compiling; `/inventory` will look unchanged and slightly wrong.
2. **`/inventory` rebuilt** around the variant table.
3. **`/suppliers`** section, nav, and copy.
4. **Docs** — fold the model into `docs/catering-engine.md`, update `CLAUDE.md`
   (three parts becomes four) and the README; delete this file.

Roughly 1,100 lines touched, most of it in step 1.

## What this does not do

- No purchase orders. `supplier_ref` is groundwork, nothing reads it.
- No price history — `ap_cost_sar` stays a single current price, so there is
  still no answer to "what did we pay last month".
- No unit conversion between a variant's pack unit and the item's base unit
  beyond `pack_size`; a variant sold by the each that a recipe wants by weight
  still needs its `pack_size` expressed in base units by hand.
- Multi-location stock stays out. `on_hand` is one number per variant.
