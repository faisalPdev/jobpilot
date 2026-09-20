// Bundles the TS smoke test with the esbuild that ships inside Vite, then runs it.
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const out = path.join(mkdtempSync(path.join(tmpdir(), 'jobpilot-smoke-')), 'smoke.mjs')

await build({
  entryPoints: ['scripts/smoke.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: out,
  logLevel: 'warning',
})

await import(pathToFileURL(out).href)
