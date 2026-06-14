import { createCanvas, GlobalFonts } from '@napi-rs/canvas'

/**
 * Register a font file for use in rendering.
 * @param {string} path - absolute path to .ttf/.otf file
 * @param {string} familyName - family name to reference later
 */
export function registerFont(path, familyName) {
  GlobalFonts.registerFromPath(path, familyName)
}

// ---------------------------------------------------------------------------
// Knuth-Plass constants
// ---------------------------------------------------------------------------
const INFINITY_PENALTY = 10000
const LINE_PENALTY = 50

// ---------------------------------------------------------------------------
// CJK detection (UAX #14 ID class)
// ---------------------------------------------------------------------------
function isCJK(cp) {
  return (cp >= 0x4E00 && cp <= 0x9FFF) ||   // CJK Unified Ideographs
         (cp >= 0x3400 && cp <= 0x4DBF) ||   // CJK Extension A
         (cp >= 0x3000 && cp <= 0x303F) ||   // CJK Symbols & Punctuation
         (cp >= 0x3040 && cp <= 0x309F) ||   // Hiragana
         (cp >= 0x30A0 && cp <= 0x30FF) ||   // Katakana
         (cp >= 0xAC00 && cp <= 0xD7AF) ||   // Hangul Syllables
         (cp >= 0xF900 && cp <= 0xFAFF) ||   // CJK Compat Ideographs
         (cp >= 0xFF00 && cp <= 0xFFEF) ||   // Fullwidth forms
         (cp >= 0x20000 && cp <= 0x2FA1F)    // CJK Extension B+
}

// ---------------------------------------------------------------------------
// Soft-hyphen helpers
// ---------------------------------------------------------------------------
const SHY = '\u00AD'

function stripSoftHyphens(str) {
  return str.replaceAll(SHY, '')
}

function splitAtSoftHyphens(word) {
  // Returns array of { prefix, suffix } break opportunities
  const parts = word.split(SHY)
  if (parts.length <= 1) return []
  const breaks = []
  for (let i = 1; i < parts.length; i++) {
    breaks.push({
      prefix: parts.slice(0, i).join('') + '-',
      suffix: parts.slice(i).join(SHY),
    })
  }
  return breaks
}

// ---------------------------------------------------------------------------
// Word splitting — break text into breakable units
// ---------------------------------------------------------------------------
function splitIntoUnits(text) {
  const units = []
  // First split on whitespace
  const rawWords = text.split(/\s+/).filter(w => w.length > 0)

  for (const word of rawWords) {
    // Check for CJK content
    let hasCJK = false
    for (const ch of word) {
      if (isCJK(ch.codePointAt(0))) { hasCJK = true; break }
    }

    if (!hasCJK) {
      units.push(word)
      continue
    }

    // Mixed content: split at CJK boundaries
    let buf = ''
    for (const ch of word) {
      const cp = ch.codePointAt(0)
      if (isCJK(cp)) {
        if (buf) { units.push(buf); buf = '' }
        units.push(ch)
      } else {
        buf += ch
      }
    }
    if (buf) units.push(buf)
  }
  return units
}

// ---------------------------------------------------------------------------
// Knuth-Plass line breaking
// ---------------------------------------------------------------------------
function calculateBadness(lineWidth, targetWidth) {
  if (lineWidth > targetWidth) return INFINITY_PENALTY
  if (lineWidth === targetWidth) return 0
  const ratio = (targetWidth - lineWidth) / targetWidth
  return ratio * ratio * ratio * 100
}

function calculateDemerits(badness, isLastLine) {
  if (badness >= INFINITY_PENALTY) return INFINITY_PENALTY
  if (isLastLine) return 0
  return (1 + badness) * (1 + badness)
}

/**
 * Compute optimal line breaks using Knuth-Plass DP.
 * @param {number[]} wordWidths - pixel width of each unit (soft-hyphens stripped)
 * @param {number} spaceWidth - width of a single space
 * @param {number} targetWidth - target line width in px
 * @returns {number[]} array of break-start indices (one per line)
 */
