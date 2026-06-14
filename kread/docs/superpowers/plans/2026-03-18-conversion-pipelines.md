# Conversion Pipelines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build two production conversion pipelines — Image→.kp and EPUB→.kb — that produce binary files consumable by both the web emulator and ESP32-C3 firmware.

**Architecture:** Both pipelines share the core eink engine (`quantize.js`, `encoder.js`). Image→.kp is a thin wrapper. EPUB→.kb is a multi-stage pipeline: parse EPUB → extract text/images → render pages with @napi-rs/canvas (Skia, full Harfbuzz shaping) → quantize with gamma correction → encode to .kp pages → assemble .kb container with assets. The web emulator loads .kb files identically to firmware — no canvas text rendering.

**Tech Stack:** @napi-rs/canvas (Skia backend), lz4js, jszip, linkedom (Node DOM for EPUB parsing), yaml parser. Node.js scripts for build-time conversion. Browser-side .kb loader for emulator.

---

## Scope

Two independent pipelines sharing core encoding:

1. **Image → .kp** — JPG/PNG → quantize → .kp (covers, gallery, splash)
2. **EPUB → .kb** — EPUB + config → render → .kb container (book file)

Plus **emulator .kb loader** — parse .kb in browser, extract assets + pages, blit pre-rendered bitmaps (zero canvas text).

## File Structure

### New Files

```
web/src/lib/
  convert/
    image-to-kp.js        # Image → .kp conversion (browser + Node)
    epub-to-kb.js          # EPUB → .kb pipeline (Node only, uses @napi-rs/canvas)
    kb-builder.js          # .kb binary assembler (header, page table, assets, pages)
    page-renderer.js       # Text → canvas pages (replaces renderer.js, Node-only)
    asset-gen.js           # Pre-render book assets (title, author, cover, chapters)
  kb/
    kb-reader.js           # .kb parser for browser (emulator loads .kb files)

web/scripts/
  convert-image.mjs        # CLI: node scripts/convert-image.mjs input.jpg output.kp
  convert-epub.mjs         # CLI: node scripts/convert-epub.mjs input.epub output.kb [--config]
  gen-demo-kb.mjs          # Generate demo .kb for emulator testing
```

### Modified Files

```
web/src/lib/eink/encoder.js       # Add KP v2 header support (content_flags)
web/src/lib/eink/quantize.js      # Add 1-bit threshold for B&W mode
web/src/lib/eink/index.js         # Export new functions
web/src/lib/ui/asset-loader.js    # Add .kb loading support
web/src/emulator/Emulator.svelte  # Load demo.kb on mount
web/src/emulator/state-machine.js # Accept .kb book data
web/src/lib/ui/screens/home.js    # Blit title/author/cover from .kb assets
web/src/lib/ui/screens/reader.js  # Render pages from .kb page buffers
web/package.json                  # Add convert scripts
```

### Notes

- **epub.js uses browser DOMParser** — Node pipeline needs `linkedom` as DOM polyfill. Add `npm install linkedom` to Task 6 setup. Create a Node-compatible EPUB parser wrapper or polyfill DOMParser.
- **LSB/MSB vs bw/gs naming** — In existing code: `bw = level >> 1` (=MSB in spec), `gs = level & 1` (=LSB in spec). For bit_depth=3 gray sub-blocks: first sub-block (LSB) = `gs` plane, second sub-block (MSB) = `bw` plane.
- **Dithering** — gamma-threshold for text, Atkinson for images, 1-bit for B&W mode.
- **Text layout** — Knuth-Plass line breaking (ported from Papyrix), justified or left-aligned (default: left), soft hyphenation, CJK word breaking, RTL support.
- **Mixed pages** — v1 produces text-only pages (content_flags=0x01). Image extraction from EPUB + region masks is future work.
- **Memory** — Process pages in batches (50 at a time) to avoid OOM on large EPUBs. Track offsets incrementally for page table assembly.

---

## Task 1: KP v2 Header + 1-bit Encoding

