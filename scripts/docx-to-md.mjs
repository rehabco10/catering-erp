import { readFileSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

/**
 * .docx → Markdown, preserving tables.
 *
 *   node scripts/docx-to-md.mjs "docs/file.docx" .extract/file.md
 *
 * A docx is a zip whose `word/document.xml` is the content. There is no
 * dependency for this on purpose: the only structures that matter here are
 * paragraphs, runs, and tables, and pulling in a parser to read three tag
 * names would cost more than it saves.
 *
 * Formatting kept: paragraph breaks, bold runs, tables (as GFM), and list
 * indentation. Everything else — fonts, colours, images — is dropped, because
 * the point is to read the *content* into the codebase, not to reproduce the
 * document.
 */

const [src, dest] = process.argv.slice(2)
if (!src || !dest) {
  console.error('usage: node scripts/docx-to-md.mjs "in.docx" "out.md"')
  process.exit(2)
}

// `tar` on Windows 10+ reads zips; avoids assuming PowerShell or unzip.
const xml = (() => {
  try {
    return execFileSync("python", ["-c", XTRACT(src)], { encoding: "utf-8", maxBuffer: 64e6 })
  } catch {
    console.error("could not read the docx (needs python for zip extraction)")
    process.exit(1)
  }
})()

function XTRACT(path) {
  return [
    "import zipfile,sys,io",
    "sys.stdout.reconfigure(encoding='utf-8')",
    `print(zipfile.ZipFile(r'''${path}''').read('word/document.xml').decode('utf-8'))`,
  ].join("\n")
}

const decode = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")

/** Text of one `<w:p>`, with bold runs marked and tabs/breaks preserved. */
function paragraphText(p) {
  let out = ""
  const runRe = /<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g
  let m
  while ((m = runRe.exec(p))) {
    const run = m[1]
    const bold = /<w:b\/>|<w:b\s[^>]*\/>/.test(run)
    let text = ""
    for (const t of run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)) text += decode(t[1])
    text = text.replace(/<w:tab\/>/g, "\t")
    if (/<w:br\/>/.test(run)) text += "\n"
    if (!text) continue
    // Word splits a phrase across runs and the spaces belong to whichever run
    // happens to hold them. Trimming inside the bold markers therefore welds
    // words together — «الباقة الأولى» came out «الباقةالأولى». Keep the
    // padding outside the markers instead of discarding it.
    if (bold && text.trim()) {
      const [, lead, body, tail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)
      out += `${lead}**${body}**${tail}`
    } else {
      out += text
    }
  }
  // Heading level, if Word tagged one.
  const style = /<w:pStyle w:val="(Heading|heading)(\d)"/.exec(p)
  const trimmed = out.trim()
  if (!trimmed) return ""
  if (style) return `${"#".repeat(Math.min(6, Number(style[2]) + 1))} ${trimmed.replace(/\*\*/g, "")}`
  if (/<w:numPr>/.test(p)) return `- ${trimmed}`
  return trimmed
}

/** One `<w:tbl>` as a GFM table. */
function tableMd(tbl) {
  const rows = []
  for (const tr of tbl.matchAll(/<w:tr(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g)) {
    const cells = []
    for (const tc of tr[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)) {
      const paras = [...tc[1].matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)]
        .map((p) => paragraphText(p[1]).replace(/^#+\s*/, ""))
        .filter(Boolean)
      cells.push(paras.join("<br>").replace(/\|/g, "\\|").trim())
    }
    if (cells.length) rows.push(cells)
  }
  if (!rows.length) return ""
  const width = Math.max(...rows.map((r) => r.length))
  const pad = (r) => [...r, ...Array(width - r.length).fill("")]
  const lines = [
    `| ${pad(rows[0]).join(" | ")} |`,
    `| ${Array(width).fill("---").join(" | ")} |`,
    ...rows.slice(1).map((r) => `| ${pad(r).join(" | ")} |`),
  ]
  return lines.join("\n")
}

// Walk body children in order so tables land where they belong.
const body = /<w:body>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml
const blocks = []
const blockRe = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g
let b
while ((b = blockRe.exec(body))) {
  const chunk = b[0]
  if (chunk.startsWith("<w:tbl>")) {
    const md = tableMd(chunk)
    if (md) blocks.push(md)
  } else {
    const text = paragraphText(chunk)
    if (text) blocks.push(text)
  }
}

writeFileSync(dest, blocks.join("\n\n") + "\n", "utf-8")
console.log(`${src}\n  → ${dest}\n  ${blocks.length} blocks, ${readFileSync(dest, "utf-8").length} chars`)
