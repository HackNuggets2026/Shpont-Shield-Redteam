import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// The build lands inside the Python package, so `shield-redteam serve` ships the UI with no Node at runtime.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/app/",
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: { outDir: "../shield_redteam/server/static/app", emptyOutDir: true, chunkSizeWarningLimit: 900 },
  server: { proxy: { "/api": "http://127.0.0.1:8799", "/feed": "http://127.0.0.1:8799" } },
})
