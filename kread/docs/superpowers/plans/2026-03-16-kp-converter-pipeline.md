# EPUB → .kp Converter Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a single EPUB page to `.kp` format in the browser, preview in emulator, and display on the Xteink X4 device.

**Architecture:** Browser-side pipeline: JSZip extracts EPUB → OffscreenCanvas renders text with loaded OFL font → gamma-corrected quantization to 4 grayscale levels → encode as .kp (SSD1677-native planes) → LZ4 compress. Firmware reads .kp from SD card → LZ4 decompress → blast to display. Web Worker for non-blocking rendering.

**Tech Stack:** Svelte 5, Vite, JSZip (existing), lz4js (existing), OffscreenCanvas, Web Workers, ESP-IDF C, LZ4 C library

**Specs:**
- `.kp` format: `kread/docs/superpowers/specs/2026-03-16-kp-kb-format-design.md`
- x4 SDK: `kread/docs/superpowers/specs/2026-03-15-x4-sdk-display-driver-design.md`

---

## File Structure

```
kread/web/
├── src/
│   ├── lib/
│   │   ├── epub.js              # EPUB parser (JSZip → chapters → text)
│   │   ├── renderer.js          # Canvas text renderer (layout + render)
│   │   ├── quantize.js          # Grayscale → gamma → 4-level quantize
│   │   ├── kp-encoder.js        # Encode quantized pixels → .kp binary
│   │   └── converter-worker.js  # Web Worker: orchestrates pipeline
│   ├── stores/
│   │   └── books.svelte.js      # MODIFY: wire convert dispatch
│   └── tabs/
│       └── BooksCreate.svelte   # MODIFY: trigger convert, show preview
├── public/
│   └── fonts/
│       └── Literata.woff2       # Bundled font (SIL OFL)

kread/firmware/
├── lib/x4/                      # Existing x4 SDK (no changes)
├── lib/lz4/                     # NEW: LZ4 decompression library
│   ├── lz4.h
│   └── lz4.c
└── src/
    ├── main.c                   # MODIFY: add .kp display mode
    └── kp_reader.c              # NEW: .kp file reader + display
    └── kp_reader.h              # NEW: header
```

---

## Chunk 1: Web Converter Pipeline

### Task 1: Add Literata font and quantization module

**Files:**
- Create: `kread/web/public/fonts/Literata.woff2`
- Create: `kread/web/src/lib/quantize.js`

- [ ] **Step 1: Download Literata font**

Download Literata Regular from Google Fonts (SIL OFL license) and place in `public/fonts/`. Also add a CSS file to load it.

```css
/* kread/web/public/fonts/fonts.css */
@font-face {
  font-family: 'Literata';
  src: url('/fonts/Literata.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

Load this CSS in `index.html`:
```html
<link rel="stylesheet" href="/fonts/fonts.css">
```

- [ ] **Step 2: Implement quantize.js**

```js
// kread/web/src/lib/quantize.js

/**
 * Convert 8-bit grayscale to 4-level (2-bit) with gamma correction.
 *
 * E-ink displays have non-linear response. Gamma correction compensates:
 * - Linear quantization: thresholds at 64, 128, 192
 * - Gamma-corrected (γ=1.8): adjusts thresholds for perceptual uniformity on e-ink
 *
 * @param {Uint8ClampedArray} rgba - Canvas ImageData.data (RGBA, 4 bytes/pixel)
 * @param {number} width
 * @param {number} height
 * @param {number} gamma - Gamma value (default 1.8 for e-ink)
 * @returns {Uint8Array} - 2-bit pixel values (0=black, 1=dark gray, 2=light gray, 3=white)
 */
