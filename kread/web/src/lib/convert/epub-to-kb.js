// EPUB → .kb conversion pipeline
//
// Combines epub parser, page renderer, asset generator, and kb builder
// into a single function that takes raw EPUB data and returns a .kb binary.

import { parseHTML } from 'linkedom'

// Polyfill DOMParser for Node (epub.js uses browser-only DOMParser)
if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = class DOMParser {
    parseFromString(str, type) {
      const { document } = parseHTML(str)
      return document
    }
  }
}

import { parseEpub, extractText } from '../epub.js'
import { renderPages, registerFont } from './page-renderer.js'
import { generateBookAssets } from './asset-gen.js'
import { buildKb } from './kb-builder.js'
import { pixelsToLandscapePlanes, encodePlanesRaw } from '../eink/encoder.js'
import { quantizeGamma } from '../eink/quantize.js'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fontsDir = resolve(__dirname, '../../../public/fonts')

// Font size mappings
const SIZE_TO_PX = { '8pt': 16, '10pt': 20, '11pt': 22, '12pt': 24, '14pt': 28 }
const SIZE_TO_IDX = { '8pt': 0, '10pt': 1, '11pt': 2, '12pt': 3, '14pt': 4 }

const PAGE_WIDTH = 480
const PAGE_HEIGHT = 800
const BATCH_SIZE = 50

/**
 * Convert EPUB to .kb binary.
 *
 * @param {ArrayBuffer|Buffer} epubData — raw EPUB file
 * @param {object} config
 * @param {string} [config.bodyFont='Roboto Slab'] — body font (user-selected, from Google Fonts)
 * @param {string} [config.uiFont='Verdana'] — UI font for footer/chapter names (always Verdana)
 * @param {string} [config.fontSize='11pt'] — 8pt|10pt|11pt|12pt|14pt
 * @param {string} [config.orientation='portrait']
 * @param {string} [config.mode='light']
 * @param {number} [config.gamma=1.8]
 * @param {string} [config.align='left'] — left|justify|center|right
 * @param {boolean} [config.pageNumbers=true]
 * @param {string} [config.coverPath] — override cover image
 * @param {function} [config.onProgress] — callback(percent, message)
 * @returns {Promise<Uint8Array>} .kb file
 */