Update encoder to support .kp v2 format (content_flags field) and 1-bit B&W encoding per spec.

**Files:**
- Modify: `web/src/lib/eink/encoder.js`
- Modify: `web/src/lib/eink/quantize.js`
- Modify: `web/src/lib/eink/index.js`

- [ ] **Step 1: Add 1-bit quantization to quantize.js**

```js
// Add to quantize.js
export function quantize1bit(rgba, width, height) {
  const pixels = new Uint8Array(width * height)
  for (let i = 0; i < width * height; i++) {
    const gray = 0.299 * rgba[i*4] + 0.587 * rgba[i*4+1] + 0.114 * rgba[i*4+2]
    pixels[i] = gray < 128 ? 0 : 1
  }
  return pixels
}
```

- [ ] **Step 2: Add 1-bit plane packing to encoder.js**

```js
export function pixelsTo1bitPlane(pixels, w, h) {
  const rowBytes = Math.ceil(w / 8)
  const plane = new Uint8Array(rowBytes * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[y * w + x]) {
        plane[y * rowBytes + (x >> 3)] |= 1 << (7 - (x & 7))
      }
    }
  }
  return { plane, width: w, height: h }
}
```

- [ ] **Step 3: Add encodeKpV2() — KP v2 with content_flags**

```js
export function encodeKpV2(opts) {
  // opts: { bitDepth: 1|2|3, compression: 0|1, contentFlags: 0x00-0x03 }
  // Magic: KP\x00\x02
  //
  // bitDepth=1: [bw_size:4][bw_lz4]
  //
  // bitDepth=2: [lsb_size:4][lsb_lz4][msb_size:4][msb_lz4]
  //   Note: lsb = gs plane (level & 1), msb = bw plane (level >> 1)
  //
  // bitDepth=3: [bw_size:4][bw_lz4]
  //             [gray_size:4][gray_data]  ← gray_data contains nested:
  //               [lsb_size:4][lsb_lz4][msb_size:4][msb_lz4]
  //             [mask_size:4][mask_lz4]   ← only if contentFlags=0x03
  //
  // data_size in header = total bytes of ALL blocks including their size prefixes.
  // e.g., for bitDepth=3: data_size = (4+bw) + (4+gray_total) + (4+mask if present)
}
```

- [ ] **Step 4: Update index.js exports**

- [ ] **Step 5: Verify existing gen-ui-assets still works**

Run: `node scripts/gen-ui-assets.mjs`

- [ ] **Step 6: Commit**

```
feat: add KP v2 header + 1-bit encoding support
```

---

## Task 2: Image → .kp Pipeline

Thin wrapper: load image → draw on canvas → quantize → encode.

**Files:**
- Create: `web/src/lib/convert/image-to-kp.js`
- Create: `web/scripts/convert-image.mjs`

- [ ] **Step 1: Create image-to-kp.js**

```js
// Accepts: canvas (from @napi-rs/canvas loadImage), options
// Returns: Uint8Array (.kp binary)
//
// Options:
//   width/height — target dimensions (default: 480×800 portrait or 800×480 landscape)
//   bitDepth — 1 (B&W), 2 (grayscale), default 2
//   dither — 'gamma'|'threshold'|'floyd-steinberg'|... (default 'gamma')
//   gamma — gamma value (default 1.8)
//   compression — 0|1 (default 1 = LZ4)
//   rotate — true if portrait→landscape rotation needed
//   fit — 'cover'|'contain'|'stretch' (default 'contain')
```

Core logic:
1. Load image onto canvas at target dimensions (with fit mode)
2. Quantize: select algorithm from dither option
3. Pack planes (portrait or landscape based on rotate flag)
4. Encode to .kp v2 binary
5. Return Uint8Array

- [ ] **Step 2: Create convert-image.mjs CLI**

```
Usage: node scripts/convert-image.mjs <input> <output> [options]
  --depth 1|2        Bit depth (default: 2)
  --dither <algo>    Quantization algorithm (default: gamma)
  --landscape        Output in landscape orientation
  --fit <mode>       cover|contain|stretch (default: contain)
```

