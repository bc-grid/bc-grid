import { URL, fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@bc-grid/core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@bc-grid/react": fileURLToPath(
        new URL("../../packages/react/src/index.tsx", import.meta.url),
      ),
      "@bc-grid/theming/styles.css": fileURLToPath(
        new URL("../../packages/theming/src/styles.css", import.meta.url),
      ),
      "@bc-grid/virtualizer": fileURLToPath(
        new URL("../../packages/virtualizer/src/index.ts", import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
  },
  preview: {
    port: 4173,
  },
})
