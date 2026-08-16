import { readFileSync, writeFileSync } from "node:fs"

/**
 * docs/glossary.json → docs/glossary.html
 *
 *   pnpm glossary
 *
 * A standalone page: HTML and CSS only, no script, no build step, no network.
 * It opens from the filesystem, prints, and can be mailed to someone who has
 * never cloned the repo — which is the whole point of a shared vocabulary.
 *
 * The JSON is schema.org `DefinedTermSet` / `DefinedTerm`, and the same object
 * is embedded in the page as JSON-LD, so the document a person reads and the
 * data a machine reads cannot drift apart.
 *
 * Generated, never hand-edited: the .json is the source.
 */

const SRC = "docs/glossary.json"
const OUT = "docs/glossary.html"

/** Display order and headings for the `group` property on each term. */
const GROUPS = [
  { id: "chain", ar: "السلسلة", en: "The chain", blurb: "من المادة الخام إلى الباقة المباعة." },
  { id: "costing", ar: "التكلفة والتسعير", en: "Costing & pricing", blurb: "كيف يتحوّل سعر الشراء إلى سعر بيع." },
  { id: "inventory", ar: "المخزون والتوريد", en: "Stock & supply", blurb: "ما هو موجود، وما ينقص، ومتى يصل." },
  { id: "compliance", ar: "الاشتراطات", en: "Compliance", blurb: "ما يُفحص آليًا: الحلال، ومسبّبات الحساسية، والتخزين." },
  { id: "checks", ar: "الفحص", en: "Checks", blurb: "ما يوقف العمل، وما ينبّه فقط." },
  {
    id: "out-of-scope",
    ar: "خارج النطاق حاليًا",
    en: "Out of scope for now",
    blurb: "مصطلحات حقيقية، لكن شيفرتها على فرع main. مذكورة هنا كي لا يُعاد اختراع أسماء لها.",
  },
]

const set = JSON.parse(readFileSync(SRC, "utf-8"))

const esc = (s = "") =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

/** Pull one `additionalProperty` off a term by name. */
const prop = (term, name) =>
  (term.additionalProperty ?? []).find((p) => p.name === name)?.value ?? ""

/** `\`code\`` spans in a description become <code>. */
const rich = (s = "") => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>")

const terms = set.hasDefinedTerm ?? []
const byGroup = new Map(GROUPS.map((g) => [g.id, []]))
for (const t of terms) {
  const g = prop(t, "group") || "chain"
  if (!byGroup.has(g)) byGroup.set(g, [])
  byGroup.get(g).push(t)
}

const card = (t) => {
  const note = prop(t, "note")
  const source = prop(t, "source")
  return `
        <article class="term" id="${esc(t.termCode)}">
          <header class="term-head">
            <h3 class="ar">${esc(t.alternateName)}</h3>
            <p class="en" lang="en" dir="ltr">${esc(t.name)}</p>
          </header>
          <p class="desc" dir="auto">${rich(t.description)}</p>
          ${note ? `<p class="note" dir="auto">${rich(note)}</p>` : ""}
          ${source ? `<p class="source" dir="auto"><span>المصدر</span> ${esc(source)}</p>` : ""}
        </article>`
}

const section = (g) => {
  const rows = byGroup.get(g.id) ?? []
  if (!rows.length) return ""
  return `
      <section class="group" id="g-${esc(g.id)}">
        <div class="group-head">
          <h2>${esc(g.ar)}</h2>
          <p class="en" lang="en" dir="ltr">${esc(g.en)}</p>
          <p class="blurb">${esc(g.blurb)}</p>
        </div>
        <div class="terms">${rows.map(card).join("")}</div>
      </section>`
}

const toc = GROUPS.filter((g) => (byGroup.get(g.id) ?? []).length)
  .map(
    (g) =>
      `<li><a href="#g-${esc(g.id)}">${esc(g.ar)}<span class="count">${(byGroup.get(g.id) ?? []).length}</span></a></li>`,
  )
  .join("")

