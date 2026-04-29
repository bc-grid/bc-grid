import { defineConfig } from "vite"

export default defineConfig({
  resolve: {
    alias: {
      "@bc-grid/virtualizer": new URL("../../packages/virtualizer/src/index.ts", import.meta.url)
        .pathname,
    },
  },
  server: { port: 5174 },
  preview: { port: 4174 },
})