export function quantizeGamma(rgba, width, height, gamma = 1.8) {
  const pixels = new Uint8Array(width * height);
  const invGamma = 1.0 / gamma;

  for (let i = 0; i < width * height; i++) {
    // Convert RGBA to grayscale (luminosity method)
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    // Apply gamma correction: linearize, then re-map
    const normalized = gray / 255.0;
    const corrected = Math.pow(normalized, invGamma);

    // Quantize to 4 levels
    // After gamma: 0.0=black, 1.0=white
    // Thresholds at 0.25, 0.5, 0.75 (equal perceptual steps)
    if (corrected < 0.25) {
      pixels[i] = 0; // black
    } else if (corrected < 0.5) {
      pixels[i] = 1; // dark gray
    } else if (corrected < 0.75) {
      pixels[i] = 2; // light gray
    } else {
      pixels[i] = 3; // white
    }
  }

  return pixels;
}

/**
 * Simple threshold quantization (no gamma, no dithering).
 * Thresholds at 64, 128, 192.
 */
export function quantizeThreshold(rgba, width, height) {
  const pixels = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;

    if (gray < 64) pixels[i] = 0;
    else if (gray < 128) pixels[i] = 1;
    else if (gray < 192) pixels[i] = 2;
    else pixels[i] = 3;
  }
  return pixels;
}

/**
 * Floyd-Steinberg dithering to 4 levels.
 * Good for images/photos, not for text.
 */
export function quantizeFloydSteinberg(rgba, width, height, gamma = 1.8) {
  const invGamma = 1.0 / gamma;
  // Work in floating point for error diffusion
  const buffer = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    buffer[i] = Math.pow(gray / 255.0, invGamma);
  }

  const pixels = new Uint8Array(width * height);
  const levels = [0.0, 0.333, 0.667, 1.0]; // 4 output levels

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = Math.max(0, Math.min(1, buffer[idx]));

      // Find nearest level
      let nearest = 0;
      let minDist = Math.abs(old - levels[0]);
      for (let l = 1; l < 4; l++) {
        const dist = Math.abs(old - levels[l]);
        if (dist < minDist) { minDist = dist; nearest = l; }
      }
      pixels[idx] = nearest;

      // Diffuse error
      const error = old - levels[nearest];
      if (x + 1 < width) buffer[idx + 1] += error * 7 / 16;
      if (y + 1 < height) {
        if (x > 0) buffer[idx + width - 1] += error * 3 / 16;
        buffer[idx + width] += error * 5 / 16;
        if (x + 1 < width) buffer[idx + width + 1] += error * 1 / 16;
      }
    }
  }

  return pixels;
}
```

- [ ] **Step 3: Commit**

```bash
git add web/public/fonts/ web/src/lib/quantize.js
git commit -m "feat(web): add Literata font and grayscale quantization module"
```

---

### Task 2: Implement .kp encoder

**Files:**
- Create: `kread/web/src/lib/kp-encoder.js`

- [ ] **Step 1: Implement kp-encoder.js**

```js
// kread/web/src/lib/kp-encoder.js
import lz4 from 'lz4js';

/**
 * Encode 2-bit pixel array into .kp binary format.
 *
 * .kp format: 16-byte header + LZ4 compressed plane data.
 * 2-bit mode: two separate LZ4 blocks (LSB plane, then MSB plane).
 *
 * Pixel values: 0=black, 1=dark gray, 2=light gray, 3=white
 * Mapping: value = (MSB << 1) | LSB
 *   0 → LSB=0, MSB=0
 *   1 → LSB=1, MSB=0  (dark gray)
 *   2 → LSB=0, MSB=1  (light gray)
 *   3 → LSB=1, MSB=1  (white)
 *
 * Planes are row-major, 8 pixels per byte, MSB=leftmost pixel.
 * This matches SSD1677 BW/RED RAM layout directly.
 *
 * @param {Uint8Array} pixels - 2-bit pixel values (0-3), width*height elements
 * @param {number} width - Image width (e.g., 800 for landscape)
 * @param {number} height - Image height (e.g., 480 for landscape)
 * @returns {Uint8Array} - Complete .kp file binary
 */