export async function convertEpubToKb(epubData, config = {}) {
  const {
    bodyFont = 'Roboto Slab',
    uiFont = 'Verdana',
    fontSize = '11pt',
    orientation = 'portrait',
    mode = 'light',
    gamma = 1.8,
    align = 'left',
    pageNumbers = true,
    coverPath,
    onProgress,
  } = config

  const progress = onProgress || (() => {})

  // --- Step 1: Parse EPUB ---
  progress(5, 'Parsing EPUB...')
  const epub = await parseEpub(epubData)
  const { title, author, chapters } = epub

  // --- Step 2: Extract text from all chapters ---
  progress(10, 'Extracting text...')
  const allParagraphs = []
  const chapterStartIndices = [] // paragraph index where each chapter begins

  for (const chapter of chapters) {
    chapterStartIndices.push(allParagraphs.length)
    // Prepend chapter title as h1
    if (chapter.title) {
      allParagraphs.push({ text: chapter.title, tag: 'h1' })
    }
    const paras = extractText(chapter.html)
    for (const p of paras) {
      if (p.startsWith('# ')) {
        allParagraphs.push({ text: p.slice(2), tag: 'h1' })
      } else {
        allParagraphs.push(p)
      }
    }
  }

  // --- Step 3: Register font ---
  progress(15, 'Registering fonts...')
  // Register body font (user-selected)
  const fontBaseName = bodyFont.replace(/\s+/g, '')
  const extensions = ['.ttf', '.otf', '.woff2']
  for (const ext of extensions) {
    const fontPath = resolve(fontsDir, fontBaseName + ext)
    try {
      registerFont(fontPath, bodyFont)
      break
    } catch {
      // Try next extension
    }
  }
  // Register UI font (always Verdana for footer)
  try {
    registerFont(resolve(fontsDir, 'Verdana-Regular.ttf'), 'Verdana')
    registerFont(resolve(fontsDir, 'Verdana-Bold.ttf'), 'Verdana')
  } catch { /* may already be registered */ }

  // --- Step 4: Render pages ---
  progress(20, 'Rendering pages...')
  const fontSizePx = SIZE_TO_PX[fontSize] || 22
  const fontSizeIdx = SIZE_TO_IDX[fontSize] ?? 2

  const pageOpts = {
    pageWidth: PAGE_WIDTH,
    pageHeight: PAGE_HEIGHT,
    bodyFont,
    uiFont,
    fontSize: fontSizePx,
    lineHeight: 1.5,
    marginTop: 28,
    marginBottom: 28,
    marginLeft: 28,
    marginRight: 28,
    align,
    pageNumbers,
  }

  const canvases = renderPages(allParagraphs, pageOpts)

  // Track chapter start pages by mapping paragraph indices to page indices.
  // Since renderPages doesn't expose per-paragraph page mapping, we use a
  // simpler approach: render each chapter separately and track page counts.
  // But that would lose cross-chapter pagination. Instead, we render all at
  // once and compute chapter starts by re-rendering per-chapter to count pages.

  // Actually, let's take a pragmatic approach: render per-chapter, concatenate.
  // This gives us exact chapter→page mapping.

  // Re-do: render per-chapter for accurate chapter tracking
  const allKpBuffers = []
  const chapterPageStarts = []
  let totalPages = 0

  for (let ci = 0; ci < chapters.length; ci++) {
    const chapterParas = []
    if (chapters[ci].title) {
      chapterParas.push({ text: chapters[ci].title, tag: 'h1' })
    }
    const paras = extractText(chapters[ci].html)
    for (const p of paras) {
      if (p.startsWith('# ')) {
        chapterParas.push({ text: p.slice(2), tag: 'h1' })
      } else {
        chapterParas.push(p)
      }
    }

    if (chapterParas.length === 0) continue

    chapterPageStarts.push(totalPages)

    const chapterCanvases = renderPages(chapterParas, pageOpts)

    // Process canvases in batches to limit memory
    for (let bi = 0; bi < chapterCanvases.length; bi += BATCH_SIZE) {
      const batchEnd = Math.min(bi + BATCH_SIZE, chapterCanvases.length)
      for (let pi = bi; pi < batchEnd; pi++) {
        const canvas = chapterCanvases[pi]
        const ctx = canvas.getContext('2d')
        const imageData = ctx.getImageData(0, 0, PAGE_WIDTH, PAGE_HEIGHT)

        // 2-bit grayscale (bit_depth=2)
        const gsPixels = quantizeGamma(imageData.data, PAGE_WIDTH, PAGE_HEIGHT, gamma)
        const { bw, gs, width: lw, height: lh } = pixelsToLandscapePlanes(gsPixels, PAGE_WIDTH, PAGE_HEIGHT)
        const kpData = new Uint8Array(encodePlanesRaw(bw, gs, lw, lh))

        allKpBuffers.push(kpData)
      }

      // Report progress
      const pagesProcessed = totalPages + Math.min(batchEnd, chapterCanvases.length)
      const totalEstimate = totalPages + chapterCanvases.length
      const pct = 20 + Math.round((pagesProcessed / Math.max(totalEstimate, 1)) * 50)
      progress(Math.min(pct, 70), `Encoding page ${pagesProcessed}...`)
    }

    totalPages += chapterCanvases.length
  }

  // --- Step 5: Generate book assets ---
  progress(75, 'Generating assets...')
  const assets = await generateBookAssets(
    { title, author, fontFamily: uiFont, chapters, coverPath },
    { gamma }
  )

  // --- Step 6: Build .kb ---
  progress(90, 'Assembling .kb file...')
  const metadata = {
    title,
    author,
    bodyFont,
    uiFont,
    fontSize,
    orientation,
    mode,
    createdAt: new Date().toISOString(),
  }

  const kb = buildKb({
    pages: allKpBuffers,
    chapters: chapterPageStarts,
    assets,
    metadata,
    fontSizeIdx,
    orientation: orientation === 'landscape' ? 1 : 0,
    mode: mode === 'dark' ? 1 : 0,
    flags: 0x00,
  })

  progress(100, 'Done!')
  return kb
}
