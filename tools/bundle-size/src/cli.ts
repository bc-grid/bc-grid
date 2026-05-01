import { checkBundleSize, formatBundleSizeReport, hasBundleSizeFailure } from "./bundleSize"
import { bundleSizeManifest } from "./manifest"

const result = checkBundleSize(bundleSizeManifest)
const report = formatBundleSizeReport(result)

if (hasBundleSizeFailure(result)) {
  console.error(report)
  process.exitCode = 1
} else {
  console.log(report)
}