export function encodeKp(pixels, width, height) {
  const rowBytes = Math.ceil(width / 8);
  const planeSize = rowBytes * height;

  // Build LSB and MSB planes
  const lsbPlane = new Uint8Array(planeSize);
  const msbPlane = new Uint8Array(planeSize);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixIdx = y * width + x;
      const val = pixels[pixIdx];
      const lsb = val & 1;
      const msb = (val >> 1) & 1;

      const byteIdx = y * rowBytes + Math.floor(x / 8);
      const bitIdx = 7 - (x % 8); // MSB = leftmost

      if (lsb) lsbPlane[byteIdx] |= (1 << bitIdx);
      if (msb) msbPlane[byteIdx] |= (1 << bitIdx);
    }
  }

  // LZ4 compress each plane separately
  const lsbCompressed = lz4.compress(lsbPlane);
  const msbCompressed = lz4.compress(msbPlane);

  // Build data section: [lsb_size:4][lsb_data:N][msb_size:4][msb_data:M]
  const dataSize = 4 + lsbCompressed.length + 4 + msbCompressed.length;
  const data = new Uint8Array(dataSize);
  const dataView = new DataView(data.buffer);

  let offset = 0;
  dataView.setUint32(offset, lsbCompressed.length, true); offset += 4;
  data.set(lsbCompressed, offset); offset += lsbCompressed.length;
  dataView.setUint32(offset, msbCompressed.length, true); offset += 4;
  data.set(msbCompressed, offset);

  // Build .kp file: 16-byte header + data
  const rawSize = planeSize * 2; // total uncompressed (both planes)
  const file = new Uint8Array(16 + dataSize);
  const fileView = new DataView(file.buffer);

  // Header
  file[0] = 0x4B; // 'K'
  file[1] = 0x50; // 'P'
  file[2] = 0x00;
  file[3] = 0x01; // version 1
  fileView.setUint16(4, width, true);
  fileView.setUint16(6, height, true);
  file[8] = 2;    // bit_depth = 2
  file[9] = 1;    // compression = LZ4
  fileView.setUint32(10, dataSize, true);
  fileView.setUint16(14, rawSize >> 16, true); // raw_size_hi

  // Data
  file.set(data, 16);

  return file;
}

/**
 * Encode 1-bit pixel array into .kp binary format.
 * @param {Uint8Array} pixels - 1-bit pixel values (0=black, 1=white)
 */
export function encodeKp1bit(pixels, width, height) {
  const rowBytes = Math.ceil(width / 8);
  const planeSize = rowBytes * height;
  const plane = new Uint8Array(planeSize);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x]) {
        const byteIdx = y * rowBytes + Math.floor(x / 8);
        const bitIdx = 7 - (x % 8);
        plane[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  const compressed = lz4.compress(plane);

  const file = new Uint8Array(16 + compressed.length);
  const fileView = new DataView(file.buffer);

  file[0] = 0x4B; file[1] = 0x50; file[2] = 0x00; file[3] = 0x01;
  fileView.setUint16(4, width, true);
  fileView.setUint16(6, height, true);
  file[8] = 1;    // bit_depth = 1
  file[9] = 1;    // compression = LZ4
  fileView.setUint32(10, compressed.length, true);
  fileView.setUint16(14, planeSize >> 16, true);

  file.set(compressed, 16);
  return file;
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/lib/kp-encoder.js
git commit -m "feat(web): implement .kp encoder with LZ4 compression"
```

---

### Task 3: Implement EPUB parser and text renderer

**Files:**
- Create: `kread/web/src/lib/epub.js`
- Create: `kread/web/src/lib/renderer.js`

- [ ] **Step 1: Implement epub.js**

Minimal EPUB parser: extract first chapter's text content.

```js
// kread/web/src/lib/epub.js
import JSZip from 'jszip';

/**
 * Parse an EPUB file and extract chapter content.
 *
 * EPUB structure:
 *   META-INF/container.xml → points to content.opf
 *   content.opf → lists spine (reading order) of XHTML files
 *   chapter files → HTML content
 *
 * @param {ArrayBuffer} epubData - Raw EPUB file data
 * @returns {Promise<{title: string, author: string, chapters: Array<{title: string, html: string}>}>}
 */
export async function parseEpub(epubData) {
  const zip = await JSZip.loadAsync(epubData);

  // 1. Find content.opf path from container.xml
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) throw new Error('Invalid EPUB: missing container.xml');

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, 'application/xml');
  const rootfilePath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!rootfilePath) throw new Error('Invalid EPUB: no rootfile');

  // 2. Parse content.opf
  const opfXml = await zip.file(rootfilePath)?.async('text');
  if (!opfXml) throw new Error('Invalid EPUB: missing ' + rootfilePath);

  const opfDoc = parser.parseFromString(opfXml, 'application/xml');
  const opfDir = rootfilePath.includes('/') ? rootfilePath.substring(0, rootfilePath.lastIndexOf('/') + 1) : '';

  // Extract metadata
  const title = opfDoc.querySelector('metadata title')?.textContent || 'Untitled';
  const author = opfDoc.querySelector('metadata creator')?.textContent || 'Unknown';

  // 3. Get spine (reading order)
  const manifest = {};
  opfDoc.querySelectorAll('manifest item').forEach(item => {
    manifest[item.getAttribute('id')] = item.getAttribute('href');
  });

  const spine = [];
  opfDoc.querySelectorAll('spine itemref').forEach(ref => {
    const id = ref.getAttribute('idref');
    if (manifest[id]) spine.push(opfDir + manifest[id]);
  });

  // 4. Extract chapter HTML content
  const chapters = [];
  for (const path of spine) {
    const file = zip.file(path);
    if (!file) continue;
    const html = await file.async('text');
    // Extract title from first heading if available
    const doc = parser.parseFromString(html, 'application/xhtml+xml');
    const heading = doc.querySelector('h1, h2, h3')?.textContent || `Chapter ${chapters.length + 1}`;
    chapters.push({ title: heading, html });
  }

  return { title, author, chapters };
}

