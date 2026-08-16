import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { copyFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath, URL } from "node:url"

/**
 * A static host has no file behind `/catering-erp/menus`, so a deep link or a
 * refresh 404s before the router ever runs. GitHub Pages serves `404.html` for
 * any miss, and an exact copy of the entry hands the URL to React Router the
 * same way the root would. Emitted by the build so every output has it, not
 * only the one the CI workflow happens to produce.
 */
function spaFallback(): Plugin {
  return {
    name: "spa-fallback",
    apply: "build",
    writeBundle({ dir }) {
      const index = dir && join(dir, "index.html")
      if (index && existsSync(index)) copyFileSync(index, join(dir!, "404.html"))
    },
  }
}

/**
 * The app is served from a sub-path, not a domain root: GitHub Pages puts a
 * project site under `/<repo>/`. `--mode staging` builds a second copy beside
 * it, into its own `dist-stage/` so the two outputs never overwrite each
 * other. `BASE_PATH` overrides both, for a host that mounts it elsewhere.
 *
 * Everything downstream keys off Vite's `base`:
 *   - asset URLs in index.html and CSS are rewritten at build time,
 *   - the router mounts at `import.meta.env.BASE_URL` (see App.tsx),
 *   - the locale prefix is read *after* stripping it (see i18n/locale.ts),
 *   - JSX asset refs use BASE_URL (see NavRail) — Vite does NOT rewrite
 *     string literals inside components.
 */
export default defineConfig(({ mode }) => {
  const staging = mode === "staging"
  const base = process.env.BASE_PATH ?? (staging ? "/catering-erp/stagging/" : "/catering-erp/")
  return {
    base,
    plugins: [react(), tailwindcss(), spaFallback()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
      // A second copy of React makes every hook throw "Invalid hook call".
      // Base UI peer-depends on it, so pin resolution to one copy.
      dedupe: ["react", "react-dom"],
    },
    build: {
      outDir: staging ? "dist-stage" : "dist",
    },
    optimizeDeps: {
      // Pre-bundle these up front. Discovering them mid-session triggers a
      // re-optimize + full reload, and the page can briefly hold two Reacts
      // while that happens.
      include: [
        "react",
        "react-dom",
        "react-dom/client",
        "@base-ui/react/dialog",
        "valtio",
        "zod",
        "lucide-react",
        "class-variance-authority",
        "clsx",
        "tailwind-merge",
      ],
    },
    server: {
      port: 5181,
      watch: { ignored: ["**/dist/**", "**/dist-stage/**"] },
    },
  }
})