- [ ] **Step 3: Test with cover-demo.jpg**

```bash
node scripts/convert-image.mjs public/cover-demo.jpg test-cover.kp --depth 2
# Verify: file exists, header is valid, can be loaded by asset-loader
```

- [ ] **Step 4: Commit**

```
feat: add image → .kp conversion pipeline
```

---

## Task 3: Page Renderer (Node.js)

Render text paragraphs to page-sized canvases using @napi-rs/canvas (Skia backend with full Harfbuzz shaping). This replaces the browser-only `renderer.js`.

**Files:**
- Create: `web/src/lib/convert/page-renderer.js`

- [ ] **Step 1: Create page-renderer.js**

```js
import { createCanvas, GlobalFonts } from '@napi-rs/canvas'

// Register fonts
export function registerFont(path, name) {
  GlobalFonts.registerFromPath(path, name)
}

// Render paragraphs to array of canvases
export function renderPages(paragraphs, opts = {}) {
  // opts: pageWidth, pageHeight, fontFamily, fontSize, lineHeight,
  //       marginTop, marginBottom, marginLeft, marginRight,
  //       indent (first-line), paragraphSpacing
  //
  // Returns: Canvas[] (one per page)
  // Each canvas is pageWidth × pageHeight, white bg, black text
  //
  // Advanced: handle headings (h1-h6) with larger/bold fonts,
  //   blockquotes with indentation, lists with bullets
}
```

Key differences from existing `renderer.js`:
- Uses `@napi-rs/canvas` (Skia backend) instead of browser canvas
- Returns Canvas objects (not ImageData) — caller quantizes
- Supports heading detection from paragraph metadata
- Font registered via GlobalFonts (Literata, Atkinson, etc.)

- [ ] **Step 2: Test with sample text**

```bash
node -e "
import { renderPages, registerFont } from './src/lib/convert/page-renderer.js'
registerFont('./public/fonts/AtkinsonHyperlegible-Regular.ttf', 'Atkinson')
const pages = renderPages(['Hello world. This is a test.'], { fontFamily: 'Atkinson', fontSize: 24, pageWidth: 480, pageHeight: 800 })
console.log('Pages:', pages.length, 'Size:', pages[0].width, '×', pages[0].height)
"
```

- [ ] **Step 3: Commit**

```
feat: add Node.js page renderer with @napi-rs/canvas
```

---

## Task 4: Book Asset Generator

Pre-render book-specific assets: title, author, font name, chapter names, cover thumbnail.

**Files:**
- Create: `web/src/lib/convert/asset-gen.js`

- [ ] **Step 1: Create asset-gen.js**

```js
import { renderTextAsset, encodeKp } from '../../../scripts/lib/asset-renderer.mjs'

// Asset types (match kb spec)
export const ASSET_FONT_NAME    = 0x00
export const ASSET_BOOK_TITLE   = 0x01
export const ASSET_BOOK_AUTHOR  = 0x02
export const ASSET_COVER        = 0x03
export const ASSET_CHAPTER_NAME = 0x04

// Generate all book assets
export function generateBookAssets(meta, opts = {}) {
  // meta: { title, author, fontFamily, chapters: [{title}], coverCanvas }
  // Returns: Array<{ type, index, kpData: Uint8Array, width, height }>
  //
  // Renders:
  //   ASSET_BOOK_TITLE — title at container width (e.g. 424px), word-wrapped
  //   ASSET_BOOK_AUTHOR — author at container width
  //   ASSET_FONT_NAME — font name string
  //   ASSET_COVER — cover image quantized to 2-bit
  //   ASSET_CHAPTER_NAME × N — each chapter title
  //
  // All text assets: bit_depth=1 (B&W, aggressive hinting)
  // Cover: bit_depth=2 (grayscale)
}
```

- [ ] **Step 2: Test with demo book data**

- [ ] **Step 3: Commit**

```
feat: add book asset generator (title, author, cover, chapters)
```

---

## Task 5: .kb Binary Assembler

