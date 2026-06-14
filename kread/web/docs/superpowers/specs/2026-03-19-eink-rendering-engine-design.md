# E-Ink Rendering Engine — Design Spec

**Date:** 2026-03-19
**Status:** Draft
**Replaces:** @napi-rs/canvas (Skia) text rendering pipeline

## Problem

The current text rendering pipeline uses `@napi-rs/canvas` (Skia native addon) which:

1. **Cannot render proper 1-bit text** — `ctx.antialias='none'` is ignored for text. The B&W layer is produced by thresholding the anti-aliased grayscale render, losing hinting benefits.
2. **Gives no control over hinting mode or stem darkening** — Skia delegates to OS font engine (DirectWrite on Windows), which is optimized for screen display, not 4-level e-ink quantization.
3. **Only runs in Node.js** — users cannot convert EPUB/images in the browser without a server.
4. **Is a heavy native dependency** (~50MB) that complicates CI and cross-platform builds.
5. **Logic is scattered** across 3 separate files (asset-renderer.mjs, asset-gen.js, page-renderer.js) with duplicated rendering code.

## Solution

A unified rendering engine (`eink-renderer`) using FreeType WASM + HarfBuzz WASM + pica, replacing all `@napi-rs/canvas` usage. One codebase, same output, runs in both Node.js and browser.

## Architecture

```
src/lib/eink-renderer/
├── engine.js           — public API, lazy WASM init
├── font-manager.js     — font loading, face cache, family/weight/style resolution
├── shaper.js           — HarfBuzz WASM: text → shaped glyph run
├── rasterizer.js       — FreeType WASM: glyph ID → bitmap (mono/gray)
├── text-renderer.js    — compose shaped glyphs into pixel buffer
├── compositor.js       — pixel buffer management + primitives (fillRect, hline)
├── glyph-cache.js      — LRU cache: (glyphId, size, mode) → rendered bitmap
├── image-resizer.js    — pica: resize with Lanczos3
├── quantize.js         — existing 11 algorithms (moved here, unchanged)
└── encoder.js          — existing KP/plane packing (moved here, unchanged)
```

### Dependencies

| Remove | Add |
|--------|-----|
| `@napi-rs/canvas` (~50MB native) | FreeType WASM (~800KB) — self-compiled via Emscripten |
| | `harfbuzzjs` (~1.5MB WASM) |
| | `pica` (~45KB JS) |
| | `jpeg-js` + `pngjs` (~50KB JS, image decode) |

No native dependencies. Runs in Node.js and browser identically.

## FreeType WASM Strategy

The `freetype-wasm` npm package (Ciantic) has ~2 downloads/week and inactive maintenance. **We will self-compile FreeType to WASM** using Emscripten to guarantee access to the full C API:

- `FT_Set_Char_Size`, `FT_Load_Glyph` with arbitrary load flags
- `FT_Render_Glyph` with `FT_RENDER_MODE_MONO` and `FT_RENDER_MODE_NORMAL`
- `FT_Property_Set` for auto-hinter stem darkening
- Direct access to `FT_GlyphSlot.bitmap` data

