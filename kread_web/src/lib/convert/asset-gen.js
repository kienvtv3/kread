// Book asset generator — pre-renders book-specific assets as .kp bitmaps.
//
// Assets: title, author, font name, cover image, chapter names.
// Uses @napi-rs/canvas (Skia) for text rendering, same quality path as UI assets.

import { createCanvas, GlobalFonts } from '@napi-rs/canvas'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { quantizeGamma } from '../eink/quantize.js'
import { pixelsToPortraitPlanes, encodeKpV2 } from '../eink/encoder.js'
import { imageToKp } from './image-to-kp.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fontsDir = resolve(__dirname, '../../../public/fonts')

// Register Verdana (always available for UI-style assets)
GlobalFonts.registerFromPath(resolve(fontsDir, 'Verdana-Regular.ttf'), 'Verdana')
GlobalFonts.registerFromPath(resolve(fontsDir, 'Verdana-Bold.ttf'), 'Verdana')

// ---------------------------------------------------------------------------
// Asset type constants (from .kb spec)
// ---------------------------------------------------------------------------

export const ASSET_FONT_NAME    = 0x00
export const ASSET_BOOK_TITLE   = 0x01
export const ASSET_BOOK_AUTHOR  = 0x02
export const ASSET_COVER        = 0x03
export const ASSET_CHAPTER_NAME = 0x04
export const ASSET_COVER_THUMB  = 0x05  // thumbnail for home screen (240×400 container)

// ---------------------------------------------------------------------------
// Font registration
// ---------------------------------------------------------------------------

const registeredFonts = new Set(['Verdana'])

/**
 * Register a book font if available in public/fonts/.
 * Tries .ttf, .otf, .woff2 extensions.
 */
function ensureFontRegistered(familyName) {
  if (registeredFonts.has(familyName)) return

  const extensions = ['.ttf', '.otf', '.woff2']
  const baseName = familyName.replace(/\s+/g, '')

  for (const ext of extensions) {
    const path = resolve(fontsDir, baseName + ext)
    if (existsSync(path)) {
      GlobalFonts.registerFromPath(path, familyName)
      registeredFonts.add(familyName)
      return
    }
  }

  // Also try with hyphens and original name
  for (const ext of extensions) {
    const path = resolve(fontsDir, familyName + ext)
    if (existsSync(path)) {
      GlobalFonts.registerFromPath(path, familyName)
      registeredFonts.add(familyName)
      return
    }
  }
}

// ---------------------------------------------------------------------------
// Text rendering helpers
// ---------------------------------------------------------------------------

/**
 * Render a single line of text to a .kp binary (2-bit grayscale).
 *
 * @param {string} text
 * @param {object} fontDef - { family, size, weight? }
 * @param {number} maxWidth - max width in pixels
 * @param {number} gamma
 * @returns {{ kpData: Uint8Array, width: number, height: number }}
 */
function renderSingleLine(text, fontDef, maxWidth, gamma) {
  // Measure first to get actual dimensions
  const measureCanvas = createCanvas(1, 1)
  const measureCtx = measureCanvas.getContext('2d')
  measureCtx.font = fontCSS(fontDef)

  const metrics = measureCtx.measureText(text)
  const textWidth = Math.ceil(metrics.width)
  const w = Math.min(textWidth + 4, maxWidth) // 2px padding each side
  const h = Math.round(fontDef.size * 1.4) // line height

  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#000'
  ctx.font = fontCSS(fontDef)
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 2, h / 2)

  // Grayscale only (bit_depth=2): gamma-corrected 4-level (preserves AA fringes)
  const imageData = ctx.getImageData(0, 0, w, h)
  const pixels = quantizeGamma(imageData.data, w, h, gamma)
  const { bw, gs } = pixelsToPortraitPlanes(pixels, w, h)
  const kpData = encodeKpV2({ width: w, height: h, bitDepth: 2, contentFlags: 0x01, compress: false, bw, gs })

  return { kpData: new Uint8Array(kpData), width: w, height: h }
}

/**
 * Render multi-line word-wrapped text to .kp (2-bit grayscale).
 *
 * @param {string} text
 * @param {object} fontDef - { family, size, weight? }
 * @param {number} containerWidth
 * @param {number} gamma
 * @returns {{ kpData: Uint8Array, width: number, height: number }}
 */