Assemble all components into a valid .kb v2 binary.

**Files:**
- Create: `web/src/lib/convert/kb-builder.js`

- [ ] **Step 1: Create kb-builder.js**

```js
// Assembles a .kb v2 binary from components
export function buildKb(opts) {
  // opts: {
  //   pages: Array<Uint8Array>,         // .kp page blobs
  //   chapters: number[],                // page indices for chapter starts
  //   assets: Array<{ type, index, kpData }>,  // pre-rendered assets
  //   metadata: object,                  // converter JSON metadata
  //   fontSizeIdx: number,               // 0-4
  //   orientation: number,               // 0=portrait, 1=landscape
  //   mode: number,                      // 0=light, 1=dark
  //   flags: number,                     // 0x01=HAS_DUAL_MODE
  // }
  //
  // Binary layout (from spec):
  //   [header 32 bytes]
  //   [page_table: 8 bytes × page_count]
  //   [chapter_offsets: 2 bytes × chapter_count]
  //   [asset_index: 12 bytes × asset_count] [asset_data]
  //   [page_data: kp blobs concatenated]
  //   [metadata: JSON blob]
  //
  // Returns: Uint8Array (complete .kb file)
}
```

Header fields per spec:
```
magic: KB\x00\x02
page_count, chapter_count, rendition_count=1
font_size_idx, orientation, mode, flags
page_table_offset, chapter_offset, asset_offset, asset_count
meta_offset, meta_size
```

- [ ] **Step 2: Write a round-trip test**

Build minimal .kb → parse header → verify offsets and magic.

- [ ] **Step 3: Commit**

```
feat: add .kb v2 binary assembler
```

---

## Task 6: EPUB → .kb Pipeline

Full pipeline combining parser, renderer, asset generator, and assembler.

**Files:**
- Create: `web/src/lib/convert/epub-to-kb.js`
- Create: `web/scripts/convert-epub.mjs`

- [ ] **Step 1: Create epub-to-kb.js**

```js
// Full EPUB → .kb conversion pipeline
export async function convertEpubToKb(epubBuffer, config = {}) {
  // config: {
  //   fontFamily: 'Literata',
  //   fontSize: '11pt',       // → fontSizeIdx
  //   orientation: 'portrait', // → 0
  //   mode: 'light',          // → 0
  //   gamma: 1.8,
  //   dither: 'gamma',        // for images
  //   dualMode: true,         // bit_depth=3 for pages
  // }
  //
  // Pipeline:
  // 1. parseEpub(epubBuffer) → { title, author, chapters }
  // 2. extractText per chapter → paragraphs[]
  // 3. registerFont(fontFamily)
  // 4. renderPages(paragraphs, pageOpts) → Canvas[]
  // 5. For each canvas: quantize → encode .kp (bit_depth=3 if dualMode)
  //    - B&W version: quantize1bit
  //    - Grayscale version: quantizeGamma
  //    - Content flags from text/image detection
  // 6. generateBookAssets(meta) → asset kp blobs
  // 7. Compute chapter page indices from pagination
  // 8. buildKb({ pages, chapters, assets, metadata })
  //
  // Returns: Uint8Array (.kb file)
}
```

- [ ] **Step 2: Create convert-epub.mjs CLI**

```
Usage: node scripts/convert-epub.mjs <input.epub> <output.kb> [options]
  --font <family>     Font family (default: Literata)
  --size <pt>         Font size: 8,10,11,12,14 (default: 11)
  --orientation <o>   portrait|landscape (default: portrait)
  --mode <m>          light|dark (default: light)
  --dither <algo>     Image dithering algorithm (default: gamma)
  --no-dual           Disable dual-mode (bit_depth=2 only)
```

- [ ] **Step 3: Test with a real EPUB file**

```bash
node scripts/convert-epub.mjs test.epub test.kb --font Literata --size 11
# Verify: file created, header valid, page count > 0
```

- [ ] **Step 4: Commit**

```
feat: add EPUB → .kb conversion pipeline
```

---

## Task 7: .kb Reader for Browser

