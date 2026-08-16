import { readFileSync, writeFileSync } from "node:fs"

/**
 * Generate the buffet-package seed from the extracted source document.
 *
 *   node scripts/seed-from-docs.mjs
 *
 * Reads `docs/source/buffet-packages.md` (itself produced by
 * `scripts/docx-to-md.mjs` from the client's .docx) and writes
 * `src/store/seed-packages.ts`.
 *
 * Generated rather than hand-copied because there are ~120 dish names across
 * five packages, and a hand transcription of that would drift from the document
 * the first time it changes. Re-run it; do not edit the output.
 *
 * ── What the document gives, and what it does not ────────────────────
 * It gives: package names and numbering, the sections each is laid out in, the
 * dishes in each section, and the station's inclusions. All of that is
 * transcribed exactly.
 *
 * It gives NO prices, portion sizes, yields, batch yields or consumption rates.
 * Everything numeric below is therefore a stated default, not data — the dishes
 * are emitted as `draft: true` recipes with no lines, which is what they are:
 * names on a package that nobody has costed yet.
 */

const SRC = "docs/source/buffet-packages.md"
const OUT = "src/store/seed-packages.ts"

/** Section heading in the document → the `MenuCourse` it maps to. */
const COURSE = {
  "المقبلات الباردة": "cold_appetiser",
  "المقبلات الساخنة": "hot_appetiser",
  "الأطباق الرئيسية": "main",
  الحلويات: "dessert",
  الخبز: "bread",
}

/** Kitchen station and holding temperature follow from the course. */
const STATION = {
  cold_appetiser: ["cold", "cold"],
  hot_appetiser: ["hot", "hot"],
  main: ["hot", "hot"],
  dessert: ["bakery", "cold"],
  bread: ["bakery", "ambient"],
  beverage: ["beverage", "cold"],
}

/**
 * Portions of a *section* one cover consumes, spread evenly across its dishes.
 *
 * A buffet with fifteen cold appetisers does not serve fifteen portions per
 * guest — a guest takes a few. Costing each dish at 1.0 would inflate a cover
 * by an order of magnitude, so each section carries a budget and every dish in
 * it gets `budget ÷ dishes`. The budgets are judgement, not data; the document
 * has no consumption rates.
 */
const SECTION_BUDGET = {
  cold_appetiser: 3,
  hot_appetiser: 2,
  main: 2.5,
  dessert: 2,
  bread: 1,
  beverage: 1,
}

/** Defaults for a stub, by course: batch yield, portion grams, prep, shelf life. */
const DEFAULTS = {
  cold_appetiser: [50, 80, 30, 8],
  hot_appetiser: [50, 90, 40, 4],
  main: [40, 320, 75, 4],
  dessert: [50, 110, 45, 24],
  bread: [100, 90, 10, 20],
  beverage: [100, 200, 5, 24],
}

const md = readFileSync(SRC, "utf-8")
const clean = (s) => s.replace(/\*\*/g, "").replace(/<br>/g, " ").trim()

/* ── parse ────────────────────────────────────────────────────────── */

const packages = []
let current = null

for (const rawLine of md.split("\n")) {
  const line = rawLine.trim()
  if (!line) continue

  // «الباقة الأولى "1"» / «ركن الذبائح "5"» — a heading with a number in quotes.
  const heading = /^\*\*(.+?)\*\*\s*$/.exec(line)
  if (heading && !line.startsWith("|")) {
    const text = clean(heading[1])
    const num = /["“”](\d)["“”]/.exec(text)
    if (num) {
      current = { n: Number(num[1]), title: text, blurb: "", sections: [], inclusions: [] }
      packages.push(current)
      continue
    }
    if (current && !current.blurb && !text.startsWith("الخدمات")) current.blurb = text
    continue
  }
  if (!line.startsWith("|") && current && !current.blurb) {
    current.blurb = clean(line)
    continue
  }

  if (!line.startsWith("|") || !current) continue
  const cells = line.slice(1, -1).split("|").map(clean)
  if (cells.every((c) => /^-+$/.test(c) || !c)) continue
  if (cells[0] === "القسم" || cells[0] === "مكونات الركن") continue

  // The station's table is a single column of numbered inclusions.
  if (cells.length === 1 || !cells[1]) {
    for (const part of cells[0].split(/\d+\.\s*/).map(clean).filter(Boolean)) {
      current.inclusions.push(part)
    }
    continue
  }

  const course = COURSE[cells[0]]
  if (!course) continue
  const dishes = cells[1]
    .split("/")
    .map(clean)
    .filter(Boolean)
  current.sections.push({ course, dishes })
}

