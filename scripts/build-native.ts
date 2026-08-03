#!/usr/bin/env bun
/**
 * Native standalone build — produces a single self-contained executable via
 * `bun build --compile` (Bun.build({ compile: true })), plus a "sidecar"
 * vendor/ directory of platform binaries that cannot be inlined into the
 * executable (the ripgrep executable; native .node addons like audio-capture).
 *
 * Layout generated:
 *
 *   dist-native/
 *     claude-code | claude-code.exe      # compiled executable
 *     vendor/
 *       ripgrep/<arch>-<platform>/rg      # sidecar rg (spawned)
 *       audio-capture/<arch>-<platform>/audio-capture.node
 *
 * The executable resolves its vendor directory from its own location
 * (process.execPath), see src/utils/distRoot.ts (bundled-mode fallback),
 * src/utils/ripgrep.ts and packages/audio-capture-napi/src/index.ts.
 */
import { existsSync } from 'node:fs'
import { chmod, cp, mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getMacroDefines, DEFAULT_BUILD_FEATURES } from './defines.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')

const outdir = 'dist-native'
const exeName = process.platform === 'win32' ? 'claude-code.exe' : 'claude-code'
const outfile = join(projectRoot, outdir, exeName)

// Collect FEATURE_* env vars → Bun.build features (same mechanism as build.ts).
const envFeatures = Object.keys(process.env)
  .filter(k => k.startsWith('FEATURE_'))
  .map(k => k.replace('FEATURE_', ''))
const features = [...new Set([...DEFAULT_BUILD_FEATURES, ...envFeatures])]

async function main(): Promise<void> {
  // Fresh output directory.
  await rm(outdir, { recursive: true, force: true })
  await mkdir(outdir, { recursive: true })

  // Compile the standalone executable. NB: on `compile`, Bun names the artifact
  // after the entrypoint basename (e.g. `cli`) and ignores `outfile`/`outdir`,
  // emitting it into the CWD. We relocate it from `outputs[0].path` below.
  const result = await Bun.build({
    entrypoints: [join(projectRoot, 'src/entrypoints/cli.tsx')],
    target: 'bun',
    compile: true,
    define: {
      ...getMacroDefines(),
      // React production mode — mirrors build.ts.
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
    features,
  })

  if (!result.success) {
    console.error('Native build failed:')
    for (const log of result.logs) {
      console.error(log)
    }
    process.exit(1)
  }

  const emitted = result.outputs[0]
  if (!emitted) {
    console.error('Native build produced no executable.')
    process.exit(1)
  }
  await rename(emitted.path, outfile)
  await chmod(outfile, 0o755)
  console.log(`Compiled standalone executable → ${outfile}`)

  // Sidecar vendor resources.
  // audio-capture: always present in the repo vendor/ directory.
  const audioCaptureDest = join(outdir, 'vendor', 'audio-capture')
  await cp(join(projectRoot, 'vendor', 'audio-capture'), audioCaptureDest, {
    recursive: true,
  })
  console.log(`Copied vendor/audio-capture/ → ${audioCaptureDest}/`)

  // ripgrep: NOT currently shipped in the repo. Surface a loud, actionable
  // warning instead of silently producing a binary that has no rg.
  const rgSrc = join(projectRoot, 'src/utils/vendor/ripgrep')
  const rgDest = join(outdir, 'vendor', 'ripgrep')
  if (existsSync(rgSrc)) {
    await cp(rgSrc, rgDest, { recursive: true })
    console.log(`Copied src/utils/vendor/ripgrep/ → ${rgDest}/`)
  } else {
    console.warn('[native] WARNING: src/utils/vendor/ripgrep/ does not exist.')
    console.warn('[native]   The binary will not ship a built-in ripgrep.')
    console.warn(
      '[native]   It falls back to a system `rg` (or reports "no ripgrep") unless',
    )
    console.warn(
      '[native]   you place a built rg into src/utils/vendor/ripgrep/<arch>-<platform>/rg and rebuild.',
    )
  }

  console.log(`\nNative build complete:\n  ${outfile}`)
  console.log(`  features: ${features.length} (${features.join(', ')})`)
  console.log(`  Run it with: ${join(outdir, exeName)} --version`)
}

await main()