Parse .kb files in browser for the emulator (mirrors firmware kb_reader).

**Files:**
- Create: `web/src/lib/kb/kb-reader.js`

- [ ] **Step 1: Create kb-reader.js**

```js
// Browser-side .kb parser (mirrors firmware kb_reader.c)
export class KbReader {
  constructor(buffer) {
    // Parse header, page table, chapters, asset index
    this.buffer = buffer
    this._parseHeader()
    this._parsePageTable()
    this._parseChapters()
    this._parseAssetIndex()
  }

  // Getters
  get pageCount()
  get chapterCount()
  get metadata()  // parsed JSON from converter metadata section

  // Read a page as decoded pixel levels + ImageData
  getPage(pageNum) → { w, h, pixels, imageData, bitDepth, contentFlags }

  // Read an asset by type+index
  getAsset(type, index = 0) → { w, h, pixels, imageData, bitDepth }

  // Get all chapter start pages
  getChapters() → number[]

  // Convenience: get book title/author/cover as ImageData
  getTitle() → ImageData
  getAuthor() → ImageData
  getCover() → ImageData
  getChapterName(idx) → ImageData
}
```

Needs a `decodeKpV2()` function that handles ALL bit_depth variants:
- bit_depth=1: single plane (for B&W assets)
- bit_depth=2: two planes LSB+MSB (for covers, bit_depth=2 assets)
- bit_depth=3: dual-mode with B&W + gray sub-blocks + optional mask (for reader pages)

The existing `decodeKp()` in `asset-loader.js` only handles bit_depth=2. Extend it or write a new decoder.

- [ ] **Step 2: Test with generated demo.kb**

- [ ] **Step 3: Commit**

```
feat: add browser .kb reader for emulator
```

---

## Task 8: Generate Demo .kb

Create a script that generates a demo.kb for emulator testing without needing a real EPUB.

**Files:**
- Create: `web/scripts/gen-demo-kb.mjs`

- [ ] **Step 1: Create gen-demo-kb.mjs**

Generates a demo book with:
- Title: "Chip War: Fight for the World's Most Critical Technology"
- Author: "Chris Miller"
- Cover: from `public/cover-demo.jpg`
- 8 chapters with Lorem ipsum text
- ~20 pages total
- Portrait, Literata 11pt, light mode, dual-mode pages

Output: `public/demo.kb`

- [ ] **Step 2: Run and verify**

```bash
node scripts/gen-demo-kb.mjs
# Output: public/demo.kb (~200-500KB)
```

- [ ] **Step 3: Commit**

```
feat: add demo .kb generator for emulator testing
```

---

## Task 9: Integrate .kb into Emulator

Wire the emulator to load demo.kb → extract book assets → blit everything from pre-rendered data. Zero canvas text.

**Files:**
- Modify: `web/src/emulator/Emulator.svelte`
- Modify: `web/src/emulator/state-machine.js`
- Modify: `web/src/lib/ui/screens/home.js`
- Modify: `web/src/lib/ui/screens/reader.js`

- [ ] **Step 1: Update Emulator.svelte to load demo.kb**

```js
onMount(async () => {
  // Load UI assets
  await preloadAssets(assetKeys, 'en')

  // Load demo book
  const resp = await fetch(`${import.meta.env.BASE_URL}demo.kb`)
  if (resp.ok) {
    const buffer = await resp.arrayBuffer()
    const book = new KbReader(buffer)
    machine.loadBook(book)
  }

  machine.render()
  onVersionBump?.()
})
```

- [ ] **Step 2: Update state machine — loadBook()**

```js
loadBook(kbReader) {
  d.book = kbReader
  d.hasBook = true
  d.bookTitle = kbReader.metadata?.title || ''
  d.bookAuthor = kbReader.metadata?.author || ''
  d.totalPages = kbReader.pageCount
  d.currentPage = 0
  // Cover, title bitmap, author bitmap available via kbReader.getAsset()
}
```

- [ ] **Step 3: Update home.js — blit title/author/cover from .kb**