/* ── dish catalogue, deduped across packages ──────────────────────── */

const recipes = new Map() // arabic name → { id, course }
for (const pkg of packages) {
  for (const section of pkg.sections) {
    for (const dish of section.dishes) {
      if (recipes.has(dish)) continue
      recipes.set(dish, {
        id: `rec_b${String(recipes.size + 1).padStart(3, "0")}`,
        course: section.course,
      })
    }
  }
}

/* ── emit ─────────────────────────────────────────────────────────── */

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

const recipeLines = [...recipes.entries()].map(([name, { id, course }]) => {
  const [station, temp] = STATION[course]
  const [yieldPortions, grams, prep, shelf] = DEFAULTS[course]
  return `  { id: "${id}", name_ar: "${esc(name)}", name_en: "", station: "${station}", service_temp: "${temp}", yield_portions: ${yieldPortions}, portion_size_g: ${grams}, prep_minutes: ${prep}, shelf_life_hours: ${shelf}, draft: true, lines: [] },`
})

const menuLines = packages.map((pkg) => {
  const isStation = pkg.sections.length === 0
  const items = pkg.sections.flatMap((section) => {
    const per = SECTION_BUDGET[section.course] / section.dishes.length
    return section.dishes.map((dish, i) => {
      const { id } = recipes.get(dish)
      const key = `mi_p${pkg.n}_${section.course.slice(0, 4)}${i + 1}`
      return `      { id: "${key}", recipe: "${id}", course: "${section.course}", portions_per_cover: ${Number(per.toFixed(4))} },`
    })
  })
  return [
    "  {",
    `    id: "menu_p${pkg.n}",`,
    `    name_ar: "${esc(pkg.title.replace(/\s*["“”]\d["“”]\s*/, "").trim())}",`,
    `    name_en: "${isStation ? "Whole-lamb station" : `Buffet package ${pkg.n}`}",`,
    `    service_line: "${isStation ? "station" : "buffet"}",`,
    `    level: ${isStation ? "null" : pkg.n},`,
    "    meal_period: null,",
    "    // Unpriced: the source document quotes no prices.",
    "    price_per_cover_sar: null,",
    `    inclusions: [${pkg.inclusions.map((i) => `"${esc(i)}"`).join(", ")}],`,
    items.length ? `    items: [\n${items.join("\n")}\n    ],` : "    items: [],",
    "  },",
  ].join("\n")
})

const out = `import type { Menu, Recipe } from "@/engine/schemas"

/**
 * GENERATED by \`scripts/seed-from-docs.mjs\` from
 * \`docs/source/buffet-packages.md\`. Do not edit by hand — re-run the script.
 *
 * ${recipes.size} dishes across ${packages.length} packages, transcribed from the client's
 * proposal document.
 *
 * The dish names, the sections and the package numbering are **data**. Every
 * number is a **default**: the document carries no prices, portion sizes,
 * yields or consumption rates, so the recipes are emitted as \`draft: true\`
 * with no lines — names on a package that nobody has costed yet — and
 * portions-per-cover is a per-section budget divided evenly across its dishes.
 * See the script for the budgets and why they exist.
 */

export const DOC_RECIPES: Recipe[] = [
${recipeLines.join("\n")}
]

export const DOC_MENUS: Menu[] = [
${menuLines.join("\n")}
]
`

writeFileSync(OUT, out, "utf-8")
console.log(`${SRC} → ${OUT}`)
console.log(`  packages: ${packages.length}`)
for (const p of packages) {
  const dishes = p.sections.reduce((t, s) => t + s.dishes.length, 0)
  console.log(
    `    ${p.n}: ${p.sections.length} sections, ${dishes} dishes, ${p.inclusions.length} inclusions`,
  )
}
console.log(`  distinct dishes: ${recipes.size}`)