/**
 * Extract plain text from HTML, preserving paragraph structure.
 * @param {string} html - Chapter HTML
 * @returns {string[]} - Array of paragraphs
 */
export function extractText(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'application/xhtml+xml');

  // Remove scripts, styles
  doc.querySelectorAll('script, style').forEach(el => el.remove());

  const paragraphs = [];
  const blocks = doc.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, div');

  if (blocks.length === 0) {
    // Fallback: use body text
    const text = doc.body?.textContent?.trim();
    if (text) paragraphs.push(text);
  } else {
    blocks.forEach(block => {
      const text = block.textContent?.trim();
      if (text) paragraphs.push(text);
    });
  }

  return paragraphs;
}
```

- [ ] **Step 2: Implement renderer.js**

Canvas-based text renderer. Renders paragraphs onto an OffscreenCanvas at target resolution.

```js
// kread/web/src/lib/renderer.js

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
```

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/epub.js web/src/lib/renderer.js
git commit -m "feat(web): implement EPUB parser and canvas text renderer"
```

---

### Task 4: Wire converter into BooksCreate UI

**Files:**
- Modify: `kread/web/src/tabs/BooksCreate.svelte`
- Modify: `kread/web/src/stores/books.svelte.js`

- [ ] **Step 1: Add convert logic to books store**

Read the current `books.svelte.js` and add a `convertPage` function that runs the pipeline:

```js
// Add to books.svelte.js:
import { parseEpub, extractText } from '../lib/epub.js';
import { renderPages, renderTestPage } from '../lib/renderer.js';
import { quantizeGamma } from '../lib/quantize.js';
import { encodeKp } from '../lib/kp-encoder.js';

// Add method to store:
async convertFirstPage(epubFile, options = {}) {
  // 1. Parse EPUB
  const data = await epubFile.arrayBuffer();
  const epub = await parseEpub(data);

  // 2. Extract text from first chapter
  const paragraphs = extractText(epub.chapters[0]?.html || '');

  // 3. Render to canvas
  const pageWidth = options.orientation === 'landscape' ? 800 : 480;
  const pageHeight = options.orientation === 'landscape' ? 480 : 800;
  const pages = renderPages(paragraphs, pageWidth, pageHeight, {
    fontFamily: options.font || 'Literata',
    fontSize: options.fontSize || 24,
  });

  if (pages.length === 0) throw new Error('No content to render');

  // 4. Quantize first page
  const imageData = pages[0];
  const quantized = quantizeGamma(imageData.data, pageWidth, pageHeight);

  // 5. Encode to .kp
  const kpFile = encodeKp(quantized, pageWidth, pageHeight);

  return { kpFile, imageData, quantized, pageWidth, pageHeight, epub };
}
```