const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(set.alternateName)} — ${esc(set.name)}</title>
<meta name="description" content="${esc(set.description)}">
<!-- The same object the page is generated from, for anything that reads
     structured data. Person and machine cannot drift apart this way. -->
<script type="application/ld+json">
${JSON.stringify(set, null, 2)}
</script>
<style>
/* REHAB brand guideline (1448): Cloud Dancer surface, Rich Black ink,
   Mystic Navy primary, Dark Ruby accent. Same tokens as the app, restated
   here because this page has to stand alone with no build step. */
@font-face {
  font-family: "The Year of Handicrafts";
  src: url("../public/fonts/TheYearofHandicrafts-Regular.otf") format("opentype");
  font-weight: 400; font-display: swap;
}
@font-face {
  font-family: "The Year of Handicrafts";
  src: url("../public/fonts/TheYearofHandicrafts-Bold.otf") format("opentype");
  font-weight: 700; font-display: swap;
}
:root {
  --page: #f1f0ec;      /* Cloud Dancer */
  --ink: #0a0a0a;       /* Rich Black */
  --raised: #ffffff;
  --sunken: #f6f5f1;
  --line: #e4e2da;
  --navy: #13273f;      /* Mystic Navy */
  --navy-deep: #0f1f33;
  --navy-soft: color-mix(in srgb, #13273f 12%, white);
  --ruby: #70000e;      /* Dark Ruby */
  --ruby-soft: color-mix(in srgb, #70000e 10%, white);
  --muted: #5c594f;
  --elev-1: 0 1px 2px -1px hsl(213 53% 16% / .10), 0 1px 3px 0 hsl(213 53% 16% / .06);
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  background: var(--page);
  color: var(--ink);
  font-family: "The Year of Handicrafts", "Segoe UI", Tahoma, system-ui, sans-serif;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
.wrap { max-width: 62rem; margin-inline: auto; padding: 0 1.25rem 5rem; }

/* ── masthead ─────────────────────────────────────────────────── */
.masthead {
  background: var(--navy);
  color: var(--page);
  padding: 2.5rem 0 2rem;
  margin-bottom: 2rem;
  position: relative;
  overflow: hidden;
}
/* The identity's diamond motif, faint enough to read as woven paper. */
.masthead::before {
  content: ""; position: absolute; inset: 0; opacity: .07;
  background-image:
    repeating-linear-gradient(45deg, #fff 0 2px, transparent 2px 26px),
    repeating-linear-gradient(-45deg, #fff 0 2px, transparent 2px 26px);
}
.masthead > * { position: relative; }
.masthead h1 { margin: 0; font-size: 1.65rem; letter-spacing: -.01em; }
.masthead .en { margin: .15rem 0 0; opacity: .75; font-size: .95rem; }
.masthead .lede { margin: 1rem 0 0; max-width: 46rem; opacity: .88; font-size: .95rem; }
.masthead .hint { font-size: .85rem; opacity: .7; margin-top: .5rem; }
.rule { height: 3px; background: linear-gradient(to left, var(--navy), var(--ruby) 55%, var(--navy)); }

/* ── contents ─────────────────────────────────────────────────── */
nav.toc { margin: 0 0 2.5rem; }
nav.toc ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: .5rem; }
nav.toc a {
  display: inline-flex; align-items: center; gap: .5rem;
  padding: .4rem .85rem; border: 1px solid var(--line); border-radius: 999px;
  background: var(--raised); color: var(--ink); text-decoration: none; font-size: .85rem;
}
nav.toc a:hover { background: var(--navy-soft); border-color: var(--navy); }
nav.toc .count {
  font-size: .7rem; color: var(--muted); font-variant-numeric: tabular-nums;
}

/* ── groups ───────────────────────────────────────────────────── */
.group { margin-bottom: 2.75rem; scroll-margin-top: 1rem; }
.group-head { border-bottom: 2px solid var(--navy); padding-bottom: .5rem; margin-bottom: 1.25rem; }
.group-head h2 { margin: 0; font-size: 1.2rem; }
.group-head .en { margin: 0; font-size: .8rem; color: var(--muted); }
.group-head .blurb { margin: .45rem 0 0; font-size: .85rem; color: var(--muted); }
#g-out-of-scope .group-head { border-bottom-color: var(--muted); }

.terms { display: grid; gap: .85rem; }
@media (min-width: 52rem) { .terms { grid-template-columns: 1fr 1fr; } }

.term {
  background: var(--raised); border: 1px solid var(--line); border-radius: .75rem;
  padding: .95rem 1.05rem; box-shadow: var(--elev-1);
  scroll-margin-top: 1rem;
}
.term-head { display: flex; align-items: baseline; gap: .6rem; flex-wrap: wrap; }
.term-head h3 { margin: 0; font-size: 1.02rem; }
.term-head .en {
  margin: 0; font-size: .78rem; color: var(--muted);
  border-inline-start: 2px solid var(--line); padding-inline-start: .6rem;
}
.desc { margin: .5rem 0 0; font-size: .9rem; }
.note {
  margin: .6rem 0 0; font-size: .82rem; line-height: 1.6;
  background: var(--ruby-soft); color: #4f000a;
  border-radius: .5rem; padding: .5rem .7rem;
}
.source { margin: .7rem 0 0; font-size: .76rem; color: var(--muted); }
.source span {
  display: inline-block; margin-inline-end: .4rem;
  background: var(--sunken); border: 1px solid var(--line);
  border-radius: .3rem; padding: .05em .45em; font-size: .95em;
}
code {
  font-family: ui-monospace, "Cascadia Mono", Consolas, monospace;
  font-size: .92em; background: var(--sunken);
  border: 1px solid var(--line); border-radius: .3rem; padding: .05em .3em;
  /* Latin inside an Arabic run — isolate it so surrounding punctuation
     does not get pulled to the wrong end of the line. */
  unicode-bidi: isolate; direction: ltr;
}

footer {
  margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid var(--line);
  font-size: .8rem; color: var(--muted);
}
footer code { background: transparent; border: 0; padding: 0; }

@media print {
  body { background: #fff; }
  .masthead { background: #fff; color: var(--ink); padding-top: 0; }
  .masthead::before { display: none; }
  nav.toc { display: none; }
  .term { break-inside: avoid; box-shadow: none; }
  .terms { grid-template-columns: 1fr 1fr; }
}
</style>
</head>
<body>
  <div class="rule"></div>
  <header class="masthead">
    <div class="wrap">
      <h1>${esc(set.alternateName)}</h1>
      <p class="en" lang="en" dir="ltr">${esc(set.name)}</p>
      <p class="lede" dir="auto">${esc(set.description)}</p>
      <p class="lede hint">الاسم الإنجليزي المرافق لكل مصطلح هو المرجع المعتمد — إن اختلفت التسمية العربية بين الناس، فالمقابل الإنجليزي هو الفيصل.</p>
    </div>
  </header>

  <main class="wrap">
    <nav class="toc" aria-label="المحتويات"><ul>${toc}</ul></nav>
${GROUPS.map(section).join("")}
    <footer>
      <p dir="auto">${terms.length} مصطلحًا. مولّدة من <code>docs/glossary.json</code> عبر <code>pnpm glossary</code> — لا تُحرَّر هذه الصفحة يدويًا، بل يُحرَّر ملف المصطلحات ثم يُعاد التوليد.</p>
    </footer>
  </main>
</body>
</html>
`

writeFileSync(OUT, html, "utf-8")

const counts = GROUPS.map((g) => `${g.id} ${(byGroup.get(g.id) ?? []).length}`).join(" · ")
console.log(`${SRC} → ${OUT}`)
console.log(`  ${terms.length} terms — ${counts}`)
const unknown = [...byGroup.keys()].filter((k) => !GROUPS.some((g) => g.id === k))
if (unknown.length) console.error(`  WARNING: terms in unlisted groups: ${unknown.join(", ")}`)