function computeLineBreaks(wordWidths, spaceWidth, targetWidth) {
  const n = wordWidths.length
  if (n === 0) return []

  const minDemerits = new Float64Array(n + 1).fill(INFINITY_PENALTY)
  const prevBreak = new Int32Array(n + 1).fill(-1)
  minDemerits[0] = 0

  for (let i = 0; i < n; i++) {
    if (minDemerits[i] >= INFINITY_PENALTY) continue
    let lineWidth = -spaceWidth // first word has no preceding space
    for (let j = i; j < n; j++) {
      lineWidth += wordWidths[j] + spaceWidth

      if (lineWidth > targetWidth) {
        if (j === i) {
          // Oversized single unit — force it onto its own line
          const demerits = minDemerits[i] + 100 + LINE_PENALTY
          if (demerits < minDemerits[j + 1]) {
            minDemerits[j + 1] = demerits
            prevBreak[j + 1] = i
          }
        }
        break
      }

      const isLast = j === n - 1
      const badness = calculateBadness(lineWidth, targetWidth)
      const demerits = minDemerits[i] + calculateDemerits(badness, isLast) + LINE_PENALTY

      if (demerits < minDemerits[j + 1]) {
        minDemerits[j + 1] = demerits
        prevBreak[j + 1] = i
      }
    }
  }

  // Backtrack
  const breaks = []
  let pos = n
  while (pos > 0 && prevBreak[pos] >= 0) {
    breaks.unshift(prevBreak[pos])
    pos = prevBreak[pos]
  }

  // Fallback: if chain is incomplete, one-word-per-line
  if (breaks.length === 0 || pos !== 0) {
    const fb = []
    for (let i = 0; i < n; i++) fb.push(i)
    return fb
  }

  return breaks
}

// ---------------------------------------------------------------------------
// Heading helpers
// ---------------------------------------------------------------------------
const HEADING_SCALE = { h1: 1.4, h2: 1.2, h3: 1.0, h4: 1.0, h5: 1.0, h6: 1.0 }
const HEADING_EXTRA_ABOVE = { h1: 1.0, h2: 0.75, h3: 0.5, h4: 0.5, h5: 0.5, h6: 0.5 }
const HEADING_EXTRA_BELOW = { h1: 0.5, h2: 0.4, h3: 0.3, h4: 0.3, h5: 0.3, h6: 0.3 }

function isHeading(tag) {
  return tag && /^h[1-6]$/.test(tag)
}

// ---------------------------------------------------------------------------
// Attaching punctuation (no extra space before these)
// ---------------------------------------------------------------------------
const ATTACHING_PUNCTUATION = new Set([
  '.', ',', '!', '?', ';', ':', '"', "'",
  '\u2019', // right single quote
  '\u201D', // right double quote
])

