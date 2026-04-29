import { checkBundleSize, formatBundleSizeReport, hasBundleSizeDrift } from "./bundleSize"
import { bundleSizeManifest } from "./manifest"

const result = checkBundleSize(bundleSizeManifest)
const report = formatBundleSizeReport(result)

if (hasBundleSizeDrift(result)) {
  console.error(report)
  process.exitCode = 1
} else {
  console.log(report)
}
