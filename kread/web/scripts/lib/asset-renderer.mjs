// Asset renderer — pre-renders UI text/icon bitmaps at highest quality.
//
// Pipeline: Verdana font → @napi-rs/canvas (Skia) → gamma quantize → 2-bit planes → .kp
//
// This is the ONLY place text gets rendered. Both web emulator and firmware
// consume the output bitmaps — neither renders text at runtime.

import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { canvasToPortraitPlanes, encodePlanes, encodePlanesRaw, pixelsToPortraitPlanes, encodeKpV2 } from '../../src/lib/eink/index.js'
import { quantizeGamma } from '../../src/lib/eink/quantize.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fontsDir = resolve(__dirname, '../../public/fonts')

// Register fonts (Skia backend — full hinting + AA)
// UI font: Verdana (pre-installed, excellent hinting at all sizes)
GlobalFonts.registerFromPath(resolve(fontsDir, 'Verdana-Regular.ttf'), 'Verdana')
GlobalFonts.registerFromPath(resolve(fontsDir, 'Verdana-Bold.ttf'), 'Verdana')

/**
 * Build CSS font string from definitions font entry.
 * @param {{ family: string, size: number, weight?: string }} fontDef
 * @returns {string} CSS font string for canvas
 */
export function fontCSS(fontDef) {
  const weight = fontDef.weight === 'bold' ? 'bold ' : ''
  return `${weight}${fontDef.size}px ${fontDef.family}`
}

/**
 * Render a text asset to 2-bit bitmap planes.
 *
 * @param {object} opts
 * @param {string} opts.text — text to render
 * @param {object} opts.fontDef — font definition { family, size, weight? }
 * @param {number} opts.w — container width
 * @param {number} opts.h — container height
 * @param {string} [opts.align='left'] — 'left'|'center'|'right'
 * @param {object} [opts.icon] — { name, pos } inline icon
 * @param {number} [opts.gamma=1.8]
 * @returns {{ bw, gs, width, height, pixels }}
 */
export function renderTextAsset(opts) {
  const { text, fontDef, w, h, align = 'left', icon = null, icons = null, padLeft = 0, gamma = 1.8 } = opts

  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')

  // White background
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)

  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  ctx.font = fontCSS(fontDef)
  ctx.textBaseline = 'middle'

  const gap = 4
  const textY = h / 2

  if (icons && icons.length === 2 && text) {
    // Dual icons (e.g., ◁▷ Page) — two small triangles + text, all centered
    const iconSize = Math.round(fontDef.size * 0.5)
    const iconGap = 3  // gap between the two icons (2px white + 1px breathing)
    const textW = ctx.measureText(text).width
    const iconsW = iconSize * 2 + iconGap
    const totalW = iconsW + gap + textW
    const startX = Math.round((w - totalW) / 2)
    const iconY = Math.floor((h - iconSize) / 2)
    drawTriangleIcon(ctx, icons[0], startX, iconY, iconSize)
    drawTriangleIcon(ctx, icons[1], startX + iconSize + iconGap, iconY, iconSize)
    ctx.fillStyle = '#000'
    ctx.fillText(text, startX + iconsW + gap, textY)
  } else if (icon && text) {
    // Single icon + text, centered as unit
    const iconSize = Math.round(fontDef.size * 0.55)
    const textW = ctx.measureText(text).width
    const totalW = iconSize + gap + textW
    const startX = Math.round((w - totalW) / 2)
    const iconY = Math.floor((h - iconSize) / 2)
    drawTriangleIcon(ctx, icon.name, startX, iconY, iconSize)
    ctx.fillStyle = '#000'
    ctx.fillText(text, startX + iconSize + gap, textY)
  } else if (icon) {
    const iconSize = Math.round(fontDef.size * 0.55)
    const iconX = Math.round((w - iconSize) / 2)
    const iconY = Math.floor((h - iconSize) / 2)
    drawTriangleIcon(ctx, icon.name, iconX, iconY, iconSize)
  } else if (text) {
    const textW = ctx.measureText(text).width
    let x = padLeft
    if (align === 'center') x = Math.round((w - textW) / 2)
    else if (align === 'right') x = Math.round(w - textW - gap)
    ctx.fillStyle = '#000'
    ctx.fillText(text, x, textY)
  }

  // Quantize with gamma correction → 2-bit levels
  const imageData = ctx.getImageData(0, 0, w, h)
  const pixels = quantizeGamma(imageData.data, w, h, gamma)

  // Pack into BW/GS planes (portrait, no rotation — for small UI assets)
  const { bw, gs } = pixelsToPortraitPlanes(pixels, w, h)
  return { bw, gs, width: w, height: h, pixels }
}

/**
 * Render a dynamic component frame (battery, progress bar, arrow).
 */
export function renderDynamicFrame(opts) {
  const { drawFn, w, h, gamma = 1.8 } = opts

  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'

  drawFn(ctx, w, h)

  const imageData = ctx.getImageData(0, 0, w, h)
  const pixels = quantizeGamma(imageData.data, w, h, gamma)
  const { bw, gs } = pixelsToPortraitPlanes(pixels, w, h)
  return { bw, gs, width: w, height: h, pixels }
}

/**
 * Encode planes into .kp binary (LZ4 compressed — for firmware).
 */
export function encodeKp(bw, gs, width, height) {
  return Buffer.from(encodePlanes(bw, gs, width, height))
}

/**
 * Encode planes into .kp binary (uncompressed — for web emulator).
 */
export function encodeKpRaw(bw, gs, width, height) {
  return Buffer.from(encodeKpV2({ width, height, bitDepth: 2, contentFlags: 0x01, compress: false, bw, gs }))
}

// ─── Triangle icon drawing ──────────────────────────────────

function drawTriangleIcon(ctx, name, x, y, size) {
  const tri = parseTriName(name)
  if (!tri) return

  const cx = x + size / 2
  const cy = y + size / 2
  const half = size / 2

  ctx.save()
  ctx.beginPath()
  switch (tri.direction) {
    case 'left':
      ctx.moveTo(cx - half, cy); ctx.lineTo(cx + half, cy - half); ctx.lineTo(cx + half, cy + half); break
    case 'right':
      ctx.moveTo(cx + half, cy); ctx.lineTo(cx - half, cy - half); ctx.lineTo(cx - half, cy + half); break
    case 'up':
      ctx.moveTo(cx, cy - half); ctx.lineTo(cx - half, cy + half); ctx.lineTo(cx + half, cy + half); break
    case 'down':
      ctx.moveTo(cx, cy + half); ctx.lineTo(cx - half, cy - half); ctx.lineTo(cx + half, cy - half); break
  }
  ctx.closePath()
  if (tri.filled) { ctx.fillStyle = '#000'; ctx.fill() }
  else { ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke() }
  ctx.restore()
}

function parseTriName(name) {
  const m = name.match(/^tri_(\w+?)_(filled|hollow)$/)
  if (!m) return null
  return { direction: m[1], filled: m[2] === 'filled' }
}