- [ ] **Step 2: Add preview and download to BooksCreate.svelte**

Read current `BooksCreate.svelte`. Add:
- A "Convert Test Page" button (renders sample text without EPUB)
- A "Convert EPUB" button (renders first page of uploaded EPUB)
- Preview in emulator canvas
- Download .kp file button

The preview should show the quantized 4-level image in the emulator. Use the existing `EmulatorCanvas` component's screen buffer.

Key integration points:
- Call `renderTestPage()` or `convertFirstPage()` on button click
- Pass quantized pixels to emulator screen buffer via `screen.setPixel()`
- Add download link for .kp file: `URL.createObjectURL(new Blob([kpFile]))`

- [ ] **Step 3: Verify in browser**

```bash
cd kread/web && npm run dev
```

Open browser. Click "Convert Test Page". Should see:
1. Rendered text in emulator preview (4 grayscale levels)
2. Download link for `.kp` file

- [ ] **Step 4: Commit**

```bash
git add web/src/tabs/BooksCreate.svelte web/src/stores/books.svelte.js
git commit -m "feat(web): wire converter pipeline into BooksCreate UI"
```

---

## Chunk 2: Firmware .kp Reader + Device Test

### Task 5: Bundle LZ4 library for firmware

**Files:**
- Create: `kread/firmware/lib/lz4/library.json`
- Create: `kread/firmware/lib/lz4/lz4.h`
- Create: `kread/firmware/lib/lz4/lz4.c`

- [ ] **Step 1: Download LZ4 source**

