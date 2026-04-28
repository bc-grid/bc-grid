import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: { resolve: true, entry: "src/index.ts" },
  sourcemap: true,
  clean: true,
  tsconfig: "tsconfig.build.json",
  bundle: true,
})
