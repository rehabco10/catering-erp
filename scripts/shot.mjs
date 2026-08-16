import { existsSync, mkdirSync } from "node:fs"
import puppeteer from "puppeteer-core"

/**
 * Headless render check.
 *
 * `pnpm typecheck` and `pnpm test` say the code is correct; neither says the
 * page paints. This does: it loads a route in real Chrome, fails on any console
 * error or unhandled rejection, and writes a screenshot to look at.
 *
 *   node scripts/shot.mjs "/menus?view=graph" menus-graph
 *   node scripts/shot.mjs "/en/inventory" inventory-en 1440 900
 *
 * Requires the dev server to be up (`pnpm dev`). Uses the installed Chrome
 * rather than downloading one — puppeteer-core, not puppeteer, on purpose.
 */

const CANDIDATES = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  `${process.env.LOCALAPPDATA ?? ""}\\Google\\Chrome\\Application\\chrome.exe`,
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]

const chrome = process.env.CHROME_PATH ?? CANDIDATES.find((p) => p && existsSync(p))
if (!chrome) {
  console.error("No Chrome found. Set CHROME_PATH to its executable.")
  process.exit(2)
}

const route = process.argv[2] ?? "/"
const name = process.argv[3] ?? "shot"
const width = Number(process.argv[4] ?? 1440)
const height = Number(process.argv[5] ?? 900)
const base = process.env.BASE_URL ?? "http://localhost:5181"

mkdirSync("screenshots", { recursive: true })

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--lang=ar", "--font-render-hinting=none"],
})
const page = await browser.newPage()
await page.setViewport({ width, height, deviceScaleFactor: 2 })

// Anything the page complains about is a failure, not a log line. A canvas that
// throws still renders a blank div, so "the screenshot looked fine" is not on
// its own evidence of anything.
const problems = []
page.on("console", (m) => {
  if (m.type() === "error") problems.push(`console: ${m.text()}`)
})
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`))
page.on("requestfailed", (r) => problems.push(`request failed: ${r.url()}`))

const url = `${base}${route}`
try {
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30_000 })
} catch (e) {
  console.error(`FAILED to load ${url}\n${e.message}`)
  await browser.close()
  process.exit(1)
}

// React Flow lays out on a rAF after mount, and fitView animates for ~420ms.
await new Promise((r) => setTimeout(r, 1200))

/**
 * Optional interaction before the shot: `CLICK="a,b"` clicks the first element
 * whose text contains each term, in order.
 *
 * Accordion state lives in memory, not the URL, so an expanded canvas is only
 * reachable by driving it — and an expanded canvas is exactly the state worth
 * checking, since that is where the node count explodes.
 */
for (const term of (process.env.CLICK ?? "").split(",").filter(Boolean)) {
  const hit = await page.evaluate((text) => {
    const els = [...document.querySelectorAll("button, [role=button], a")]
    const el = els.find((e) => e.textContent?.includes(text))
    if (!el) return false
    el.scrollIntoView()
    el.click()
    return true
  }, term.trim())
  if (!hit) problems.push(`click target not found: ${term.trim()}`)
  await new Promise((r) => setTimeout(r, 900))
}

const summary = await page.evaluate(() => {
  const text = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null
  return {
    title: document.title,
    lang: document.documentElement.lang,
    dir: document.documentElement.dir,
    h1: text("h1"),
    bodyChars: document.body.innerText.replace(/\s+/g, " ").trim().length,
    reactFlowNodes: document.querySelectorAll(".react-flow__node").length,
    reactFlowEdges: document.querySelectorAll(".react-flow__edge").length,
    navItems: document.querySelectorAll("nav a").length,
    // An untranslated key renders as its own dotted path.
    rawKeys: [...document.body.innerText.matchAll(/\b[a-z_]+\.[a-z_]{3,}\b/g)]
      .map((m) => m[0])
      .filter((k) => !k.includes(" "))
      .slice(0, 10),
  }
})

const file = `screenshots/${name}.png`
await page.screenshot({ path: file, fullPage: false })
await browser.close()

console.log(JSON.stringify({ url, ...summary }, null, 2))
console.log(`\nwrote ${file}`)

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`)
  for (const p of problems.slice(0, 20)) console.error(`  ${p}`)
  process.exit(1)
}
console.log("\nno console errors")