Download `lz4.h` and `lz4.c` from the official LZ4 repository (https://github.com/lz4/lz4, BSD-2-Clause license). Only the decompression function is needed. Place in `lib/lz4/`.

```json
// kread/firmware/lib/lz4/library.json
{
  "name": "lz4",
  "version": "1.10.0",
  "description": "LZ4 compression library (decompression only)",
  "frameworks": "espidf",
  "platforms": "espressif32"
}
```

The full `lz4.c` and `lz4.h` from the official repo should be used. They are ~3000 LOC but compile to only a few KB of flash. Only `LZ4_decompress_safe()` is called by firmware.

- [ ] **Step 2: Verify builds**

```bash
cd kread/firmware && PLATFORMIO_CORE_DIR=C:/pio pio run 2>&1 | tail -5
```

Expected: BUILD SUCCESS. LZ4 library detected and compiled.

- [ ] **Step 3: Commit**

```bash
git add firmware/lib/lz4/
git commit -m "feat(firmware): bundle LZ4 decompression library"
```

---

### Task 6: Implement .kp reader for firmware

**Files:**
- Create: `kread/firmware/src/kp_reader.h`
- Create: `kread/firmware/src/kp_reader.c`

- [ ] **Step 1: Implement kp_reader.h**

```c
#ifndef KP_READER_H
#define KP_READER_H

#include <stdint.h>
#include <stdbool.h>

// .kp header (matches spec: 16 bytes, little-endian)
typedef struct __attribute__((packed)) {
    uint8_t  magic[4];      // "KP\x00\x01"
    uint16_t width;
    uint16_t height;
    uint8_t  bit_depth;     // 1 or 2
    uint8_t  compression;   // 0=raw, 1=LZ4
    uint32_t data_size;     // compressed data size
    uint16_t raw_size_hi;   // upper 16 bits of uncompressed size
} kp_header_t;

// Display a .kp file from SD card on the e-ink display
// Returns true on success
bool kp_display_file(const char *path);

#endif
```

- [ ] **Step 2: Implement kp_reader.c**

```c
#include "kp_reader.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <x4/x4.h>
#include "lz4.h"
#include "esp_log.h"

static const char *TAG = "kp";

bool kp_display_file(const char *path)
{
    FILE *f = fopen(path, "rb");
    if (!f) {
        ESP_LOGE(TAG, "Cannot open %s", path);
        return false;
    }

    // Read header
    kp_header_t hdr;
    if (fread(&hdr, sizeof(hdr), 1, f) != 1) {
        ESP_LOGE(TAG, "Cannot read header");
        fclose(f);
        return false;
    }

    // Validate magic
    if (hdr.magic[0] != 0x4B || hdr.magic[1] != 0x50 ||
        hdr.magic[2] != 0x00 || hdr.magic[3] != 0x01) {
        ESP_LOGE(TAG, "Invalid magic: %02X %02X %02X %02X",
                 hdr.magic[0], hdr.magic[1], hdr.magic[2], hdr.magic[3]);
        fclose(f);
        return false;
    }

    ESP_LOGI(TAG, "kp: %dx%d, %d-bit, compression=%d, data=%lu bytes",
             hdr.width, hdr.height, hdr.bit_depth, hdr.compression, hdr.data_size);

    uint32_t plane_size = (uint32_t)((hdr.width + 7) / 8) * hdr.height;

    if (hdr.bit_depth == 2 && hdr.compression == 1) {
        // 2-bit LZ4: two separate compressed blocks
        // [lsb_size:4][lsb_data:N][msb_size:4][msb_data:M]

        // Read LSB block size
        uint32_t lsb_comp_size;
        fread(&lsb_comp_size, 4, 1, f);

        // Read LSB compressed data
        uint8_t *lsb_comp = malloc(lsb_comp_size);
        if (!lsb_comp) { ESP_LOGE(TAG, "OOM lsb_comp"); fclose(f); return false; }
        fread(lsb_comp, 1, lsb_comp_size, f);

        // Decompress LSB plane
        uint8_t *lsb_plane = malloc(plane_size);
        if (!lsb_plane) { free(lsb_comp); fclose(f); return false; }
        int dec = LZ4_decompress_safe((const char *)lsb_comp, (char *)lsb_plane,
                                       lsb_comp_size, plane_size);
        free(lsb_comp);
        if (dec < 0) { ESP_LOGE(TAG, "LZ4 LSB fail: %d", dec); free(lsb_plane); fclose(f); return false; }

        // Send LSB to display
        x4_display_grayscale_lsb(lsb_plane);
        free(lsb_plane);

        // Read MSB block size
        uint32_t msb_comp_size;
        fread(&msb_comp_size, 4, 1, f);

        // Read MSB compressed data
        uint8_t *msb_comp = malloc(msb_comp_size);
        if (!msb_comp) { fclose(f); return false; }
        fread(msb_comp, 1, msb_comp_size, f);

        // Decompress MSB plane
        uint8_t *msb_plane = malloc(plane_size);
        if (!msb_plane) { free(msb_comp); fclose(f); return false; }
        dec = LZ4_decompress_safe((const char *)msb_comp, (char *)msb_plane,
                                   msb_comp_size, plane_size);
        free(msb_comp);
        if (dec < 0) { ESP_LOGE(TAG, "LZ4 MSB fail: %d", dec); free(msb_plane); fclose(f); return false; }

        // Send MSB to display
        x4_display_grayscale_msb(msb_plane);
        free(msb_plane);

        // Refresh with grayscale LUT
        x4_display_grayscale_refresh(true);

        ESP_LOGI(TAG, "Displayed 2-bit grayscale page");

    } else if (hdr.bit_depth == 1 && hdr.compression == 1) {
        // 1-bit LZ4: single compressed block
        uint8_t *comp = malloc(hdr.data_size);
        if (!comp) { fclose(f); return false; }
        fread(comp, 1, hdr.data_size, f);

        uint8_t *plane = malloc(plane_size);
        if (!plane) { free(comp); fclose(f); return false; }
        int dec = LZ4_decompress_safe((const char *)comp, (char *)plane,
                                       hdr.data_size, plane_size);
        free(comp);
        if (dec < 0) { free(plane); fclose(f); return false; }

        // Copy to framebuffer and display
        memcpy(x4_display_framebuffer(), plane, plane_size);
        free(plane);
        x4_display_update(X4_REFRESH_FULL, true);

        ESP_LOGI(TAG, "Displayed 1-bit page");

    } else if (hdr.compression == 0) {
        // Raw (uncompressed) — read planes directly
        // For simplicity, handle 2-bit raw
        if (hdr.bit_depth == 2) {
            uint8_t *lsb = malloc(plane_size);
            uint8_t *msb = malloc(plane_size);
            if (!lsb || !msb) { free(lsb); free(msb); fclose(f); return false; }
            fread(lsb, 1, plane_size, f);
            fread(msb, 1, plane_size, f);
            x4_display_grayscale(lsb, msb, true);
            free(lsb);
            free(msb);
        } else {
            uint8_t *plane = malloc(plane_size);
            if (!plane) { fclose(f); return false; }
            fread(plane, 1, plane_size, f);
            memcpy(x4_display_framebuffer(), plane, plane_size);
            free(plane);
            x4_display_update(X4_REFRESH_FULL, true);
        }
    }

    fclose(f);
    return true;
}
```

- [ ] **Step 3: Commit**

```bash
git add firmware/src/kp_reader.h firmware/src/kp_reader.c
git commit -m "feat(firmware): implement .kp reader with LZ4 streaming decompression"
```

---

### Task 7: Update firmware main.c to display .kp file

**Files:**
- Modify: `kread/firmware/src/main.c`

- [ ] **Step 1: Add .kp display mode to main.c**

Modify main.c: after x4_init, check if `/sd/test.kp` exists. If yes, display it. Otherwise fall back to button test screen.

```c
// Add to main.c includes:
#include "kp_reader.h"

// In app_main(), after x4_init():
// Try to display a .kp file from SD card
if (x4_sd_mounted()) {
    FILE *test = fopen("/sd/test.kp", "rb");
    if (test) {
        fclose(test);
        ESP_LOGI(TAG, "Found /sd/test.kp — displaying...");
        if (kp_display_file("/sd/test.kp")) {
            ESP_LOGI(TAG, "Page displayed successfully. Press any button to continue.");
            // Wait for button press
            while (1) {
                x4_input_poll();
                x4_input_event_t evt;
                while (x4_input_next_event(&evt)) {
                    if (evt.type == X4_EVT_PRESS) {
                        goto button_test;
                    }
                }
                vTaskDelay(pdMS_TO_TICKS(10));
            }
        }
    }
}
button_test:
// ... existing button test code ...
```

- [ ] **Step 2: Build and flash**

```bash
cd kread/firmware && PLATFORMIO_CORE_DIR=C:/pio pio run -t upload 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add firmware/src/main.c
git commit -m "feat(firmware): display .kp file from SD card on boot"
```

---

### Task 8: End-to-end test

- [ ] **Step 1: Generate test.kp in browser**

Open kread web app (`npm run dev`). Click "Convert Test Page". Download `test.kp`.

- [ ] **Step 2: Copy to SD card**

Copy `test.kp` to SD card root: `/sd/test.kp`

- [ ] **Step 3: Insert SD, power on device**

Device should:
1. Initialize x4 SDK
2. Mount SD card
3. Find `/sd/test.kp`
4. LZ4 decompress 2 planes
5. Display grayscale page on e-ink
6. Wait for button press

- [ ] **Step 4: Verify quality**

Compare the displayed text on device with:
- The emulator preview in the browser
- Screenshots of xtcjs output for the same text

The kread rendering should show cleaner text edges (no dithering noise) and better contrast on the e-ink display thanks to gamma correction.

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix: end-to-end test adjustments"
```