function renderWrappedText(text, fontDef, containerWidth, gamma, maxLines = 0) {
  const measureCanvas = createCanvas(1, 1)
  const measureCtx = measureCanvas.getContext('2d')
  measureCtx.font = fontCSS(fontDef)

  const lineSpacing = Math.round(fontDef.size * 1.4)
  const spaceWidth = measureCtx.measureText(' ').width
  const ellipsis = '...'
  const ellipsisWidth = measureCtx.measureText(ellipsis).width

  // Word wrap
  const words = text.split(/\s+/).filter(w => w.length > 0)
  const lines = []
  let currentLine = []
  let currentWidth = 0
  let truncated = false

  for (const word of words) {
    const wordWidth = measureCtx.measureText(word).width
    const newWidth = currentLine.length === 0
      ? wordWidth
      : currentWidth + spaceWidth + wordWidth

    if (newWidth > containerWidth && currentLine.length > 0) {
      lines.push(currentLine.join(' '))
      // Check if we hit max lines
      if (maxLines > 0 && lines.length >= maxLines) {
        truncated = true
        break
      }
      currentLine = [word]
      currentWidth = wordWidth
    } else {
      currentLine.push(word)
      currentWidth = newWidth
    }
  }
  if (!truncated && currentLine.length > 0) lines.push(currentLine.join(' '))
  if (lines.length === 0) lines.push('')

  // Truncate last line with "..." if needed
  if (truncated && lines.length > 0) {
    let lastLine = lines[lines.length - 1]
    while (measureCtx.measureText(lastLine + ellipsis).width > containerWidth && lastLine.length > 0) {
      lastLine = lastLine.slice(0, -1).trimEnd()
    }
    lines[lines.length - 1] = lastLine + ellipsis
  }

  // Render
  const w = containerWidth
  const h = lines.length * lineSpacing
  const canvas = createCanvas(w, h)
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#000'
  ctx.font = fontCSS(fontDef)
  ctx.textBaseline = 'middle'

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 0, i * lineSpacing + lineSpacing / 2)
  }

  // Grayscale only (bit_depth=2): gamma-corrected 4-level
  const imageData = ctx.getImageData(0, 0, w, h)
  const pixels = quantizeGamma(imageData.data, w, h, gamma)
  const { bw, gs } = pixelsToPortraitPlanes(pixels, w, h)
  const kpData = encodeKpV2({ width: w, height: h, bitDepth: 2, contentFlags: 0x01, compress: false, bw, gs })

  return { kpData: new Uint8Array(kpData), width: w, height: h }
}

/**
 * Build CSS font string.
 */
function fontCSS(fontDef) {
  const weight = fontDef.weight === 'bold' ? 'bold ' : ''
  return `${weight}${fontDef.size}px "${fontDef.family}"`
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Generate all book assets as .kp binaries.
 *
 * @param {object} meta
 * @param {string} meta.title — book title
 * @param {string} meta.author — author name
 * @param {string} meta.fontFamily — font used for rendering
 * @param {Array<{title: string}>} meta.chapters — chapter list
 * @param {string|Buffer} [meta.coverPath] — path to cover image
 * @param {object} [opts]
 * @param {number} [opts.titleWidth=424] — container width for title
 * @param {number} [opts.gamma=1.8]
 * @returns {Promise<Array<{type: number, index: number, kpData: Uint8Array, width: number, height: number}>>}
 */
export async function generateBookAssets(meta, opts = {}) {
  const {
    titleWidth = 424,
    gamma = 1.8,
  } = opts

  const { title, author, fontFamily, chapters = [], coverPath } = meta
  const assets = []

  // Register book body font if available
  if (fontFamily) {
    ensureFontRegistered(fontFamily)
  }

  // Use Atkinson for UI text, resolve the canvas family name
  const uiFamily = 'Verdana'

  // 1. ASSET_BOOK_TITLE — bold, word-wrapped, 2-bit grayscale
  if (title) {
    const fontDef = { family: uiFamily, size: 28, weight: 'bold' }
    const result = renderWrappedText(title, fontDef, titleWidth, gamma, 2)
    assets.push({
      type: ASSET_BOOK_TITLE,
      index: 0,
      kpData: result.kpData,
      width: result.width,
      height: result.height,
    })
  }

  // 2. ASSET_BOOK_AUTHOR — smaller, single line, uppercase, 2-bit grayscale
  if (author) {
    const fontDef = { family: uiFamily, size: 20 }
    const result = renderSingleLine(author.toUpperCase(), fontDef, titleWidth, gamma)
    assets.push({
      type: ASSET_BOOK_AUTHOR,
      index: 0,
      kpData: result.kpData,
      width: result.width,
      height: result.height,
    })
  }

  // 3. ASSET_FONT_NAME — small font, single line, 2-bit grayscale
  if (fontFamily) {
    const fontDef = { family: uiFamily, size: 16 }
    const result = renderSingleLine(fontFamily, fontDef, titleWidth, gamma)
    assets.push({
      type: ASSET_FONT_NAME,
      index: 0,
      kpData: result.kpData,
      width: result.width,
      height: result.height,
    })
  }

  // 4. ASSET_COVER — grayscale cover image, 2-bit, full page
  if (coverPath) {
    const kpData = await imageToKp(coverPath, {
      width: 480,
      height: 800,
      bitDepth: 2,
      dither: 'atkinson',
      gamma,
      contentFlags: 0x02,
      fit: 'contain',
    })
    assets.push({
      type: ASSET_COVER,
      index: 0,
      kpData: new Uint8Array(kpData),
      width: 480,
      height: 800,
    })
  }

  // 5. ASSET_COVER_THUMB — thumbnail for home screen (240×400 container)
  // Cover image scaled to fit inside container, maintaining aspect ratio
  if (coverPath) {
    const kpData = await imageToKp(coverPath, {
      width: 300,
      height: 400,
      bitDepth: 2,
      dither: 'atkinson',
      gamma,
      contentFlags: 0x02,
      fit: 'contain',
    })
    assets.push({
      type: ASSET_COVER_THUMB,
      index: 0,
      kpData: new Uint8Array(kpData),
      width: 240,
      height: 400,
    })
  }

  // 6. ASSET_CHAPTER_NAME — one per chapter, single line, 2-bit grayscale
  for (let i = 0; i < chapters.length; i++) {
    const chapterTitle = chapters[i].title
    if (!chapterTitle) continue

    const fontDef = { family: uiFamily, size: 20 }
    const result = renderSingleLine(chapterTitle, fontDef, titleWidth, gamma)
    assets.push({
      type: ASSET_CHAPTER_NAME,
      index: i,
      kpData: result.kpData,
      width: result.width,
      height: result.height,
    })
  }

  return assets
}
