#!/usr/bin/env node
// Generate all UI assets from definitions.yaml → .kp files
//
// Usage: node scripts/gen-ui-assets.mjs [--lang en|vi] [--out dir]
//
// Output: one .kp file per asset, organized by category.
// These are loaded by the web emulator and embedded in firmware.

import { readFileSync, mkdirSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parse } from 'yaml'
import { renderTextAsset, renderDynamicFrame, encodeKpRaw } from './lib/asset-renderer.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const defsPath = resolve(__dirname, '../resources/definitions.yaml')
const defs = parse(readFileSync(defsPath, 'utf-8'))

const args = process.argv.slice(2)
const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : 'en'
const outDir = args.includes('--out')
  ? resolve(args[args.indexOf('--out') + 1])
  : resolve(__dirname, '../resources/assets', lang)

mkdirSync(outDir, { recursive: true })

const { containers, fonts, assets, dynamic } = defs

let count = 0
let totalBytes = 0

// ─── Render text/icon assets ────────────────────────────────

for (const [key, def] of Object.entries(assets)) {
  const fontDef = fonts[def.font]
  if (!fontDef) {
    console.warn(`  SKIP ${key}: unknown font "${def.font}"`)
    continue
  }

  // Resolve text for language
  let text = ''
  if (typeof def.text === 'string') {
    text = def.text
  } else if (def.text) {
    text = def.text[lang] || def.text.en || ''
  }

  if (!text && !def.icon) {
    console.warn(`  SKIP ${key}: no text or icon`)
    continue
  }

  // Tight mode: auto-size container to exact glyph width
  let w, h
  if (def.tight) {
    const { createCanvas } = await import('@napi-rs/canvas')
    const measureCanvas = createCanvas(1, 1)
    const measureCtx = measureCanvas.getContext('2d')
    const weight = fontDef.weight === 'bold' ? 'bold ' : ''
    measureCtx.font = `${weight}${fontDef.size}px "${fontDef.family}"`
    w = Math.max(2, Math.ceil(measureCtx.measureText(text).width) + 1)
    h = Math.round(fontDef.size * 1.4)
  } else {
    const containerDef = containers[def.container]
    if (!containerDef) {
      console.warn(`  SKIP ${key}: unknown container "${def.container}"`)
      continue
    }
    w = containerDef.w
    h = containerDef.h
  }

  const result = renderTextAsset({
    text,
    fontDef,
    w,
    h,
    align: def.tight ? 'left' : (def.align || 'left'),
    icon: def.icon || null,
    icons: def.icons || null,
    padLeft: def.padLeft || 0,
  })

  const kp = encodeKpRaw(result.bw, result.gs, result.width, result.height)

  // Write file: key "help.read" → "help.read.kp"
  const filename = `${key}.kp`
  writeFileSync(resolve(outDir, filename), kp)
  count++
  totalBytes += kp.length
}

// ─── Render dynamic component frames ────────────────────────

const dynamicDrawers = {
  'battery.frame': (ctx, w, h) => {
    const pad = 1
    const tipW = 3, bw = w - pad * 2 - tipW, bh = h - pad * 2
    const x = pad, y = pad
    // Body outline — 2px stroke for visibility on e-ink
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.strokeRect(x + tipW, y, bw, bh)
    // Tip — centered vertically, 50% of body height
    ctx.fillStyle = '#000'
    const tipH = Math.round(bh * 0.5)
    const tipY = y + Math.round((bh - tipH) / 2)
    ctx.fillRect(x, tipY, tipW, tipH)
  },
  'progress.frame': (ctx, w, h) => {
    const pad = 1
    const r = defs.dynamic['progress.frame'].radius
    ctx.beginPath()
    ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, r)
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 2
    ctx.stroke()
  },
  'arrow.left': (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, half = (w - 2) / 2
    ctx.beginPath()
    ctx.moveTo(cx - half, cy); ctx.lineTo(cx + half, cy - half); ctx.lineTo(cx + half, cy + half)
    ctx.closePath()
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke()
  },
  'arrow.right': (ctx, w, h) => {
    const cx = w / 2, cy = h / 2, half = (w - 2) / 2
    ctx.beginPath()
    ctx.moveTo(cx + half, cy); ctx.lineTo(cx - half, cy - half); ctx.lineTo(cx - half, cy + half)
    ctx.closePath()
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke()
  },
}

for (const [key, def] of Object.entries(dynamic)) {
  const drawFn = dynamicDrawers[key]
  if (!drawFn) continue

  const result = renderDynamicFrame({ drawFn, w: def.w, h: def.h })
  const kp = encodeKpRaw(result.bw, result.gs, result.width, result.height)

  writeFileSync(resolve(outDir, `${key}.kp`), kp)
  count++
  totalBytes += kp.length
}

// ─── Render progress range (1% READ .. 99% READ) ───────────

if (defs.progress_range) {
  const pr = defs.progress_range
  const containerDef = containers[pr.container]
  const fontDef = fonts[pr.font]
  const [rangeStart, rangeEnd] = pr.range

  for (let n = rangeStart; n <= rangeEnd; n++) {
    const text = pr.template[lang].replace('{n}', n)
    const result = renderTextAsset({
      text,
      fontDef,
      w: containerDef.w,
      h: containerDef.h,
      align: 'center',
    })
    const kp = encodeKpRaw(result.bw, result.gs, result.width, result.height)
    writeFileSync(resolve(outDir, `progress.${n}.kp`), kp)
    count++
    totalBytes += kp.length
  }
}

console.log(`Generated ${count} assets (${(totalBytes / 1024).toFixed(1)} KB) → ${outDir}`)
