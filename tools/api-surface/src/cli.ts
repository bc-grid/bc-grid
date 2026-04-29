import { checkApiSurface, formatApiSurfaceReport, hasApiSurfaceDrift } from "./apiSurface"
import { apiSurfaceManifest } from "./manifest"

const results = checkApiSurface(apiSurfaceManifest)
const report = formatApiSurfaceReport(results)

if (hasApiSurfaceDrift(results)) {
  console.error(report)
  process.exitCode = 1
} else {
  console.log(report)
}