function isAttachingPunctuation(word) {
  for (const ch of word) {
    if (!ATTACHING_PUNCTUATION.has(ch)) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------

/**
 * Render paragraphs to page-sized canvases.
 *
 * @param {Array<string|{text: string, tag?: string, style?: string}>} paragraphs
 * @param {object} opts
 * @returns {import('@napi-rs/canvas').Canvas[]}
 */
export function renderPages(paragraphs, opts = {}) {
  const {
    pageWidth = 480,
    pageHeight = 800,
    bodyFont = 'Literata',        // font for page content (user-selected)
    uiFont = 'Verdana',           // font for footer/UI chrome (always Verdana)
    fontSize = 22,
    lineHeight = 1.5,
    marginTop = 28,
    marginBottom = 28,
    marginLeft = 28,
    marginRight = 28,
    indent = 0,
    paragraphSpacing: paraSpacingOpt,
    align = 'left',
    rtl = false,
    pageNumbers = false,
    chapterTitle = '',       // e.g. "CHAPTER 1: INTRODUCTION"
    chapterStartPage = 0,    // global page offset for this chapter
  } = opts

  const lineSpacing = Math.round(fontSize * lineHeight)
  const paragraphSpacing = paraSpacingOpt ?? Math.round(lineSpacing / 2)
  const contentWidth = pageWidth - marginLeft - marginRight
  const hasFooter = pageNumbers || chapterTitle
  const footerHeight = hasFooter ? Math.round(fontSize * 0.55) + 6 : 0
  const contentBottom = pageHeight - marginBottom - footerHeight

  // Create a measurement context (reused across all pages)
  const measureCanvas = createCanvas(1, 1)
  const measureCtx = measureCanvas.getContext('2d')

  function setFont(ctx, size, bold) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px "${bodyFont}"`
  }

  function setUiFont(ctx, size, bold) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px "${uiFont}"`
  }

  function measureWord(word, size, bold) {
    setFont(measureCtx, size, bold)
    return measureCtx.measureText(stripSoftHyphens(word)).width
  }

  function measureSpace(size, bold) {
    setFont(measureCtx, size, bold)
    return measureCtx.measureText(' ').width
  }

  // State
  const pages = []
  let currentCanvas = null
  let ctx = null
  let cursorY = 0

  function newPage() {
    currentCanvas = createCanvas(pageWidth, pageHeight)
    ctx = currentCanvas.getContext('2d')
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, pageWidth, pageHeight)
    ctx.fillStyle = 'black'
    ctx.textBaseline = 'alphabetic'
    pages.push(currentCanvas)
    cursorY = marginTop
  }

  function drawPageFooter(totalPagesInChapter) {
    if (!hasFooter) return
    const footerSize = Math.round(fontSize * 0.5)
    setFont(ctx, footerSize, false)
    ctx.fillStyle = 'black'

    const pageInChapter = pages.length - chapterStartPage
    let footerText = ''

    if (chapterTitle && pageNumbers) {
      // "CHAPTER 1: INTRODUCTION • 3 OF 4"
      const maxTitleW = contentWidth * 0.6
      let title = chapterTitle.toUpperCase()
      while (ctx.measureText(title + '...').width > maxTitleW && title.length > 5) {
        title = title.slice(0, -1).trimEnd()
      }
      if (title !== chapterTitle.toUpperCase()) title += '...'
      footerText = `${title}  \u2022  ${pageInChapter} OF ${totalPagesInChapter || '?'}`
    } else if (chapterTitle) {
      footerText = chapterTitle.toUpperCase()
    } else {
      footerText = String(pages.length)
    }

    const footerW = ctx.measureText(footerText).width
    const footerY = pageHeight - marginBottom + Math.round(footerSize * 0.3)
    ctx.fillText(footerText, (pageWidth - footerW) / 2, footerY)
  }

  function finalizePage() {
    // Footer drawn in second pass after total page count is known
  }

  newPage()

  // Process each paragraph
  for (const para of paragraphs) {
    const text = typeof para === 'string' ? para : para.text
    const tag = typeof para === 'object' ? para.tag : undefined
    if (!text || text.trim().length === 0) continue

    const heading = isHeading(tag)
    const isBlockquote = tag === 'blockquote'
    const isListItem = tag === 'li'

    // Determine font properties for this paragraph
    const bold = heading || false
    const scale = heading ? (HEADING_SCALE[tag] || 1.0) : 1.0
    const paraFontSize = Math.round(fontSize * scale)
    const paraLineSpacing = Math.round(paraFontSize * lineHeight)
    const paraAlign = heading && tag === 'h1' ? 'center' : (heading ? 'left' : align)

    // Extra spacing above heading
    if (heading && cursorY > marginTop) {
      const extraAbove = Math.round(lineSpacing * (HEADING_EXTRA_ABOVE[tag] || 0))
      cursorY += extraAbove
    }

    // Blockquote indent
    const extraIndentLeft = isBlockquote ? Math.round(fontSize * 1.5) : (isListItem ? Math.round(fontSize * 1.0) : 0)
    const effectiveContentWidth = contentWidth - extraIndentLeft
    const effectiveMarginLeft = marginLeft + extraIndentLeft

    // First-line indent (not for headings, centered text, or list items)
    const firstLineIndent = (heading || paraAlign === 'center' || isListItem) ? 0 : indent
    const firstLineWidth = effectiveContentWidth - firstLineIndent

    // Split text into breakable units
    const units = splitIntoUnits(text)
    if (units.length === 0) continue

    // Pre-split at soft hyphens for oversized words
    const expandedUnits = []
    const spaceW = measureSpace(paraFontSize, bold)

    for (const unit of units) {
      const w = measureWord(unit, paraFontSize, bold)
      if (w <= effectiveContentWidth) {
        expandedUnits.push(unit)
      } else {
        // Try soft-hyphen splits
        const shyBreaks = splitAtSoftHyphens(unit)
        if (shyBreaks.length === 0) {
          expandedUnits.push(unit) // can't split further
        } else {
          // Find best split chain
          let remaining = unit
          let didSplit = false
          while (true) {
            const breaks = splitAtSoftHyphens(remaining)
            if (breaks.length === 0) {
              expandedUnits.push(stripSoftHyphens(remaining))
              break
            }
            // Find rightmost break where prefix fits
            let bestIdx = -1
            for (let i = breaks.length - 1; i >= 0; i--) {
              if (measureWord(breaks[i].prefix, paraFontSize, bold) <= effectiveContentWidth) {
                bestIdx = i
                break
              }
            }
            if (bestIdx < 0) {
              expandedUnits.push(stripSoftHyphens(remaining))
              break
            }
            expandedUnits.push(breaks[bestIdx].prefix)
            remaining = breaks[bestIdx].suffix
            didSplit = true
          }
        }
      }
    }

    // Measure all units (stripped of soft hyphens)
    const wordWidths = expandedUnits.map(u => measureWord(u, paraFontSize, bold))

    // Compute line breaks
    // For first-line indent we adjust: use two passes or adjust target widths
    // Simple approach: if indent > 0, first line has reduced width
    let lineBreaks
    if (firstLineIndent > 0) {
      // Use a modified approach: run KP on full width, then check if first line
      // needs re-breaking. For simplicity, use greedy-aware KP.
      lineBreaks = computeLineBreaksWithIndent(wordWidths, spaceW, effectiveContentWidth, firstLineIndent)
    } else {
      lineBreaks = computeLineBreaks(wordWidths, spaceW, effectiveContentWidth)
    }

    // Build lines: each line is { startIdx, endIdx (exclusive) }
    const lines = []
    for (let i = 0; i < lineBreaks.length; i++) {
      const start = lineBreaks[i]
      const end = i + 1 < lineBreaks.length ? lineBreaks[i + 1] : expandedUnits.length
      lines.push({ start, end })
    }

    // Render lines
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const { start, end } = lines[lineIdx]
      const lineWordCount = end - start
      if (lineWordCount === 0) continue

      // Check if we need a new page
      if (cursorY + paraLineSpacing > contentBottom) {
        finalizePage()
        newPage()
        // If heading, re-add extra spacing at top of page? No, already at top.
      }

      // Calculate line width and word positions
      let totalWordWidth = 0
      let gapCount = 0
      for (let wi = start; wi < end; wi++) {
        totalWordWidth += wordWidths[wi]
        if (wi > start && !isAttachingPunctuation(stripSoftHyphens(expandedUnits[wi]))) {
          gapCount++
        }
      }

      const isFirstLine = lineIdx === 0
      const isLastLine = lineIdx === lines.length - 1
      const lineIndent = isFirstLine ? firstLineIndent : 0
      const targetW = effectiveContentWidth - lineIndent
      const spareSpace = targetW - totalWordWidth

      // Determine word spacing
      let wordSpacing = spaceW
      const effectiveAlign = rtl && paraAlign === 'left' ? 'right' : paraAlign
      if (effectiveAlign === 'justify' && !isLastLine && gapCount > 0) {
        wordSpacing = spareSpace / gapCount
      }

      // Calculate x start position
      let x
      const lineLeft = effectiveMarginLeft + lineIndent
      if (rtl) {
        // RTL rendering
        if (effectiveAlign === 'center') {
          const usedWidth = totalWordWidth + gapCount * wordSpacing
          x = lineLeft + effectiveContentWidth - lineIndent - (effectiveContentWidth - lineIndent - usedWidth) / 2
        } else if (effectiveAlign === 'left') {
          const usedWidth = totalWordWidth + gapCount * wordSpacing
          x = lineLeft + usedWidth
        } else {
          // right-align (default for RTL)
          x = lineLeft + effectiveContentWidth - lineIndent
        }
      } else {
        // LTR rendering
        if (effectiveAlign === 'center') {
          const usedWidth = totalWordWidth + gapCount * wordSpacing
          x = lineLeft + (effectiveContentWidth - lineIndent - usedWidth) / 2
        } else if (effectiveAlign === 'right') {
          const usedWidth = totalWordWidth + gapCount * wordSpacing
          x = lineLeft + effectiveContentWidth - lineIndent - usedWidth
        } else {
          // left-align (including justify — words placed left-to-right)
          x = lineLeft
        }
      }

      // Draw words
      setFont(ctx, paraFontSize, bold)
      ctx.fillStyle = 'black'
      const baseline = cursorY + paraLineSpacing * 0.75 // approximate baseline

      if (rtl) {
        for (let wi = start; wi < end; wi++) {
          const display = stripSoftHyphens(expandedUnits[wi])
          x -= wordWidths[wi]
          ctx.fillText(display, x, baseline)
          if (wi + 1 < end && !isAttachingPunctuation(stripSoftHyphens(expandedUnits[wi + 1]))) {
            x -= wordSpacing
          }
        }
      } else {
        for (let wi = start; wi < end; wi++) {
          const display = stripSoftHyphens(expandedUnits[wi])
          ctx.fillText(display, x, baseline)
          x += wordWidths[wi]
          if (wi + 1 < end && !isAttachingPunctuation(stripSoftHyphens(expandedUnits[wi + 1]))) {
            x += wordSpacing
          }
        }
      }

      // List item bullet on first line
      if (isListItem && isFirstLine) {
        setFont(ctx, paraFontSize, false)
        const bulletX = effectiveMarginLeft - Math.round(fontSize * 0.7)
        ctx.fillText('\u2022', bulletX, baseline)
      }

      cursorY += paraLineSpacing
    }

    // Extra spacing below heading
    if (heading) {
      const extraBelow = Math.round(lineSpacing * (HEADING_EXTRA_BELOW[tag] || 0))
      cursorY += extraBelow
    }

    // Paragraph spacing
    cursorY += paragraphSpacing
  }

  finalizePage()

  // Second pass: draw chapter footer on all pages (now we know total count)
  if (hasFooter) {
    const totalInChapter = pages.length
    for (let i = 0; i < pages.length; i++) {
      const pageCtx = pages[i].getContext('2d')
      const footerSize = Math.round(fontSize * 0.5)
      setUiFont(pageCtx, footerSize, false)
      pageCtx.fillStyle = 'black'
      const pageNum = i + 1

      let footerText = ''
      if (chapterTitle && pageNumbers) {
        const maxTitleW = contentWidth * 0.6
        let title = chapterTitle.toUpperCase()
        while (pageCtx.measureText(title + '...').width > maxTitleW && title.length > 5) {
          title = title.slice(0, -1).trimEnd()
        }
        if (title !== chapterTitle.toUpperCase()) title += '...'
        footerText = `${title}  \u2022  ${pageNum} OF ${totalInChapter}`
      } else if (chapterTitle) {
        footerText = chapterTitle.toUpperCase()
      } else {
        footerText = String(chapterStartPage + i + 1)
      }

      const footerW = pageCtx.measureText(footerText).width
      const footerY = pageHeight - marginBottom + Math.round(footerSize * 0.3)
      pageCtx.fillText(footerText, (pageWidth - footerW) / 2, footerY)
    }
  }

  return pages
}

