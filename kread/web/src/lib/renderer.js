/**
 * @typedef {Object} RenderOptions
 * @property {string} fontFamily - Font family name (e.g., 'Literata')
 * @property {number} fontSize - Font size in pixels
 * @property {number} lineHeight - Line height multiplier (e.g., 1.5)
 * @property {number} marginTop - Top margin in pixels
 * @property {number} marginBottom - Bottom margin in pixels
 * @property {number} marginLeft - Left margin in pixels
 * @property {number} marginRight - Right margin in pixels
 */

const DEFAULT_OPTIONS = {
  fontFamily: 'Literata',
  fontSize: 24,
  lineHeight: 1.6,
  marginTop: 30,
  marginBottom: 30,
  marginLeft: 30,
  marginRight: 30,
};

/**
 * Render paragraphs to pages of a given pixel dimension.
 * Returns array of ImageData objects (one per page).
 *
 * Uses Canvas 2D fillText — browser internally uses Harfbuzz for shaping
 * and FreeType/Skia/DirectWrite for rasterization.
 *
 * @param {string[]} paragraphs - Text content
 * @param {number} pageWidth - Page width in pixels (e.g., 480 for portrait)
 * @param {number} pageHeight - Page height in pixels (e.g., 800 for portrait)
 * @param {RenderOptions} opts
 * @returns {ImageData[]} - Array of rendered page ImageData
 */
export function renderPages(paragraphs, pageWidth, pageHeight, opts = {}) {
  const o = { ...DEFAULT_OPTIONS, ...opts };
  const contentWidth = pageWidth - o.marginLeft - o.marginRight;
  const contentHeight = pageHeight - o.marginTop - o.marginBottom;
  const lineSpacing = Math.round(o.fontSize * o.lineHeight);

  // Create a measuring canvas
  const canvas = document.createElement('canvas');
  canvas.width = pageWidth;
  canvas.height = pageHeight;
  const ctx = canvas.getContext('2d');

  ctx.font = `${o.fontSize}px "${o.fontFamily}"`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'black';

  // Word-wrap all paragraphs into lines
  const allLines = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/);
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? currentLine + ' ' + word : word;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > contentWidth && currentLine) {
        allLines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) allLines.push(currentLine);
    allLines.push(''); // paragraph break
  }

  // Paginate lines
  const pages = [];
  const linesPerPage = Math.floor(contentHeight / lineSpacing);
  let lineIdx = 0;

  while (lineIdx < allLines.length) {
    // Clear canvas to white
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, pageWidth, pageHeight);
    ctx.fillStyle = 'black';
    ctx.font = `${o.fontSize}px "${o.fontFamily}"`;
    ctx.textBaseline = 'top';

    let linesDrawn = 0;
    while (linesDrawn < linesPerPage && lineIdx < allLines.length) {
      const line = allLines[lineIdx];
      if (line === '') {
        // Paragraph break — add half line spacing
        linesDrawn += 0.5;
        lineIdx++;
        continue;
      }
      const y = o.marginTop + Math.round(linesDrawn * lineSpacing);
      ctx.fillText(line, o.marginLeft, y);
      linesDrawn++;
      lineIdx++;
    }

    // Skip trailing empty lines at start of next page
    while (lineIdx < allLines.length && allLines[lineIdx] === '') lineIdx++;

    pages.push(ctx.getImageData(0, 0, pageWidth, pageHeight));
  }

  return pages;
}

/**
 * Render a single test page with sample text.
 * Useful for quick testing without EPUB.
 */
export function renderTestPage(pageWidth, pageHeight, opts = {}) {
  const text = [
    'The quick brown fox jumps over the lazy dog.',
    'Một buổi chiều mùa hạ, trời nóng bức, tôi nằm nghỉ trên bãi cỏ xanh cạnh bờ ao.',
    'Typography is the art and technique of arranging type to make written language legible, readable, and appealing when displayed.',
    'Kread renders text with gamma-corrected quantization for optimal e-ink display quality at 220 PPI.',
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
  ];
  return renderPages(text, pageWidth, pageHeight, opts);
}
