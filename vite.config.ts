import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { fileURLToPath, URL } from "node:url"

/**
 * `--mode staging` builds a copy that lives under `/stagging/` instead of the
 * domain root, into its own `dist-stage/` so the two outputs never overwrite
 * each other. Everything downstream keys off Vite's `base`:
 *   - asset URLs in index.html and CSS are rewritten at build time,
 *   - the router mounts at `import.meta.env.BASE_URL` (see App.tsx),
 *   - JSX asset refs use BASE_URL (see NavRail) — Vite does NOT rewrite
 *     string literals inside components.
 */
export default defineConfig(({ mode }) => {
  const staging = mode === "staging"
  const base = process.env.BASE_PATH ?? (staging ? "/stagging/" : "/")
  return {
    base,
    plugins: [react(), tailwindcss()],
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
