import { defineConfig } from "vite"

export default defineConfig({
  resolve: {
    alias: {
      "@bc-grid/animations": new URL("../../packages/animations/src/index.ts", import.meta.url)
        .pathname,
    },
  },
  server: { port: 5175 },
  preview: { port: 4175 },
})
