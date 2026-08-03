import { fileURLToPath } from 'url'
import * as path from 'path'
import { isInBundledMode } from './bundledMode.js'

/**
 * Resolve the dist directory root from the current module's location.
 *
 * Works across all build layouts:
 * - Single-file: dist/cli.js → dist/
 * - Code-split:  dist/chunks/chunk-xxx.js → dist/
 * - Dev mode:    src/utils/distRoot.ts → <project_root>/
 *
 * Bun standalone binary (`bun build --compile`): `import.meta.url` points into
 * the virtual `$bunfs` filesystem and carries no real directory structure, so
 * we resolve resources relative to the running executable. In that layout the
 * sidecar resources live in `<exeDir>/vendor/...`, making `process.execPath`'s
 * directory the effective root.
 */
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const distRoot = (() => {
  if (isInBundledMode()) {
    return path.dirname(process.execPath)
  }
  const parts = __dirname.split(path.sep)
  const distIdx = parts.lastIndexOf('dist')
  if (distIdx !== -1) {
    return parts.slice(0, distIdx + 1).join(path.sep)
  }
  // Dev mode: from src/utils/ → project root
  const srcIdx = parts.lastIndexOf('src')
  if (srcIdx !== -1) {
    return parts.slice(0, srcIdx).join(path.sep)
  }
  return __dirname
})()

export { distRoot }
