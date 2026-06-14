import { parseEpub, extractText } from '../lib/epub.js'
import { renderPages, renderTestPage } from '../lib/renderer.js'
import { quantizeGamma } from '../lib/eink/quantize.js'
import { pixelsToLandscapePlanes, encodePlanes } from '../lib/eink/encoder.js'

let epub = $state(null)
let epubName = $state('')
let selectedFonts = $state([])
let selectedSizes = $state([16])
let selectedOrientations = $state(['portrait'])
let variants = $state([])
let activeVariant = $state(0)
let converting = $state(false)
let convertProgress = $state(0)
let lastResult = $state(null)
let convertError = $state(null)

function updateVariants() {
  const v = []
  for (const font of selectedFonts) {
    for (const size of selectedSizes) {
      for (const orient of selectedOrientations) {
        v.push({ font, size, orientation: orient })
      }
    }
  }
  variants = v
  if (activeVariant >= v.length) activeVariant = Math.max(0, v.length - 1)
}

function setEpub(file) {
  if (file) {
    epub = file
    epubName = file.name.replace(/\.epub$/i, '')
  } else {
    epub = null
    epubName = ''
  }
}

function setSelectedFonts(v) { selectedFonts = v; updateVariants() }
function setSelectedSizes(v) { selectedSizes = v; updateVariants() }
function setSelectedOrientations(v) { selectedOrientations = v; updateVariants() }

/**
 * Convert first page of an EPUB (or test page if epubFile is null).
 * @param {File|null} epubFile - EPUB file, or null for test page
 * @param {Object} options - { fontFamily, fontSize, orientation }
 * @returns {Promise<{kpFile: Uint8Array, quantized: Uint8Array, pageWidth: number, pageHeight: number}>}
 */
async function convertFirstPage(epubFile, options = {}) {
  converting = true
  convertProgress = 0
  convertError = null
  lastResult = null

  try {
    const pageWidth = options.orientation === 'landscape' ? 800 : 480
    const pageHeight = options.orientation === 'landscape' ? 480 : 800
    const renderOpts = {
      fontFamily: options.fontFamily || 'Literata',
      fontSize: options.fontSize || 24,
    }

    let pages
    let epubMeta = null

    if (!epubFile) {
      // Test page
      convertProgress = 30
      pages = renderTestPage(pageWidth, pageHeight, renderOpts)
    } else {
      // EPUB
      convertProgress = 10
      const data = await epubFile.arrayBuffer()
      convertProgress = 20
      epubMeta = await parseEpub(data)
      convertProgress = 40

      const paragraphs = extractText(epubMeta.chapters[0]?.html || '')
      if (paragraphs.length === 0) throw new Error('No text content in first chapter')

      convertProgress = 50
      pages = renderPages(paragraphs, pageWidth, pageHeight, renderOpts)
    }

    if (pages.length === 0) throw new Error('No content rendered')
    convertProgress = 70

    // Quantize first page
    const imageData = pages[0]
    const quantized = quantizeGamma(imageData.data, pageWidth, pageHeight)
    convertProgress = 85

    // Encode to .kp
    const { bw, gs, width, height } = pixelsToLandscapePlanes(quantized, pageWidth, pageHeight)
    const kpFile = encodePlanes(bw, gs, width, height)
    convertProgress = 100

    const result = { kpFile, quantized, pageWidth, pageHeight, epubMeta }
    lastResult = result
    return result
  } catch (err) {
    convertError = err.message
    throw err
  } finally {
    converting = false
  }
}

export const booksStore = {
  get epub() { return epub },
  get epubName() { return epubName },
  get selectedFonts() { return selectedFonts },
  get selectedSizes() { return selectedSizes },
  get selectedOrientations() { return selectedOrientations },
  get variants() { return variants },
  get activeVariant() { return activeVariant },
  set activeVariant(v) { activeVariant = v },
  get converting() { return converting },
  get convertProgress() { return convertProgress },
  get lastResult() { return lastResult },
  get convertError() { return convertError },
  setEpub,
  setSelectedFonts,
  setSelectedSizes,
  setSelectedOrientations,
  convertFirstPage,
}