/**
 * Compute line breaks with first-line indent.
 * The first line has a reduced target width.
 */
function computeLineBreaksWithIndent(wordWidths, spaceWidth, contentWidth, indent) {
  const n = wordWidths.length
  if (n === 0) return []

  const minDemerits = new Float64Array(n + 1).fill(INFINITY_PENALTY)
  const prevBreak = new Int32Array(n + 1).fill(-1)
  minDemerits[0] = 0

  for (let i = 0; i < n; i++) {
    if (minDemerits[i] >= INFINITY_PENALTY) continue
    // First line (starting from word 0) has reduced width
    const targetWidth = i === 0 ? contentWidth - indent : contentWidth
    let lineWidth = -spaceWidth
    for (let j = i; j < n; j++) {
      lineWidth += wordWidths[j] + spaceWidth
      if (lineWidth > targetWidth) {
        if (j === i) {
          const demerits = minDemerits[i] + 100 + LINE_PENALTY
          if (demerits < minDemerits[j + 1]) {
            minDemerits[j + 1] = demerits
            prevBreak[j + 1] = i
          }
        }
        break
      }
      const isLast = j === n - 1
      const badness = calculateBadness(lineWidth, targetWidth)
      const demerits = minDemerits[i] + calculateDemerits(badness, isLast) + LINE_PENALTY
      if (demerits < minDemerits[j + 1]) {
        minDemerits[j + 1] = demerits
        prevBreak[j + 1] = i
      }
    }
  }

  const breaks = []
  let pos = n
  while (pos > 0 && prevBreak[pos] >= 0) {
    breaks.unshift(prevBreak[pos])
    pos = prevBreak[pos]
  }

  if (breaks.length === 0 || pos !== 0) {
    const fb = []
    for (let i = 0; i < n; i++) fb.push(i)
    return fb
  }
  return breaks
}