Reference: the [notes.dt.in.th article](https://notes.dt.in.th/FreeTypeJSBlackWhiteText) demonstrates this approach with a working browser example.

Build script: `scripts/build-freetype-wasm.sh` — compiles FreeType 2.13+ with Emscripten, exports minimal API surface via `cwrap`/`ccall`. Output: `freetype.wasm` + `freetype.js` loader.

## Shaping-to-Rasterization Pipeline

Text goes through three stages with explicit coordinate system conversions:

```
  Text string
      │
      ▼
  ┌─────────────────────────────────────────────────┐
  │ HarfBuzz shaping (font-manager provides hb_font) │
  │                                                   │
  │ Input:  Unicode text, font, script, direction     │
  │ Output: glyph IDs + positions in FONT UNITS       │
  │         (g, ax, ay, dx, dy, cl from buffer.json())│
  │                                                   │
  │ Note: harfbuzzjs returns abbreviated field names:  │
  │   g=glyphId, ax=xAdvance, ay=yAdvance,            │
  │   dx=xOffset, dy=yOffset, cl=cluster              │
  │ Engine maps these to clean names in public API.    │
  └───────────────────┬─────────────────────────────┘
                      │
                      ▼
  ┌─────────────────────────────────────────────────┐
  │ Unit conversion: font units → pixels             │
  │                                                   │
  │ scale = fontSize_px / unitsPerEm                  │
  │ advance_px = advance_funits * scale               │
  │ offset_px  = offset_funits * scale                │
  │                                                   │
  │ Positions tracked as FIXED-POINT (26.6 or float)  │
  │ to preserve sub-pixel accuracy across a line.     │
  │ Only rounded to integer at final composite time.  │
  └───────────────────┬─────────────────────────────┘
                      │
                      ▼
  ┌─────────────────────────────────────────────────┐
  │ FreeType rasterization (per glyph)               │
  │                                                   │
  │ FT_Load_Glyph(face, glyphId, loadFlags)          │
  │ FT_Render_Glyph(slot, renderMode)                │
  │ → slot.bitmap: pixel data                         │
  │ → slot.bitmap_left, bitmap_top: bearing offsets   │
  │                                                   │
  │ Results cached by (glyphId, fontSize, mode) tuple. │
  └───────────────────┬─────────────────────────────┘
                      │
                      ▼
  ┌─────────────────────────────────────────────────┐
  │ Compositing onto page pixel buffer               │
  │                                                   │
  │ x_draw = round(cumulative_advance) + bitmap_left  │
  │ y_draw = baseline_y - bitmap_top                  │
  │                                                   │
  │ Cumulative advance tracks sub-pixel precision.    │
  │ Each glyph placed at integer pixel position       │
  │ derived from the accumulated fractional advance.  │
  └─────────────────────────────────────────────────┘
```

### Sub-pixel positioning

HarfBuzz returns glyph advances in font units. After scaling to pixels, advances are fractional (e.g., 7.3px). If we round each glyph position independently, errors accumulate across a line.

Solution: track cumulative x-position as a float. For each glyph:
```js
let cursorX = 0.0  // sub-pixel precision
for (const glyph of shapedGlyphs) {
  const x = Math.round(cursorX) + glyph.bitmapLeft
  const y = baselineY - glyph.bitmapTop
  compositeGlyph(pageBuffer, pageW, glyph.bitmap, x, y)
  cursorX += glyph.xAdvance_px  // fractional accumulation
}
```

This ensures the last glyph on a line lands at the correct total width, matching HarfBuzz's measurement.

### Vertical metrics

Vertical metrics (ascender, descender, line height) come from **FreeType's `FT_Face.size.metrics`** after calling `FT_Set_Char_Size`. Not from HarfBuzz — HarfBuzz only provides horizontal shaping info.

```js
// After FT_Set_Char_Size(face, 0, fontSize * 64, 0, 0):
const ascender  = face.size.metrics.ascender >> 6   // 26.6 → pixels
const descender = face.size.metrics.descender >> 6
const lineHeight = face.size.metrics.height >> 6
```

## Public API

### Engine lifecycle

```js
import { createEinkEngine } from './eink-renderer/engine.js'

const engine = await createEinkEngine()
// Loads FreeType + HarfBuzz WASM, initializes library instances.
// Lazy — WASM loaded on first call, cached for subsequent use.
```

### Font management

```js
// Load font from ArrayBuffer (works with fetch, fs.readFile, etc.)
engine.loadFont(fontBytes, familyName)
// Registers with both FreeType (rasterizer) and HarfBuzz (shaper).
// Supports multiple weights/styles per family.
// Weight/style resolved from font's OS/2 table or name table.
```

### Text measurement

```js
const metrics = engine.measureText("Hello world", {
  font: { family: "Verdana", size: 18, weight: "bold", style: "italic" },
  direction: "ltr",    // "ltr" | "rtl"
})
// Returns:
// {
//   width: number,          — total advance width in pixels (float)
//   height: number,         — line height in pixels
//   ascender: number,       — pixels above baseline (from FT_Face metrics)
//   descender: number,      — pixels below baseline
//   glyphs: [               — per-glyph shaped info (clean names, mapped from harfbuzzjs)
//     { id, xAdvance, yAdvance, xOffset, yOffset, cluster }
//     // all values in pixels (float), converted from font units
//   ]
// }
```

Used by page-renderer for Knuth-Plass line breaking, word width measurement, and justify spacing.

### Text rendering

```js
const result = engine.renderText("Hello world", {
  font: { family: "Verdana", size: 18, weight: "bold", style: "normal" },
  mode: "mono",       // "mono" | "gray"
  direction: "ltr",   // "ltr" | "rtl"
})
// Returns:
// {
//   width: number,
//   height: number,
//   baseline: number,      — y offset of baseline from top
//   pixels: Uint8Array,    — pixel values, row-major
//   // mode "mono": 1-bit values (0=black, 1=white)
//   // mode "gray": 8-bit coverage (0-255)
// }
```

Internally: shapes the full text string with HarfBuzz → rasterizes each glyph with FreeType (cache hit or render) → composites onto output buffer.

**Line-level shaping:** text is always shaped as a complete run, never word-by-word. This preserves inter-word kerning and cross-boundary ligatures. For EPUB rendering, each line from the layout engine is shaped and rendered as one unit.

#### Render modes

| Mode | FreeType load flags | FreeType render mode | Hinting behavior | Output | Use case |
|------|-------------------|---------------------|---------|--------|----------|
| `mono` | `FT_LOAD_TARGET_MONO \| FT_LOAD_MONOCHROME` | `FT_RENDER_MODE_MONO` | Full pixel snap — stems aligned to integer pixel boundaries on both axes. TrueType bytecode interpreter runs in mono mode. | 1-bit bitmap (1 bit/pixel, packed) | B&W layer of bit_depth=3 |
| `gray` | `FT_LOAD_TARGET_LIGHT` | `FT_RENDER_MODE_NORMAL` | Vertical-only snap — stems aligned vertically, horizontal positions preserve glyph shape. For TrueType fonts: auto-hinter is used (native bytecode hints ignored). | 8-bit coverage (0-255 per pixel) | Grayscale layer → quantize to 2-bit |

**Important distinctions:**
- `FT_LOAD_TARGET_*` controls **hinting algorithm** (how outlines are adjusted to fit pixel grid)
- `FT_RENDER_MODE_*` controls **output format** (1-bit vs 8-bit)
- `FT_LOAD_MONOCHROME` forces monochrome bitmap format during load+render
- All three are independent and must be set correctly together

**Why LIGHT for grayscale at 220 PPI:**
- 220 PPI is above the threshold where horizontal grid-snapping helps readability
- Vertical-only snap preserves natural letterform shapes while keeping stems crisp
- Horizontal sub-pixel information survives better through 4-level quantization
- NORMAL (both-axis snap) would force coverage values to extremes, destroying the intermediate gray levels needed for smooth AA edges after quantization

**TrueType font behavior with LIGHT:** `FT_LOAD_TARGET_LIGHT` with .ttf fonts (Verdana, Zilla Slab) falls back to FreeType's auto-hinter, bypassing the font's native TrueType bytecode hints. This is acceptable — the auto-hinter with vertical-only snap produces better results for 4-level quantization than full bytecode hinting would.

#### Stem emboldening (grayscale mode)

Thin strokes at small sizes risk vanishing when 8-bit coverage is quantized to 4 levels. A stroke at ~30% coverage maps to "light gray" which may be visually indistinguishable from background on e-ink.

**Approach: `FT_Outline_EmboldenXY` before rasterization.**

This thickens the vector outline before FreeType rasterizes it, so the rasterizer produces proper anti-aliased edges for the emboldened shape. Superior to bitmap-level dilation which creates blocky artifacts.

```js
// In rasterizer.js, before FT_Render_Glyph:
if (mode === 'gray' && fontSize < emboldenThreshold) {
  // Embolden outline in 26.6 fixed-point units
  // strength ~32 (0.5px) at 14px, ~16 (0.25px) at 22px, 0 above threshold
  const strength = computeEmboldenStrength(fontSize)
  FT_Outline_EmboldenXY(slot.outline, strength, strength)
}
FT_Render_Glyph(slot, FT_RENDER_MODE_NORMAL)
```

**Why not `FT_Property_Set` stem darkening?** It only works for CFF driver and auto-hinter module. While `TARGET_LIGHT` with TrueType fonts does use the auto-hinter (so stem darkening would technically apply), this is fragile — it depends on fallback behavior. `FT_Outline_EmboldenXY` works for all font formats reliably.

Parameters to tune empirically:
- Embolden strength curve: f(fontSize) → 26.6 fixed-point units
- Threshold above which emboldening is disabled (e.g., ≥ 28px)
- May differ between mono and gray modes

### Image resizing

```js
const result = engine.resizeImage(rgbaPixels, {
  srcW: 1200, srcH: 1600,
  dstW: 300, dstH: 400,
  fit: "contain",    // "contain" | "cover" | "stretch"
  background: 0xFF,  // fill color for letterbox (white)
})
// Returns:
// {
//   width: 300, height: 400,
//   pixels: Uint8Array,    — RGBA, row-major
// }
```

Uses pica with Lanczos3 filter. Same algorithm in Node.js and browser.

### Image decoding

Separate from resize. Pure-JS decoders for zero native dependencies:

- **Browser:** `createImageBitmap()` → OffscreenCanvas → `getImageData` (built-in, zero cost)
- **Node.js:** `jpeg-js` (decode JPEG), `pngjs` (decode PNG) — pure JS, ~50KB total

No `sharp` dependency. Fully portable.

## Glyph Cache

Rendering EPUB pages involves 200-400+ glyphs per page. Each `FT_Load_Glyph` + `FT_Render_Glyph` call through WASM has overhead. A glyph bitmap cache eliminates redundant rendering.

```js
// Cache key: (glyphId, fontSize, mode)
// Value: { width, height, bitmapLeft, bitmapTop, pixels: Uint8Array }
// Eviction: LRU, max ~2000 entries (covers a full book with 1-2 fonts)

class GlyphCache {
  get(glyphId, fontSize, mode) { ... }
  set(glyphId, fontSize, mode, bitmap) { ... }
}
```

At 18px Verdana, most Latin text uses ~70 unique glyphs. The cache reaches steady state almost immediately.

## Rendering Config

All rendering parameters are passed to the engine as a config object. Two sources:

- **Web UI (Library tab):** user picks per-book before converting EPUB → .kb
- **Node.js scripts (gen-demo-kb.mjs, etc.):** hardcoded defaults, tuned by developer

Both feed into the same engine — config is just a plain object.

### Config structure

```js
const renderConfig = {
  // ── Font ──
  bodyFont: "Zilla Slab",       // user-selected body font family
  uiFont: "Verdana",            // always Verdana for title/author/chapter/footer
  fontSize: 22,                 // body text size in px (range: 16–32)

  // ── Render mode ──
  textMode: "gray",             // "mono" | "gray" — which FreeType pipeline
  imageMode: "gray",            // "mono" | "gray" — cover/image dithering

  // ── Mode-specific options ──
  mono: {
    // (no extra options — FT_LOAD_TARGET_MONO is deterministic)
  },
  gray: {
    gamma: 1.8,                 // e-ink gamma correction for quantization
    emboldenThreshold: 24,      // apply stem emboldening below this size (px)
    emboldenStrength: 0.4,      // max emboldening at smallest sizes (0.0–1.0)
  },

  // ── Layout ──
  pageWidth: 480,
  pageHeight: 800,
  marginTop: 28,
  marginBottom: 12,
  marginLeft: 28,
  marginRight: 28,
  lineHeight: 1.5,              // multiplier on fontSize
  paragraphSpacing: 0.5,        // multiplier on lineHeight
  firstLineIndent: 0,           // px (0 = no indent)
  align: "left",                // "left" | "justify" | "center"
  hyphenation: true,            // soft-hyphen line breaking

  // ── Image dithering ──
  coverDither: "blue-noise",    // algorithm for B&W cover layer
  coverGrayDither: "gamma",     // algorithm for grayscale cover layer
}
```

### Web UI (Library tab)

The Library tab exposes these controls before EPUB conversion:

| Control | Config field | Options |
|---------|-------------|---------|
| Font | `bodyFont` | Dropdown: fonts available in public/fonts/ |
| Font size | `fontSize` | Slider or presets: 16, 18, 20, 22, 24, 28, 32 |
| Text mode | `textMode` | Toggle: B&W / Grayscale |
| Image mode | `imageMode` | Toggle: B&W / Grayscale |
| Gamma | `gray.gamma` | Slider: 1.0–2.5 (default 1.8) |
| Margins | `marginTop/Bottom/Left/Right` | Slider or presets |
| Line spacing | `lineHeight` | Presets: 1.2, 1.4, 1.5, 1.6, 1.8 |
| Alignment | `align` | left / justify / center |

These are per-book — each .kb file is generated with its own config. Config is stored in the .kb metadata section so the web app can show what settings were used.

### Node.js defaults

```js
// gen-demo-kb.mjs and other build scripts
const DEFAULT_CONFIG = {
  bodyFont: "Zilla Slab",
  uiFont: "Verdana",
  fontSize: 22,
  textMode: "gray",
  imageMode: "gray",
  gray: { gamma: 1.8, emboldenThreshold: 24, emboldenStrength: 0.4 },
  pageWidth: 480, pageHeight: 800,
  marginTop: 28, marginBottom: 12, marginLeft: 28, marginRight: 28,
  lineHeight: 1.5, paragraphSpacing: 0.5,
  firstLineIndent: 0, align: "left", hyphenation: true,
  coverDither: "blue-noise", coverGrayDither: "gamma",
}
```

Developer tunes these defaults empirically. When optimal config is found, it becomes the default for web UI as well.

## Pipeline Consumers

### 1. UI text assets (gen-ui-assets.mjs → asset-renderer.mjs)

**Before:** Skia canvas + fillText + gamma quantize + 3x supersample hack for B&W

**After:**
```
definitions.yaml → for each text asset:
  engine.renderText(text, { font, mode: "gray" })  → quantizeGamma → gsPlanes
  engine.renderText(text, { font, mode: "mono" })  → bwPlane
  encodeKpV2({ bitDepth: 3, bw: bwPlane, grayLsb, grayMsb })
  → write .kp file
```

Icon/triangle drawing: geometric shapes (not text), rendered to a small pixel buffer with basic scan-line fill. No canvas needed.

### 2. Book metadata assets (asset-gen.js)

**Before:** Skia canvas + fillText + word wrap + gamma quantize + supersample

**After:**
```
for title/author/chapters:
  engine.measureText(text, { font }) → get width for truncation
  engine.renderText(text, { font, mode: "gray" }) → gsPlanes
  engine.renderText(text, { font, mode: "mono" }) → bwPlane
  encodeKpV2({ bitDepth: 3 }) → asset kpData
```

Word wrapping for title: measure words with `engine.measureText()`, break lines, render each line separately, compose into final buffer.

### 3. EPUB page rendering (page-renderer.js)

**Before:** Skia canvas for everything — measureText, fillText, fillRect, word layout, Knuth-Plass

**After:**
```
for each paragraph:
  for each word:
    engine.measureText(word, { font }) → width for Knuth-Plass

  Knuth-Plass → line breaks + word positions

  for each line:
    assemble line text from words with spacing
    engine.renderText(lineText, { font, mode }) → line bitmap
    composite line bitmap onto page pixel buffer at (marginLeft, lineY)

  page pixel buffer → quantize → encodeKpV2
```

**Key design decision:** shape and render **entire lines**, not individual words. HarfBuzz shapes the full line to preserve kerning and ligatures. Justified spacing is achieved by adjusting inter-word space widths before shaping, or by inserting space characters with modified advance.

Page buffer: a `Uint8Array(480 * 800)` managed in JS. Background fill, horizontal rules, bullet points are simple pixel operations on this buffer (compositor.js).

### 4. Image conversion (image-to-kp.js)

**Before:** `@napi-rs/canvas` loadImage + drawImage + getImageData

**After:**
```
input image bytes
  → decode (browser: createImageBitmap, Node: jpeg-js/pngjs)
  → engine.resizeImage(pixels, { dstW, dstH, fit })
  → quantize (gamma/atkinson/blue-noise/etc.)
  → encodeKpV2
```

## Pixel Buffer Management

Instead of canvas, the engine works with raw `Uint8Array` pixel buffers:

```js
// Page buffer for EPUB rendering
const pageW = 480, pageH = 800
const page = new Uint8Array(pageW * pageH)  // 8-bit grayscale
page.fill(255)  // white background

// Composite a glyph bitmap onto the page buffer
function compositeGlyph(page, pageW, pageH, bitmap, x, y) {
  for (let gy = 0; gy < bitmap.height; gy++) {
    const py = y + gy
    if (py < 0 || py >= pageH) continue
    for (let gx = 0; gx < bitmap.width; gx++) {
      const px = x + gx
      if (px < 0 || px >= pageW) continue
      const coverage = bitmap.pixels[gy * bitmap.width + gx]
      // Blend: darker wins (text on white background)
      page[py * pageW + px] = Math.min(page[py * pageW + px], 255 - coverage)
    }
  }
}

// Simple primitives (no canvas needed)
function fillRect(buf, bufW, x, y, w, h, value) { ... }
function hline(buf, bufW, x, y, w, value) { ... }
```

## BiDi / RTL Support

The engine supports bidirectional text:

- `direction` parameter in `measureText` / `renderText`: `"ltr"` or `"rtl"`
- HarfBuzz handles script-specific shaping (Arabic joining, Hebrew, etc.)
- Compositing places glyphs in visual order (HarfBuzz output is already in visual order)
- Page-renderer handles mixed LTR/RTL paragraphs via the existing `rtl` option

The layout engine (Knuth-Plass) determines line breaks. The rendering engine handles glyph placement within each line based on direction.

## What Does NOT Change

- **Emulator compositing** — browser `<canvas>` for blitting pre-rendered assets + drawing primitives. Simulates firmware framebuffer operations.
- **quantize.js** — all 11 quantization algorithms (input changes from RGBA to grayscale, algorithms adapted).
- **encoder.js** — KP v1/v2 encoding, plane packing, LZ4 compression.
- **asset-loader.js** — browser-side KP decoding and mode-aware blitting.
- **kb-reader.js / kb-builder.js** — KB format read/write.
- **definitions.yaml** — UI layout definitions.
- **Emulator state machine** — screen states, button handling, mode switching.

## Dynamic Components (battery, progress bar, arrows, triangles)

Currently rendered by `renderDynamicFrame()` using canvas strokeRect, lineTo, fill.

Convert to pixel buffer operations in `compositor.js` — inline fill/stroke for rectangles, triangles, lines. These are simple geometric shapes, no canvas needed.

## WASM Loading Strategy

```js
let ftModule = null, hbModule = null

async function initWasm() {
  if (ftModule) return
  // Self-compiled FreeType WASM — loader generated by Emscripten
  const ftInit = (await import('./wasm/freetype.js')).default
  const hbInit = (await import('harfbuzzjs')).default
  ;[ftModule, hbModule] = await Promise.all([ftInit(), hbInit()])
}
```

- Lazy init on first `createEinkEngine()` call
- WASM files: ~2.3MB total, loaded once, cached
- In browser: fetched from same origin (bundled with app)
- In Node.js: loaded from node_modules / local wasm/

## Migration Strategy

1. **Phase 0:** Spike — self-compile FreeType to WASM, verify API access (FT_LOAD_TARGET_MONO, FT_RENDER_MODE_MONO, bitmap access). Time-boxed: 1 session.
2. **Phase 1:** Build `eink-renderer` module with full API (engine, font-manager, shaper, rasterizer, text-renderer, glyph-cache, compositor)
3. **Phase 2:** Migrate `asset-renderer.mjs` + `gen-ui-assets.mjs` (simplest, single-line text)
4. **Phase 3:** Migrate `asset-gen.js` (book metadata, word-wrapped text)
5. **Phase 4:** Migrate `page-renderer.js` (EPUB pages, Knuth-Plass layout)
6. **Phase 5:** Migrate `image-to-kp.js` (image resize with pica, decode with jpeg-js/pngjs)
7. **Phase 6:** Remove `@napi-rs/canvas` dependency

Each phase is independently testable — compare output with current pipeline.

## Risk & Mitigation

| Risk | Mitigation |
|------|-----------|
| Self-compiling FreeType WASM | FreeType has well-documented Emscripten build. Reference: Ciantic/freetype-wasm, notes.dt.in.th. Phase 0 spike validates feasibility. |
| WASM bundle size (~2.3MB) | Acceptable for web app. Lazy-loaded. Gzip compresses WASM ~40%. |
| Text measurement parity with Skia | FreeType + HarfBuzz is the stack Chrome/Firefox use internally. Metrics will be at least as accurate. |
| Stem darkening for TrueType fonts | Post-processing emboldening filter, tuned empirically. Works for all font formats uniformly. |
| Per-glyph WASM call overhead | Glyph cache eliminates redundant renders. ~70 unique glyphs for Latin at steady state. |
| Page renderer complexity | Layout logic unchanged. Only rendering backend changes (canvas fillText → engine.renderText + composite). |
| Image decode without native deps | jpeg-js + pngjs (pure JS). Browser uses built-in createImageBitmap. |
| Justified text sub-pixel alignment | Cumulative float tracking, round only at composite time. Standard approach used by all text engines. |