Replace canvas `fillText` calls with:
```js
// Title — blit from .kb asset
const titleAsset = book?.getTitle()
if (titleAsset) blitAsset(ctx, titleAsset, infoX, titleY)

// Author — blit from .kb asset
const authorAsset = book?.getAuthor()
if (authorAsset) blitAsset(ctx, authorAsset, infoX, authorY)

// Cover — blit from .kb asset
const coverAsset = book?.getCover()
if (coverAsset) {
  // Scale to fit cover area, blit
}
```

- [ ] **Step 4: Update reader.js — display pages from .kb**

```js
// Instead of Lorem ipsum canvas text:
const page = book?.getPage(currentPage)
if (page) ctx.putImageData(page.imageData, 0, 0)
```

- [ ] **Step 5: Remove all canvas fillText from screen renderers**

Grep for remaining `fillText` calls and replace with pre-rendered asset blits. List items in library/settings/gallery that still use canvas text should also blit from .kp assets (labels/values from definitions.yaml).

- [ ] **Step 6: Verify emulator shows all pre-rendered content**

All text on every screen must come from .kp (UI assets) or .kb (book assets). Zero `fillText` calls in rendering path.

- [ ] **Step 7: Commit**

```
feat: emulator loads .kb, zero canvas text rendering
```

---

## Task 10: npm Scripts + Cleanup

Wire everything into package.json and clean up deprecated scripts.

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Add conversion scripts**

```json
{
  "scripts": {
    "convert:image": "node scripts/convert-image.mjs",
    "convert:epub": "node scripts/convert-epub.mjs",
    "gen:assets": "node scripts/gen-ui-assets.mjs && node scripts/gen-ui-assets.mjs --lang vi && cp -r resources/assets public/",
    "gen:demo": "node scripts/gen-demo-kb.mjs",
    "prebuild": "npm run gen:assets && npm run gen:demo"
  }
}
```

- [ ] **Step 2: Remove deprecated files**

- `scripts/lib/dict-encoder.mjs` → replaced by `asset-renderer.mjs`
- `scripts/lib/dict-icons.mjs` → drawing moved to `asset-renderer.mjs`
- `scripts/gen-dictionary.mjs` → replaced by `gen-ui-assets.mjs`
- `web/src/lib/renderer.js` → replaced by `convert/page-renderer.js`
- `web/resources/definitions.json` → already deleted

- [ ] **Step 3: Commit**

```
chore: add conversion scripts, remove deprecated files
```

---

## Dependencies Between Tasks

```
Task 1 (KP v2) ──┬── Task 2 (Image→.kp)
                  ├── Task 3 (Page renderer)
                  │     └── Task 6 (EPUB→.kb) ── Task 8 (Demo .kb)
                  └── Task 4 (Asset gen)                │
                        └── Task 5 (KB builder) ────────┘
                                                        │
Task 7 (.kb reader) ───────────────── Task 9 (Emulator integration)
                                                        │
                                              Task 10 (Cleanup)
```

Tasks 1-5 can be partially parallelized. Task 6 depends on 1-5. Tasks 7-9 depend on 6+8. Task 10 is last.

---

## Key Design Decisions

1. **Dual-mode pages (bit_depth=3)**: Every reader page stores BOTH B&W and grayscale versions. Firmware picks based on user settings. Text B&W uses aggressive hinting, text grayscale uses light hinting + gamma AA.

2. **Assets in .kb are bit_depth=1** (B&W only) for sharpest UI text. Cover is bit_depth=2. Reader pages are bit_depth=3.

3. **Node.js only for conversion**: @napi-rs/canvas requires Node. Browser-side conversion is NOT supported (no Skia in browser). The web app's "Convert" button will use a Web Worker or server-side call.

4. **Emulator loads .kb natively**: Same binary format as firmware reads. The browser .kb reader mirrors firmware's kb_reader.c logic.

5. **Zero canvas text in emulator**: After Task 9, all rendered text comes from pre-rendered .kp/.kb bitmaps. `fillText` is completely eliminated from the rendering path.
