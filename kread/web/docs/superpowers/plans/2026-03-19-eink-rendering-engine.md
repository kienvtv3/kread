# E-Ink Rendering Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@napi-rs/canvas` (Skia) with FreeType WASM + HarfBuzz WASM + pica for a unified text/image rendering engine that runs in both Node.js and browser, with proper 1-bit mono hinting and configurable grayscale rendering.

**Architecture:** A new `src/lib/eink-renderer/` module provides `createEinkEngine()` which wraps FreeType WASM (glyph rasterization), HarfBuzz WASM (text shaping), and pica (image resize). Three existing consumers (asset-renderer, asset-gen, page-renderer) are migrated one by one. Existing quantize.js and encoder.js stay in `src/lib/eink/` and are imported by the new engine.

**Tech Stack:** FreeType 2.13+ (self-compiled to WASM via Emscripten), harfbuzzjs (npm), pica (npm), jpeg-js + pngjs (npm), vitest (testing)

**Spec:** `docs/superpowers/specs/2026-03-19-eink-rendering-engine-design.md`

---

## File Structure

### New files (create)

| File | Responsibility |
|------|---------------|
| `src/lib/eink-renderer/engine.js` | Public API facade, WASM init, delegates to sub-modules |
| `src/lib/eink-renderer/font-manager.js` | Load fonts into FreeType + HarfBuzz, resolve family/weight/style |
| `src/lib/eink-renderer/shaper.js` | HarfBuzz wrapper: text → shaped glyph run with pixel-space positions |
| `src/lib/eink-renderer/rasterizer.js` | FreeType wrapper: glyph ID → bitmap (mono or gray), emboldening |
| `src/lib/eink-renderer/text-renderer.js` | Compose: shape text → rasterize glyphs → composite onto buffer |
| `src/lib/eink-renderer/compositor.js` | Raw pixel buffer management: compositeGlyph, fillRect, hline, strokeRect, fillTriangle |
| `src/lib/eink-renderer/glyph-cache.js` | LRU cache: (glyphId, fontSize, mode) → rendered bitmap |
| `src/lib/eink-renderer/image-resizer.js` | pica wrapper: resize RGBA pixels with Lanczos3 |
| `src/lib/eink-renderer/config.js` | Default render config, merge helper |
| `src/lib/eink-renderer/wasm/` | FreeType WASM build output (freetype.js + freetype.wasm) |
| `scripts/build-freetype-wasm.sh` | Emscripten build script for FreeType → WASM |
| `tests/eink-renderer/glyph-cache.test.js` | Unit tests for glyph cache |
| `tests/eink-renderer/compositor.test.js` | Unit tests for pixel buffer ops |
| `tests/eink-renderer/shaper.test.js` | Integration tests for HarfBuzz shaping |
| `tests/eink-renderer/rasterizer.test.js` | Integration tests for FreeType rendering |
| `tests/eink-renderer/text-renderer.test.js` | Integration tests for full text pipeline |
| `tests/eink-renderer/engine.test.js` | End-to-end tests for public API |
| `tests/eink-renderer/image-resizer.test.js` | Unit tests for pica resize with fit modes |
| `src/lib/eink-renderer/index.js` | Barrel export for clean imports |
| `vitest.config.js` | Vitest configuration |

### Modified files

| File | Change |
|------|--------|
| `package.json` | Add deps: harfbuzzjs, pica, jpeg-js, pngjs, vitest. Remove: @napi-rs/canvas |
| `scripts/lib/asset-renderer.mjs` | Replace canvas text rendering with engine.renderText() |
| `scripts/gen-ui-assets.mjs` | Use engine instead of canvas for text + dynamic frames |
| `src/lib/convert/asset-gen.js` | Replace canvas rendering with engine |
| `src/lib/convert/page-renderer.js` | Replace canvas with engine.measureText() + engine.renderText() |
| `src/lib/convert/image-to-kp.js` | Replace @napi-rs/canvas with engine.resizeImage() + pure-JS decoders |
| `src/lib/convert/epub-to-kb.js` | Update font registration to use engine.loadFont() |
| `scripts/gen-demo-kb.mjs` | Update to use engine instead of canvas |

### Modified (minor adaptation)

| File | Change |
|------|--------|
| `src/lib/eink/quantize.js` | Add grayscale-input variants: current functions take RGBA (4 bytes/px), engine outputs 8-bit grayscale (1 byte/px). Add `quantizeGammaGray(gray, w, h, gamma)` etc. that accept `Uint8Array` grayscale directly. Existing RGBA functions stay for backward compat. |

### Unchanged files

| File | Reason |
|------|--------|
| `src/lib/eink/encoder.js` | KP encoding unchanged, imported by engine |
| `src/lib/eink/index.js` | Re-exports unchanged (+ new gray variants) |
| `src/lib/ui/asset-loader.js` | Browser-side KP decode — unchanged |
| `src/lib/kb/kb-reader.js` | KB read — unchanged |
| `src/lib/kb/kb-builder.js` | KB write — unchanged |
| `src/emulator/` | Emulator compositing uses browser canvas — unchanged |

---

## Task 0: Set Up Test Infrastructure

**Files:**
- Create: `vitest.config.js`
- Modify: `package.json`

- [ ] **Step 1: Install vitest**

```bash
cd /c/Projects/kread-master/kread/web
npm install -D vitest
```

- [ ] **Step 2: Create vitest config**

Create `vitest.config.js`:
```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
  },
})
```

- [ ] **Step 3: Add test script to package.json**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create a smoke test to verify setup**

Create `tests/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest'

describe('test setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: 1 test passing

- [ ] **Step 6: Commit**

```bash
git add vitest.config.js tests/smoke.test.js package.json package-lock.json
git commit -m "chore: add vitest test infrastructure"
```

---

## Task 1: FreeType WASM Spike

**Goal:** Compile FreeType to WASM, verify we can load a font, render a glyph in both mono and gray modes, and read the bitmap data. This is a time-boxed spike to validate feasibility.

**Files:**
- Create: `scripts/build-freetype-wasm.sh`
- Create: `src/lib/eink-renderer/wasm/` (build output)
- Create: `tests/eink-renderer/freetype-spike.test.js`

**Prerequisites:** Emscripten SDK installed (`emsdk`). If not available, use the existing `freetype-wasm` npm package as fallback.

- [ ] **Step 1: Research existing freetype-wasm package API**

Before self-compiling, check if `freetype-wasm` npm package exposes the APIs we need. Install and test:

```bash
npm install freetype-wasm
```

Write `tests/eink-renderer/freetype-spike.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('FreeType WASM spike', () => {
  it('loads a font and renders a glyph', async () => {
    // Try loading freetype-wasm
    const FreeTypeInit = (await import('freetype-wasm')).default
    const FreeType = await FreeTypeInit()

    // Load Verdana font
    const fontPath = resolve('public/fonts/Verdana-Regular.ttf')
    const fontData = readFileSync(fontPath)

    // Create face
    const face = FreeType.LoadFontFromBuffer(fontData)
    expect(face).toBeTruthy()

    // Set size (18px)
    FreeType.SetPixelSize(face, 0, 18)

    // Load glyph for 'A' (glyph index from char code)
    const glyphIndex = FreeType.GetCharIndex(face, 65) // 'A'
    expect(glyphIndex).toBeGreaterThan(0)

    // Render in normal (gray) mode
    FreeType.LoadGlyph(face, glyphIndex, 0) // FT_LOAD_DEFAULT
    FreeType.RenderGlyph(face, 0) // FT_RENDER_MODE_NORMAL

    // Access bitmap
    const bitmap = FreeType.GetGlyphBitmap(face)
    expect(bitmap.width).toBeGreaterThan(0)
    expect(bitmap.rows).toBeGreaterThan(0)
    expect(bitmap.buffer.length).toBe(bitmap.width * bitmap.rows)

    console.log(`Glyph 'A': ${bitmap.width}x${bitmap.rows}, ${bitmap.buffer.length} bytes`)
    console.log('Unique values:', new Set(bitmap.buffer).size)
  })
})
```

- [ ] **Step 2: Run spike test**

Run: `npx vitest run tests/eink-renderer/freetype-spike.test.js`

If the test passes → the package works, skip self-compilation for now.
If it fails → we need to self-compile or find an alternative. Document the failure.

- [ ] **Step 3: Test mono rendering mode**

Add test case:
```js
it('renders glyph in mono mode (1-bit)', async () => {
  // ... load font, set size, get glyph index ...

  // FT_LOAD_TARGET_MONO = (1 << 16) | FT_LOAD_MONOCHROME = 4096
  // Need to check if package exposes these constants
  const FT_LOAD_TARGET_MONO = 1 << 16
  const FT_LOAD_MONOCHROME = 4096
  const FT_RENDER_MODE_MONO = 2

  FreeType.LoadGlyph(face, glyphIndex, FT_LOAD_TARGET_MONO | FT_LOAD_MONOCHROME)
  FreeType.RenderGlyph(face, FT_RENDER_MODE_MONO)

  const bitmap = FreeType.GetGlyphBitmap(face)
  // Mono bitmap: pixels should be only 0 or 255
  const values = new Set(bitmap.buffer)
  console.log('Mono values:', [...values])
  // For packed 1-bit, pixel_mode = FT_PIXEL_MODE_MONO
})
```

- [ ] **Step 4: Test FT_Outline_EmboldenXY access**

Add test case to verify we can call emboldening before render:
```js
it('supports outline emboldening', async () => {
  // Check if FreeType.OutlineEmbolden or similar exists
  console.log('Available methods:', Object.keys(FreeType))
  // Document which methods are available
})
```

- [ ] **Step 5: If npm package fails — self-compile FreeType WASM**

If `freetype-wasm` npm package is missing needed APIs (likely), self-compile:

Create `scripts/build-freetype-wasm.sh`:
```bash
#!/bin/bash
# Compile FreeType 2.13 to WASM via Emscripten
# Prerequisites: emsdk activated (source emsdk_env.sh)

set -e

FT_VERSION=2.13.2
FT_DIR=freetype-${FT_VERSION}
OUT_DIR=../src/lib/eink-renderer/wasm

# Download FreeType source
if [ ! -d "$FT_DIR" ]; then
  curl -L "https://download.savannah.gnu.org/releases/freetype/freetype-${FT_VERSION}.tar.xz" | tar xJ
fi

cd "$FT_DIR"

# Configure with Emscripten (minimal build — no bzip2, no png, no zlib, no harfbuzz)
emcmake cmake -B build \
  -DFT_DISABLE_BZIP2=ON \
  -DFT_DISABLE_PNG=ON \
  -DFT_DISABLE_ZLIB=ON \
  -DFT_DISABLE_HARFBUZZ=ON \
  -DBUILD_SHARED_LIBS=OFF \
  -DCMAKE_BUILD_TYPE=Release

emmake make -C build -j$(nproc)

cd ..

# Link into WASM module with exported C functions
mkdir -p "$OUT_DIR"
emcc \
  -O2 \
  -s WASM=1 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORTED_FUNCTIONS='[
    "_FT_Init_FreeType",
    "_FT_New_Memory_Face",
    "_FT_Done_Face",
    "_FT_Set_Char_Size",
    "_FT_Set_Pixel_Sizes",
    "_FT_Get_Char_Index",
    "_FT_Load_Glyph",
    "_FT_Render_Glyph",
    "_FT_Outline_Embolden",
    "_FT_Outline_EmboldenXY",
    "_malloc",
    "_free"
  ]' \
  -s EXPORTED_RUNTIME_METHODS='["cwrap","ccall","getValue","setValue","HEAPU8"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=4194304 \
  -I "${FT_DIR}/include" \
  -L "${FT_DIR}/build" \
  -lfreetype \
  -o "${OUT_DIR}/freetype.js"

echo "Built: ${OUT_DIR}/freetype.js + freetype.wasm"
```

The JS wrapper (`src/lib/eink-renderer/wasm/freetype-wrapper.js`) exposes cwrap'd functions:
```js
// After Emscripten module loads:
const FT = {
  Init_FreeType:    module.cwrap('FT_Init_FreeType', 'number', ['number']),
  New_Memory_Face:  module.cwrap('FT_New_Memory_Face', 'number', ['number','number','number','number','number']),
  Set_Char_Size:    module.cwrap('FT_Set_Char_Size', 'number', ['number','number','number','number','number']),
  Get_Char_Index:   module.cwrap('FT_Get_Char_Index', 'number', ['number','number']),
  Load_Glyph:       module.cwrap('FT_Load_Glyph', 'number', ['number','number','number']),
  Render_Glyph:     module.cwrap('FT_Render_Glyph', 'number', ['number','number']),
  Outline_EmboldenXY: module.cwrap('FT_Outline_EmboldenXY', 'number', ['number','number','number']),
}
// Access FT_GlyphSlot bitmap fields via pointer arithmetic on HEAPU8
```

- [ ] **Step 6: Document spike results**

Create `docs/superpowers/specs/freetype-wasm-spike-results.md` with:
- Which approach worked (npm package or self-compiled)
- Which APIs are available/missing
- Any workarounds needed
- Performance notes (glyph render time)

- [ ] **Step 7: Commit spike**

```bash
git add tests/eink-renderer/ scripts/build-freetype-wasm.sh src/lib/eink-renderer/wasm/ docs/superpowers/specs/freetype-wasm-spike-results.md
git commit -m "chore: FreeType WASM spike — validate API access"
```

---

## Task 2: Glyph Cache Module

**Files:**
- Create: `src/lib/eink-renderer/glyph-cache.js`
- Create: `tests/eink-renderer/glyph-cache.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/eink-renderer/glyph-cache.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { GlyphCache } from '../../src/lib/eink-renderer/glyph-cache.js'

describe('GlyphCache', () => {
  it('returns null for cache miss', () => {
    const cache = new GlyphCache(100)
    expect(cache.get('verdana', 65, 18, 'gray')).toBeNull()
  })

  it('stores and retrieves glyph bitmap', () => {
    const cache = new GlyphCache(100)
    const bitmap = { width: 10, height: 14, bitmapLeft: 1, bitmapTop: 12, pixels: new Uint8Array(140) }
    cache.set('verdana', 65, 18, 'gray', bitmap)
    expect(cache.get('verdana', 65, 18, 'gray')).toBe(bitmap)
  })

  it('distinguishes by font family', () => {
    const cache = new GlyphCache(100)
    const verd = { width: 10, height: 14, bitmapLeft: 1, bitmapTop: 12, pixels: new Uint8Array(140) }
    const zilla = { width: 11, height: 15, bitmapLeft: 1, bitmapTop: 13, pixels: new Uint8Array(165) }
    cache.set('verdana', 65, 18, 'gray', verd)
    cache.set('zilla', 65, 18, 'gray', zilla)
    expect(cache.get('verdana', 65, 18, 'gray')).toBe(verd)
    expect(cache.get('zilla', 65, 18, 'gray')).toBe(zilla)
  })

  it('distinguishes by mode', () => {
    const cache = new GlyphCache(100)
    const gray = { width: 10, height: 14, bitmapLeft: 1, bitmapTop: 12, pixels: new Uint8Array(140) }
    const mono = { width: 10, height: 14, bitmapLeft: 1, bitmapTop: 12, pixels: new Uint8Array(20) }
    cache.set('verdana', 65, 18, 'gray', gray)
    cache.set('verdana', 65, 18, 'mono', mono)
    expect(cache.get('verdana', 65, 18, 'gray')).toBe(gray)
    expect(cache.get('verdana', 65, 18, 'mono')).toBe(mono)
  })

  it('distinguishes by fontSize', () => {
    const cache = new GlyphCache(100)
    const small = { width: 8, height: 12, bitmapLeft: 1, bitmapTop: 10, pixels: new Uint8Array(96) }
    const large = { width: 12, height: 18, bitmapLeft: 1, bitmapTop: 15, pixels: new Uint8Array(216) }
    cache.set('verdana', 65, 14, 'gray', small)
    cache.set('verdana', 65, 22, 'gray', large)
    expect(cache.get('verdana', 65, 14, 'gray')).toBe(small)
    expect(cache.get('verdana', 65, 22, 'gray')).toBe(large)
  })

  it('evicts LRU entry when full', () => {
    const cache = new GlyphCache(2) // max 2 entries
    const a = { width: 1, height: 1, bitmapLeft: 0, bitmapTop: 0, pixels: new Uint8Array(1) }
    const b = { width: 1, height: 1, bitmapLeft: 0, bitmapTop: 0, pixels: new Uint8Array(1) }
    const c = { width: 1, height: 1, bitmapLeft: 0, bitmapTop: 0, pixels: new Uint8Array(1) }
    cache.set('verdana', 1, 18, 'gray', a)
    cache.set('verdana', 2, 18, 'gray', b)
    cache.set('verdana', 3, 18, 'gray', c) // evicts glyph 1
    expect(cache.get('verdana', 1, 18, 'gray')).toBeNull()
    expect(cache.get('verdana', 2, 18, 'gray')).toBe(b)
    expect(cache.get('verdana', 3, 18, 'gray')).toBe(c)
  })

  it('clear removes all entries', () => {
    const cache = new GlyphCache(100)
    const a = { width: 1, height: 1, bitmapLeft: 0, bitmapTop: 0, pixels: new Uint8Array(1) }
    cache.set('verdana', 65, 18, 'gray', a)
    cache.clear()
    expect(cache.get('verdana', 65, 18, 'gray')).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/eink-renderer/glyph-cache.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement glyph cache**

Create `src/lib/eink-renderer/glyph-cache.js`:
```js
/**
 * LRU cache for rendered glyph bitmaps.
 * Key: (fontId, glyphId, fontSize, mode) → bitmap data.
 * fontId prevents collisions between different font families
 * (same glyph ID maps to different glyphs in different fonts).
 */
export class GlyphCache {
  constructor(maxEntries = 2000) {
    this._max = maxEntries
    this._map = new Map()
  }

  _key(fontId, glyphId, fontSize, mode) {
    return `${fontId}:${glyphId}:${fontSize}:${mode}`
  }

  get(fontId, glyphId, fontSize, mode) {
    const k = this._key(fontId, glyphId, fontSize, mode)
    const entry = this._map.get(k)
    if (!entry) return null
    // Move to end (most recently used)
    this._map.delete(k)
    this._map.set(k, entry)
    return entry
  }

  set(fontId, glyphId, fontSize, mode, bitmap) {
    const k = this._key(fontId, glyphId, fontSize, mode)
    this._map.delete(k) // remove if exists (reinsert at end)
    if (this._map.size >= this._max) {
      // Evict oldest (first entry)
      const oldest = this._map.keys().next().value
      this._map.delete(oldest)
    }
    this._map.set(k, bitmap)
  }

  clear() {
    this._map.clear()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/eink-renderer/glyph-cache.test.js`
Expected: All 6 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/eink-renderer/glyph-cache.js tests/eink-renderer/glyph-cache.test.js
git commit -m "feat: add glyph cache with LRU eviction"
```

---

## Task 3: Compositor Module

**Files:**
- Create: `src/lib/eink-renderer/compositor.js`
- Create: `tests/eink-renderer/compositor.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/eink-renderer/compositor.test.js`:
```js
import { describe, it, expect } from 'vitest'
import {
  createBuffer, fillRect, hline, strokeRect, fillTriangle,
  compositeGlyph, compositeMonoGlyph
} from '../../src/lib/eink-renderer/compositor.js'

describe('compositor', () => {
  it('createBuffer fills with value', () => {
    const buf = createBuffer(4, 4, 255)
    expect(buf.length).toBe(16)
    expect(buf.every(v => v === 255)).toBe(true)
  })

  it('fillRect fills a region', () => {
    const buf = createBuffer(10, 10, 255)
    fillRect(buf, 10, 2, 2, 3, 3, 0)
    expect(buf[2 * 10 + 2]).toBe(0) // top-left of rect
    expect(buf[4 * 10 + 4]).toBe(0) // bottom-right of rect
    expect(buf[0]).toBe(255)        // outside rect
  })

  it('hline draws horizontal line', () => {
    const buf = createBuffer(10, 5, 255)
    hline(buf, 10, 1, 2, 5, 0)
    expect(buf[2 * 10 + 1]).toBe(0) // start
    expect(buf[2 * 10 + 5]).toBe(0) // end
    expect(buf[2 * 10 + 0]).toBe(255) // before
    expect(buf[2 * 10 + 6]).toBe(255) // after
  })

  it('compositeGlyph blends coverage onto buffer', () => {
    const buf = createBuffer(10, 10, 255)
    const glyph = {
      width: 2, height: 2,
      pixels: new Uint8Array([128, 255, 64, 0]) // coverage values
    }
    compositeGlyph(buf, 10, 10, glyph, 3, 3)
    expect(buf[3 * 10 + 3]).toBe(127) // 255 - 128
    expect(buf[3 * 10 + 4]).toBe(0)   // 255 - 255
    expect(buf[4 * 10 + 3]).toBe(191) // 255 - 64
    expect(buf[4 * 10 + 4]).toBe(255) // 255 - 0 (no coverage)
  })

  it('compositeGlyph clips at buffer edges', () => {
    const buf = createBuffer(5, 5, 255)
    const glyph = {
      width: 3, height: 3,
      pixels: new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255, 255])
    }
    // Place at (4, 4) — mostly outside
    compositeGlyph(buf, 5, 5, glyph, 4, 4)
    expect(buf[4 * 5 + 4]).toBe(0) // only 1 pixel inside
    expect(buf[3 * 5 + 4]).toBe(255) // outside glyph
  })

  it('strokeRect draws outlined rectangle', () => {
    const buf = createBuffer(10, 10, 255)
    strokeRect(buf, 10, 2, 2, 6, 6, 0, 1) // x,y,w,h,value,lineWidth
    expect(buf[2 * 10 + 2]).toBe(0)   // top-left corner
    expect(buf[2 * 10 + 7]).toBe(0)   // top-right corner
    expect(buf[7 * 10 + 2]).toBe(0)   // bottom-left corner
    expect(buf[4 * 10 + 4]).toBe(255) // center (hollow)
  })

  it('fillTriangle fills a triangle region', () => {
    const buf = createBuffer(10, 10, 255)
    // Right-pointing triangle: tip at (8,5), base from (2,2) to (2,8)
    fillTriangle(buf, 10, 10, 2, 2, 2, 8, 8, 5, 0)
    expect(buf[5 * 10 + 5]).toBe(0)   // inside triangle
    expect(buf[0 * 10 + 0]).toBe(255) // outside
  })

  it('compositeMonoGlyph places 1-bit packed bitmap', () => {
    const buf = createBuffer(16, 4, 255)
    // 1-bit packed: 8 pixels per byte, MSB first
    // 0xFF = 8 black pixels, 0x00 = 8 white pixels
    const glyph = {
      width: 16, height: 1,
      pixels: new Uint8Array([0xFF, 0x00]) // 8 black + 8 white
    }
    compositeMonoGlyph(buf, 16, 4, glyph, 0, 0)
    expect(buf[0]).toBe(0)   // black pixel
    expect(buf[7]).toBe(0)   // black pixel
    expect(buf[8]).toBe(255) // white pixel
    expect(buf[15]).toBe(255) // white pixel
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/eink-renderer/compositor.test.js`
Expected: FAIL

- [ ] **Step 3: Implement compositor**

Create `src/lib/eink-renderer/compositor.js`:
```js
/**
 * Raw pixel buffer management for e-ink rendering.
 * Replaces canvas for page composition.
 * All buffers are 8-bit grayscale (0=black, 255=white), row-major.
 */

export function createBuffer(w, h, fillValue = 255) {
  const buf = new Uint8Array(w * h)
  buf.fill(fillValue)
  return buf
}

export function fillRect(buf, bufW, x, y, w, h, value) {
  for (let row = y; row < y + h; row++) {
    if (row < 0 || row >= buf.length / bufW) continue
    for (let col = x; col < x + w; col++) {
      if (col < 0 || col >= bufW) continue
      buf[row * bufW + col] = value
    }
  }
}

export function hline(buf, bufW, x, y, w, value) {
  if (y < 0 || y >= buf.length / bufW) return
  for (let col = x; col < x + w; col++) {
    if (col < 0 || col >= bufW) continue
    buf[y * bufW + col] = value
  }
}

/**
 * Draw outlined rectangle (for battery frame, progress bar frame).
 */
export function strokeRect(buf, bufW, x, y, w, h, value, lineWidth = 1) {
  for (let i = 0; i < lineWidth; i++) {
    hline(buf, bufW, x, y + i, w, value)           // top
    hline(buf, bufW, x, y + h - 1 - i, w, value)   // bottom
    for (let row = y + i; row < y + h - i; row++) {
      if (row < 0 || row >= buf.length / bufW) continue
      for (let lw = 0; lw < lineWidth; lw++) {
        const cl = x + lw, cr = x + w - 1 - lw
        if (cl >= 0 && cl < bufW) buf[row * bufW + cl] = value  // left
        if (cr >= 0 && cr < bufW) buf[row * bufW + cr] = value  // right
      }
    }
  }
}

/**
 * Fill a triangle defined by 3 vertices.
 * Uses scan-line fill. For arrow icons and triangles in UI.
 */
export function fillTriangle(buf, bufW, bufH, x0, y0, x1, y1, x2, y2, value) {
  const minY = Math.max(0, Math.min(y0, y1, y2))
  const maxY = Math.min(bufH - 1, Math.max(y0, y1, y2))
  const edges = [[x0,y0,x1,y1], [x1,y1,x2,y2], [x2,y2,x0,y0]]
  for (let y = minY; y <= maxY; y++) {
    let minX = bufW, maxX = 0
    for (const [ax,ay,bx,by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        const t = (y - ay) / (by - ay)
        const ix = Math.round(ax + t * (bx - ax))
        minX = Math.min(minX, ix)
        maxX = Math.max(maxX, ix)
      }
    }
    for (let x = Math.max(0, minX); x <= Math.min(bufW - 1, maxX); x++) {
      buf[y * bufW + x] = value
    }
  }
}

/**
 * Composite an 8-bit coverage glyph onto a grayscale buffer.
 * coverage=255 means fully covered (black text), coverage=0 means no coverage.
 * Blend rule: darker wins (min of existing value and 255-coverage).
 */
export function compositeGlyph(buf, bufW, bufH, glyph, x, y) {
  for (let gy = 0; gy < glyph.height; gy++) {
    const py = y + gy
    if (py < 0 || py >= bufH) continue
    for (let gx = 0; gx < glyph.width; gx++) {
      const px = x + gx
      if (px < 0 || px >= bufW) continue
      const coverage = glyph.pixels[gy * glyph.width + gx]
      buf[py * bufW + px] = Math.min(buf[py * bufW + px], 255 - coverage)
    }
  }
}

/**
 * Composite a 1-bit packed mono glyph (FT_PIXEL_MODE_MONO) onto a grayscale buffer.
 * Bit=1 means covered (black), bit=0 means uncovered (transparent).
 * Packed MSB-first, 8 pixels per byte.
 */
export function compositeMonoGlyph(buf, bufW, bufH, glyph, x, y) {
  const pitch = Math.ceil(glyph.width / 8)
  for (let gy = 0; gy < glyph.height; gy++) {
    const py = y + gy
    if (py < 0 || py >= bufH) continue
    for (let gx = 0; gx < glyph.width; gx++) {
      const px = x + gx
      if (px < 0 || px >= bufW) continue
      const byteIdx = gy * pitch + (gx >> 3)
      const bitMask = 0x80 >> (gx & 7)
      if (glyph.pixels[byteIdx] & bitMask) {
        buf[py * bufW + px] = 0 // black
      }
    }
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/eink-renderer/compositor.test.js`
Expected: All tests passing

- [ ] **Step 5: Commit**

```bash
git add src/lib/eink-renderer/compositor.js tests/eink-renderer/compositor.test.js
git commit -m "feat: add compositor module for pixel buffer operations"
```

---

## Task 4: Config Module

**Files:**
- Create: `src/lib/eink-renderer/config.js`

- [ ] **Step 1: Create config module with defaults and merge helper**

Create `src/lib/eink-renderer/config.js`:
```js
/**
 * Default rendering configuration for e-ink output.
 * Used by both Node.js build scripts and browser EPUB conversion.
 */

export const DEFAULT_CONFIG = {
  bodyFont: 'Zilla Slab',
  uiFont: 'Verdana',
  fontSize: 22,
  textMode: 'gray',
  imageMode: 'gray',
  mono: {},
  gray: {
    gamma: 1.8,
    emboldenThreshold: 24,
    emboldenStrength: 0.4,
  },
  pageWidth: 480,
  pageHeight: 800,
  marginTop: 28,
  marginBottom: 12,
  marginLeft: 28,
  marginRight: 28,
  lineHeight: 1.5,
  paragraphSpacing: 0.5,
  firstLineIndent: 0,
  align: 'left',
  hyphenation: true,
  coverDither: 'blue-noise',
  coverGrayDither: 'gamma',
}

/**
 * Deep merge user config onto defaults.
 */
export function mergeConfig(userConfig = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    mono: { ...DEFAULT_CONFIG.mono, ...userConfig.mono },
    gray: { ...DEFAULT_CONFIG.gray, ...userConfig.gray },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/eink-renderer/config.js
git commit -m "feat: add rendering config with defaults"
```

---

## Task 5: Font Manager Module

**Depends on:** Task 1 (spike determines WASM package)

**Files:**
- Create: `src/lib/eink-renderer/font-manager.js`
- Create: `tests/eink-renderer/font-manager.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/eink-renderer/font-manager.test.js`:
```js
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { FontManager } from '../../src/lib/eink-renderer/font-manager.js'

// NOTE: Test structure depends on Task 1 spike results.
// The FreeType/HarfBuzz init pattern will be determined by the spike.

describe('FontManager', () => {
  let fm

  beforeAll(async () => {
    fm = new FontManager()
    await fm.init() // initializes FreeType + HarfBuzz WASM
  })

  it('loads a TrueType font with explicit weight', () => {
    const fontData = readFileSync(resolve('public/fonts/Verdana-Regular.ttf'))
    fm.loadFont(fontData, 'Verdana', { weight: 'normal', style: 'normal' })
    expect(fm.hasFont('Verdana')).toBe(true)
  })

  it('resolves font by family and weight', () => {
    const fontData = readFileSync(resolve('public/fonts/Verdana-Regular.ttf'))
    const boldData = readFileSync(resolve('public/fonts/Verdana-Bold.ttf'))
    fm.loadFont(fontData, 'Verdana', { weight: 'normal' })
    fm.loadFont(boldData, 'Verdana', { weight: 'bold' })

    const regular = fm.getFace('Verdana', { weight: 'normal' })
    const bold = fm.getFace('Verdana', { weight: 'bold' })
    expect(regular).toBeTruthy()
    expect(bold).toBeTruthy()
    expect(regular).not.toBe(bold)
  })

  it('returns metrics for a font at a given size', () => {
    const metrics = fm.getMetrics('Verdana', 18)
    expect(metrics.ascender).toBeGreaterThan(0)
    expect(metrics.descender).toBeLessThanOrEqual(0)
    expect(metrics.height).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Implement font manager**

Create `src/lib/eink-renderer/font-manager.js`.

Implementation depends on Task 1 spike results — the exact FreeType WASM API calls will vary. Core responsibilities:
- Initialize FreeType library (`FT_Init_FreeType`)
- Load font data into FreeType face (`FT_New_Memory_Face`)
- Create HarfBuzz font from FreeType face (`hb_ft_font_create` or manual blob creation)
- `loadFont(fontBytes, familyName, { weight, style })` — weight/style passed **explicitly** (not auto-detected from OS/2 table, to keep implementation simple)
- Cache faces by `${family}:${weight}:${style}` key
- `getFace(family, { weight, style })` → returns FreeType face
- `getHbFont(family, { weight, style })` → returns HarfBuzz font
- Provide `getMetrics(family, size)` → ascender/descender/height from `FT_Set_Char_Size` + `face.size.metrics`
- `getCharIndex(family, charCode)` → glyph ID via `FT_Get_Char_Index`

- [ ] **Step 3: Run tests, iterate until passing**

Run: `npx vitest run tests/eink-renderer/font-manager.test.js`

- [ ] **Step 4: Commit**

```bash
git add src/lib/eink-renderer/font-manager.js tests/eink-renderer/font-manager.test.js
git commit -m "feat: add font manager with FreeType + HarfBuzz registration"
```

---

## Task 6: Shaper Module (HarfBuzz Wrapper)

**Depends on:** Task 5

**Files:**
- Create: `src/lib/eink-renderer/shaper.js`
- Create: `tests/eink-renderer/shaper.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { FontManager } from '../../src/lib/eink-renderer/font-manager.js'
import { shapeText } from '../../src/lib/eink-renderer/shaper.js'

describe('shaper', () => {
  let fm

  beforeAll(async () => {
    fm = new FontManager()
    await fm.init()
    fm.loadFont(readFileSync(resolve('public/fonts/Verdana-Regular.ttf')), 'Verdana')
  })

  it('shapes Latin text into glyph run', () => {
    const result = shapeText(fm, 'Hello', {
      family: 'Verdana', size: 18, weight: 'normal',
      direction: 'ltr',
    })
    expect(result.glyphs.length).toBeGreaterThan(0)
    expect(result.glyphs[0]).toHaveProperty('id')
    expect(result.glyphs[0]).toHaveProperty('xAdvance')
    expect(result.width).toBeGreaterThan(0)
  })

  it('returns positions in pixels, not font units', () => {
    const result = shapeText(fm, 'W', {
      family: 'Verdana', size: 18, weight: 'normal',
      direction: 'ltr',
    })
    // At 18px, 'W' advance should be roughly 12-16px, not 1000+ font units
    expect(result.glyphs[0].xAdvance).toBeGreaterThan(5)
    expect(result.glyphs[0].xAdvance).toBeLessThan(30)
  })

  it('total width equals sum of advances', () => {
    const result = shapeText(fm, 'Test', {
      family: 'Verdana', size: 18, weight: 'normal',
      direction: 'ltr',
    })
    const sumAdvances = result.glyphs.reduce((s, g) => s + g.xAdvance, 0)
    expect(Math.abs(result.width - sumAdvances)).toBeLessThan(0.01)
  })
})
```

- [ ] **Step 2: Implement shaper**

Create `src/lib/eink-renderer/shaper.js`:

Core logic:
- Create HarfBuzz buffer, set direction/script/language
- Add text to buffer
- Shape with HarfBuzz font (from font manager)
- Extract glyph info via `buffer.json()` (harfbuzzjs API)
- Map abbreviated names (g→id, ax→xAdvance, etc.)
- Convert from font units to pixels: `value * fontSize / unitsPerEm`
- Return `{ width, glyphs: [{ id, xAdvance, yAdvance, xOffset, yOffset, cluster }] }`

- [ ] **Step 3: Run tests, iterate**

- [ ] **Step 4: Commit**

```bash
git add src/lib/eink-renderer/shaper.js tests/eink-renderer/shaper.test.js
git commit -m "feat: add HarfBuzz text shaper with pixel-space output"
```

---

## Task 7: Rasterizer Module (FreeType Wrapper)

**Depends on:** Task 5

**Files:**
- Create: `src/lib/eink-renderer/rasterizer.js`
- Create: `tests/eink-renderer/rasterizer.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { FontManager } from '../../src/lib/eink-renderer/font-manager.js'
import { rasterizeGlyph } from '../../src/lib/eink-renderer/rasterizer.js'

describe('rasterizer', () => {
  let fm

  beforeAll(async () => {
    fm = new FontManager()
    await fm.init()
    fm.loadFont(readFileSync(resolve('public/fonts/Verdana-Regular.ttf')), 'Verdana')
  })

  it('rasterizes glyph in gray mode (8-bit coverage)', () => {
    const glyphId = fm.getCharIndex('Verdana', 65) // 'A'
    const result = rasterizeGlyph(fm, 'Verdana', glyphId, 18, 'gray')

    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    expect(result.pixels.length).toBe(result.width * result.height)
    expect(result.bitmapLeft).toBeDefined()
    expect(result.bitmapTop).toBeDefined()

    // Gray mode: should have intermediate values (not just 0 and 255)
    const values = new Set(result.pixels)
    expect(values.size).toBeGreaterThan(2)
  })

  it('rasterizes glyph in mono mode (1-bit packed)', () => {
    const glyphId = fm.getCharIndex('Verdana', 65) // 'A'
    const result = rasterizeGlyph(fm, 'Verdana', glyphId, 18, 'mono')

    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    expect(result.pixelMode).toBe('mono')
    // Mono: packed 1-bit, pitch = ceil(width / 8)
    expect(result.pixels.length).toBe(Math.ceil(result.width / 8) * result.height)
  })

  it('applies emboldening for gray mode at small sizes', () => {
    const glyphId = fm.getCharIndex('Verdana', 108) // 'l' (thin stroke)
    const normal = rasterizeGlyph(fm, 'Verdana', glyphId, 14, 'gray', { embolden: false })
    const bold = rasterizeGlyph(fm, 'Verdana', glyphId, 14, 'gray', { embolden: true, emboldenStrength: 0.5 })

    // Emboldened glyph should have more dark pixels
    const darkNormal = normal.pixels.filter(v => v > 128).length
    const darkBold = bold.pixels.filter(v => v > 128).length
    expect(darkBold).toBeGreaterThan(darkNormal)
  })
})
```

- [ ] **Step 2: Implement rasterizer**

Create `src/lib/eink-renderer/rasterizer.js`:

Core logic:
- `FT_Set_Char_Size(face, 0, fontSize * 64, 0, 0)` — set pixel size in 26.6 format
- For gray mode: `FT_Load_Glyph(face, glyphId, FT_LOAD_TARGET_LIGHT)`
  - If `embolden`: `FT_Outline_EmboldenXY(slot.outline, strength, strength)` before render
  - `FT_Render_Glyph(slot, FT_RENDER_MODE_NORMAL)`
  - Read `slot.bitmap` (8-bit grayscale)
- For mono mode: `FT_Load_Glyph(face, glyphId, FT_LOAD_TARGET_MONO | FT_LOAD_MONOCHROME)`
  - `FT_Render_Glyph(slot, FT_RENDER_MODE_MONO)`
  - Read `slot.bitmap` (1-bit packed)
- Return `{ width, height, bitmapLeft, bitmapTop, pixels, pixelMode }`

- [ ] **Step 3: Run tests, iterate**

- [ ] **Step 4: Commit**

```bash
git add src/lib/eink-renderer/rasterizer.js tests/eink-renderer/rasterizer.test.js
git commit -m "feat: add FreeType glyph rasterizer with mono/gray modes"
```

---

## Task 8: Text Renderer (Compose Shaper + Rasterizer + Cache)

**Depends on:** Tasks 2, 3, 6, 7

**Files:**
- Create: `src/lib/eink-renderer/text-renderer.js`
- Create: `tests/eink-renderer/text-renderer.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { FontManager } from '../../src/lib/eink-renderer/font-manager.js'
import { TextRenderer } from '../../src/lib/eink-renderer/text-renderer.js'

describe('TextRenderer', () => {
  let fm, tr

  beforeAll(async () => {
    fm = new FontManager()
    await fm.init()
    fm.loadFont(readFileSync(resolve('public/fonts/Verdana-Regular.ttf')), 'Verdana')
    tr = new TextRenderer(fm)
  })

  it('measureText returns width and metrics', () => {
    const m = tr.measureText('Hello', { family: 'Verdana', size: 18 })
    expect(m.width).toBeGreaterThan(0)
    expect(m.height).toBeGreaterThan(0)
    expect(m.ascender).toBeGreaterThan(0)
    expect(m.glyphs.length).toBe(5)
  })

  it('renderText returns pixel buffer in gray mode', () => {
    const r = tr.renderText('A', { font: { family: 'Verdana', size: 18 }, mode: 'gray' })
    expect(r.width).toBeGreaterThan(0)
    expect(r.height).toBeGreaterThan(0)
    expect(r.pixels).toBeInstanceOf(Uint8Array)
    expect(r.pixels.length).toBe(r.width * r.height)
    // Should have intermediate gray values (AA)
    const values = new Set(r.pixels)
    expect(values.size).toBeGreaterThan(2)
  })

  it('renderText returns pixel buffer in mono mode', () => {
    const r = tr.renderText('A', { font: { family: 'Verdana', size: 18 }, mode: 'mono' })
    expect(r.width).toBeGreaterThan(0)
    expect(r.height).toBeGreaterThan(0)
    expect(r.pixels).toBeInstanceOf(Uint8Array)
    // Mono: output should be only 0 (black) and 255 (white)
    const values = new Set(r.pixels)
    expect(values.size).toBeLessThanOrEqual(2)
  })

  it('uses glyph cache for repeated renders', () => {
    tr.clearCache()
    tr.renderText('Hello', { font: { family: 'Verdana', size: 18 }, mode: 'gray' })
    // Second render should be faster (cache hits) — just verify no error
    tr.renderText('Hello', { font: { family: 'Verdana', size: 18 }, mode: 'gray' })
  })

  it('sub-pixel positioning: total width matches measurement', () => {
    const m = tr.measureText('Test string', { family: 'Verdana', size: 18 })
    const r = tr.renderText('Test string', { font: { family: 'Verdana', size: 18 }, mode: 'gray' })
    // Rendered width should be close to measured width (within 1px rounding)
    expect(Math.abs(r.width - Math.ceil(m.width))).toBeLessThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Implement text renderer**

Create `src/lib/eink-renderer/text-renderer.js`:

Core logic:
1. `measureText(text, fontOpts)` → shapes with HarfBuzz, returns metrics
2. `renderText(text, opts)` → shapes → for each glyph: check cache → rasterize if miss → composite onto output buffer with sub-pixel cursor tracking
3. Output buffer height = ascender + |descender|, width = ceil(total advance)
4. For mono mode: rasterize with `rasterizeGlyph(mode: 'mono')` → returns packed 1-bit bitmap → composite with `compositeMonoGlyph()` onto 8-bit buffer → output buffer contains only values 0 (black) and 255 (white)
5. For gray mode: rasterize with `rasterizeGlyph(mode: 'gray')` → returns 8-bit coverage → composite with `compositeGlyph()` → output buffer has values 0-255

**Output format clarification:** `renderText()` ALWAYS returns an 8-bit `Uint8Array` buffer regardless of mode. For mono mode, the buffer is composited from packed 1-bit glyphs via `compositeMonoGlyph()`, so the output pixels are only 0 or 255. The packed-to-8bit conversion happens at composite time, not in the return value. This simplifies downstream consumers — they always work with 8-bit buffers.

- [ ] **Step 3: Run tests, iterate**

- [ ] **Step 4: Commit**

```bash
git add src/lib/eink-renderer/text-renderer.js tests/eink-renderer/text-renderer.test.js
git commit -m "feat: add text renderer with shaping + rasterization + caching"
```

---

## Task 9: Image Resizer Module

**Files:**
- Create: `src/lib/eink-renderer/image-resizer.js`
- Modify: `package.json` (add pica, jpeg-js, pngjs)

- [ ] **Step 1: Install dependencies**

```bash
npm install pica jpeg-js pngjs
```

- [ ] **Step 2: Implement image resizer**

Create `src/lib/eink-renderer/image-resizer.js`:
```js
import Pica from 'pica'

const pica = new Pica()

/**
 * Resize RGBA pixel buffer using Lanczos3.
 * Works identically in Node.js and browser.
 */
export async function resizeImage(srcPixels, opts) {
  const { srcW, srcH, dstW, dstH, fit = 'contain', background = 0xFF } = opts

  // Calculate fit dimensions
  let drawW, drawH, drawX, drawY
  const srcAspect = srcW / srcH
  const dstAspect = dstW / dstH

  if (fit === 'stretch') {
    drawW = dstW; drawH = dstH; drawX = 0; drawY = 0
  } else if (fit === 'cover') {
    if (srcAspect > dstAspect) {
      drawH = dstH; drawW = Math.round(dstH * srcAspect)
    } else {
      drawW = dstW; drawH = Math.round(dstW / srcAspect)
    }
    drawX = Math.round((dstW - drawW) / 2)
    drawY = Math.round((dstH - drawH) / 2)
  } else { // contain
    if (srcAspect > dstAspect) {
      drawW = dstW; drawH = Math.round(dstW / srcAspect)
    } else {
      drawH = dstH; drawW = Math.round(dstH * srcAspect)
    }
    drawX = Math.round((dstW - drawW) / 2)
    drawY = Math.round((dstH - drawH) / 2)
  }

  // Create output with background fill
  const outPixels = new Uint8Array(dstW * dstH * 4)
  for (let i = 0; i < outPixels.length; i += 4) {
    outPixels[i] = outPixels[i + 1] = outPixels[i + 2] = background
    outPixels[i + 3] = 255
  }

  // Resize using pica
  const resized = await pica.resizeBuffer({
    src: srcPixels, width: srcW, height: srcH,
    toWidth: drawW, toHeight: drawH,
  })

  // Composite resized onto output at (drawX, drawY)
  for (let y = 0; y < drawH; y++) {
    const dstY = drawY + y
    if (dstY < 0 || dstY >= dstH) continue
    for (let x = 0; x < drawW; x++) {
      const dstX = drawX + x
      if (dstX < 0 || dstX >= dstW) continue
      const si = (y * drawW + x) * 4
      const di = (dstY * dstW + dstX) * 4
      outPixels[di] = resized[si]
      outPixels[di + 1] = resized[si + 1]
      outPixels[di + 2] = resized[si + 2]
      outPixels[di + 3] = resized[si + 3]
    }
  }

  return { width: dstW, height: dstH, pixels: outPixels }
}
```

- [ ] **Step 3: Write tests**

Create `tests/eink-renderer/image-resizer.test.js`:
```js
import { describe, it, expect } from 'vitest'
import { resizeImage } from '../../src/lib/eink-renderer/image-resizer.js'

describe('image-resizer', () => {
  function makeSrc(w, h, r, g, b) {
    const px = new Uint8Array(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      px[i*4] = r; px[i*4+1] = g; px[i*4+2] = b; px[i*4+3] = 255
    }
    return px
  }

  it('contain: tall image gets letterboxed', async () => {
    const src = makeSrc(100, 200, 0, 0, 0) // 1:2 aspect
    const r = await resizeImage(src, { srcW: 100, srcH: 200, dstW: 100, dstH: 100 })
    expect(r.width).toBe(100)
    expect(r.height).toBe(100)
    // Top/bottom should be white (background), center should be dark
    expect(r.pixels[0]).toBe(255) // top-left = background
  })

  it('stretch: fills entire output', async () => {
    const src = makeSrc(10, 20, 128, 128, 128)
    const r = await resizeImage(src, { srcW: 10, srcH: 20, dstW: 5, dstH: 5, fit: 'stretch' })
    expect(r.width).toBe(5)
    expect(r.height).toBe(5)
    expect(r.pixels.length).toBe(5 * 5 * 4)
  })

  it('custom background color', async () => {
    const src = makeSrc(2, 2, 0, 0, 0)
    const r = await resizeImage(src, { srcW: 2, srcH: 2, dstW: 10, dstH: 10, fit: 'contain', background: 0 })
    // Background pixels should be 0 (black) instead of default 255
    expect(r.pixels[0]).toBe(0)
  })
})
```

**Note on pica in Node.js:** `pica.resizeBuffer()` uses pure JS (no canvas dependency). Verify this works after `@napi-rs/canvas` is removed in Task 15. If pica's Node.js path tries to use `canvas` npm package, configure pica with `{ features: ['js'] }` to force pure-JS mode.

- [ ] **Step 4: Run tests, commit**

```bash
npx vitest run tests/eink-renderer/image-resizer.test.js
git add src/lib/eink-renderer/image-resizer.js tests/eink-renderer/image-resizer.test.js package.json package-lock.json
git commit -m "feat: add pica-based image resizer"
```

---

## Task 10: Engine Facade (Public API)

**Depends on:** Tasks 4, 5, 6, 7, 8, 9

**Files:**
- Create: `src/lib/eink-renderer/engine.js`
- Create: `tests/eink-renderer/engine.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createEinkEngine } from '../../src/lib/eink-renderer/engine.js'

describe('EinkEngine', () => {
  let engine

  beforeAll(async () => {
    engine = await createEinkEngine()
    engine.loadFont(readFileSync(resolve('public/fonts/Verdana-Regular.ttf')), 'Verdana')
    engine.loadFont(readFileSync(resolve('public/fonts/Verdana-Bold.ttf')), 'Verdana')
  })

  it('measureText returns metrics', () => {
    const m = engine.measureText('Hello', { font: { family: 'Verdana', size: 18 } })
    expect(m.width).toBeGreaterThan(0)
    expect(m.height).toBeGreaterThan(0)
  })

  it('renderText gray mode', () => {
    const r = engine.renderText('Hello', {
      font: { family: 'Verdana', size: 18 },
      mode: 'gray',
    })
    expect(r.pixels).toBeInstanceOf(Uint8Array)
    expect(r.width).toBeGreaterThan(0)
  })

  it('renderText mono mode', () => {
    const r = engine.renderText('Hello', {
      font: { family: 'Verdana', size: 18 },
      mode: 'mono',
    })
    expect(r.pixels).toBeInstanceOf(Uint8Array)
    const values = new Set(r.pixels)
    expect(values.size).toBeLessThanOrEqual(2)
  })

  it('resizeImage works', async () => {
    const src = new Uint8Array(10 * 10 * 4)
    src.fill(128)
    const r = await engine.resizeImage(src, { srcW: 10, srcH: 10, dstW: 5, dstH: 5 })
    expect(r.width).toBe(5)
    expect(r.height).toBe(5)
  })
})
```

- [ ] **Step 2: Implement engine facade**

Create `src/lib/eink-renderer/engine.js`:
```js
import { FontManager } from './font-manager.js'
import { TextRenderer } from './text-renderer.js'
import { resizeImage } from './image-resizer.js'

export async function createEinkEngine() {
  const fm = new FontManager()
  await fm.init()
  const tr = new TextRenderer(fm)

  return {
    loadFont(fontBytes, familyName) {
      fm.loadFont(fontBytes, familyName)
    },

    measureText(text, opts) {
      return tr.measureText(text, {
        family: opts.font?.family,
        size: opts.font?.size,
        weight: opts.font?.weight || 'normal',
        style: opts.font?.style || 'normal',
        direction: opts.direction || 'ltr',
      })
    },

    renderText(text, opts) {
      return tr.renderText(text, opts)
    },

    async resizeImage(srcPixels, opts) {
      return resizeImage(srcPixels, opts)
    },

    clearCache() {
      tr.clearCache()
    },
  }
}
```

- [ ] **Step 3: Run tests, iterate**

- [ ] **Step 4: Commit**

```bash
git add src/lib/eink-renderer/engine.js tests/eink-renderer/engine.test.js
git commit -m "feat: add EinkEngine public API facade"
```

---

## Task 10.5: Add Grayscale Input Variants to quantize.js

**Depends on:** None (can run in parallel with Tasks 1-10)

**Problem:** Current quantize functions (e.g., `quantizeGamma`) accept RGBA input (4 bytes/pixel from canvas `getImageData`). The new engine outputs 8-bit grayscale (1 byte/pixel). Without adapting quantize.js, migration tasks 11-14 will fail.

**Files:**
- Modify: `src/lib/eink/quantize.js`
- Modify: `src/lib/eink/index.js`
- Create: `tests/eink-renderer/quantize-gray.test.js`

- [ ] **Step 1: Write failing tests**

```js
import { describe, it, expect } from 'vitest'
import { quantizeGammaGray } from '../../src/lib/eink/quantize.js'

describe('quantize grayscale input', () => {
  it('quantizeGammaGray converts 8-bit gray to 2-bit levels', () => {
    // 4 pixels: black, dark, light, white
    const gray = new Uint8Array([0, 64, 192, 255])
    const result = quantizeGammaGray(gray, 2, 2, 1.8)
    expect(result[0]).toBe(0) // black
    expect(result[3]).toBe(3) // white
    // Middle values depend on gamma curve
    expect(result[1]).toBeLessThanOrEqual(1) // dark
    expect(result[2]).toBeGreaterThanOrEqual(2) // light
  })
})
```

- [ ] **Step 2: Implement grayscale variants**

Add to `src/lib/eink/quantize.js`:
```js
/**
 * Gamma-corrected quantize for 8-bit grayscale input (1 byte/pixel).
 * Same algorithm as quantizeGamma but skips RGBA→gray conversion.
 */
export function quantizeGammaGray(gray, width, height, gamma = 1.8) {
  const pixels = new Uint8Array(width * height)
  const invGamma = 1.0 / gamma
  for (let i = 0; i < width * height; i++) {
    const linear = Math.pow(gray[i] / 255, invGamma)
    if (linear < 0.1) pixels[i] = 0
    else if (linear < 0.35) pixels[i] = 1
    else if (linear < 0.65) pixels[i] = 2
    else pixels[i] = 3
  }
  return pixels
}
```

Add similar `*Gray` variants for other quantize functions used by the pipeline (quantize1bitGray, quantizeBlueNoiseGray, etc.).

- [ ] **Step 3: Export from index.js**

Add new functions to `src/lib/eink/index.js` exports.

- [ ] **Step 4: Run tests, commit**

```bash
npx vitest run tests/eink-renderer/quantize-gray.test.js
git add src/lib/eink/quantize.js src/lib/eink/index.js tests/eink-renderer/quantize-gray.test.js
git commit -m "feat: add grayscale-input quantize variants for eink-renderer"
```

---

## Task 11: Migrate asset-renderer.mjs

**Depends on:** Task 10

**Files:**
- Modify: `scripts/lib/asset-renderer.mjs`
- Modify: `scripts/gen-ui-assets.mjs`

- [ ] **Step 1: Update asset-renderer to use engine**

Replace `@napi-rs/canvas` imports and `renderTextAsset`/`encodeKpV2DualMode` with engine calls:

```js
// Before: createCanvas, fillText, quantizeGamma, supersample hack
// After: engine.renderText(text, { mode: 'gray' }) + engine.renderText(text, { mode: 'mono' })
```

Key changes:
- Remove `import { createCanvas, GlobalFonts } from '@napi-rs/canvas'`
- Remove `drawContent()`, `renderTextBW()`, `renderTextAsset()` functions
- New `renderTextAsset(engine, opts)` → calls `engine.renderText()` twice (gray + mono)
- `encodeKpV2DualMode()` takes gray pixels + mono pixels, quantizes gray, encodes both
- Dynamic frame rendering: convert to compositor pixel buffer ops (fillRect, hline, triangle fill)

- [ ] **Step 2: Update gen-ui-assets.mjs**

- Initialize engine at top: `const engine = await createEinkEngine()`
- Load Verdana fonts: `engine.loadFont(readFileSync(...), 'Verdana')`
- Pass engine to `renderTextAsset(engine, assetOpts)`
- **Tight-mode measurement:** Replace the `createCanvas` + `ctx.measureText()` import (line 57-63 in current gen-ui-assets.mjs) with `engine.measureText()` for auto-sizing containers
- **Progress range assets:** The progress_range loop (progress.1 through progress.99) currently uses `renderTextAsset()` + `encodeKpRaw()` (KP v1). Update to use engine + `encodeKpV2DualMode()` (KP v2 bit_depth=3) for consistency with other text assets

- [ ] **Step 3: Test by generating assets**

```bash
node scripts/gen-ui-assets.mjs --lang en
```

Compare output visually with previous assets. Verify:
- B&W text has crisp, pixel-snapped strokes (mono hinting)
- Grayscale text has smooth AA edges
- All 203 assets generated without errors

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/asset-renderer.mjs scripts/gen-ui-assets.mjs
git commit -m "feat: migrate asset-renderer to FreeType WASM engine"
```

---

## Task 12: Migrate asset-gen.js

**Depends on:** Task 10

**Files:**
- Modify: `src/lib/convert/asset-gen.js`

- [ ] **Step 1: Replace canvas text rendering with engine**

Key changes:
- Remove `import { createCanvas, GlobalFonts } from '@napi-rs/canvas'`
- Remove `renderSingleLine()` and `renderWrappedText()` — replace with engine calls
- `generateBookAssets(meta, opts, engine)` now takes engine parameter
- For title: `engine.measureText()` for word wrap, `engine.renderText()` for each line
- For author/chapters: `engine.renderText()` single line
- Cover/thumbnail: unchanged (uses imageToKp)

- [ ] **Step 2: Test with demo book generation**

```bash
node scripts/gen-demo-kb.mjs
```

Verify: 13 assets generated, title/author/chapters render correctly.

- [ ] **Step 3: Commit**

```bash
git add src/lib/convert/asset-gen.js
git commit -m "feat: migrate asset-gen to FreeType WASM engine"
```

---

## Task 13: Migrate page-renderer.js

**Depends on:** Task 10

This is the largest migration — the page renderer has Knuth-Plass layout, paragraph handling, and full page composition.

**Files:**
- Modify: `src/lib/convert/page-renderer.js`
- Modify: `src/lib/convert/epub-to-kb.js`
- Modify: `scripts/gen-demo-kb.mjs`

- [ ] **Step 1: Replace measureText calls**

The page renderer calls `ctx.measureText(word).width` extensively for Knuth-Plass line breaking. Replace with `engine.measureText(word, fontOpts).width`.

This is a targeted replacement — the layout logic stays the same.

- [ ] **Step 2: Replace fillText calls — justified text strategy**

Currently renders text word by word with `ctx.fillText()` at positions calculated by Knuth-Plass.

**For non-justified text (left/center/right):** render entire line as one call:
- `engine.renderText(lineText, { font, mode })` → composite line bitmap onto page buffer

**For justified text:** render word by word (same as current approach), because HarfBuzz does not know about layout engine spacing decisions:
- For each word: `engine.renderText(word, { font, mode })` → composite at x position computed by layout engine
- Inter-word gap is calculated by Knuth-Plass (variable per line) — cannot be delegated to HarfBuzz
- This preserves the current justified spacing behavior exactly

Note: word-level rendering loses inter-word kerning, but this is negligible for Latin text and matches the current Skia behavior (also renders word by word).

- [ ] **Step 3: Replace canvas with pixel buffer**

- Remove `createCanvas(pageWidth, pageHeight)` and `ctx` usage
- Replace with `createBuffer(pageWidth, pageHeight, 255)` from compositor
- Background fill, horizontal rules, bullet points → `fillRect()`, `hline()` from compositor
- Output: raw pixel buffer instead of canvas

- [ ] **Step 4: Update page output**

Currently returns array of Canvas objects. Change to return array of pixel buffer objects:
`{ width, height, pixels: Uint8Array }` — which then get quantized and encoded by the caller (epub-to-kb.js or gen-demo-kb.mjs).

- [ ] **Step 5: Update epub-to-kb.js**

- Replace `registerFont()` calls with `engine.loadFont()`
- Pass engine to `renderPages()`
- Update page quantization: input is now `Uint8Array` grayscale instead of canvas RGBA

- [ ] **Step 6: Update gen-demo-kb.mjs**

- Initialize engine, load fonts via engine
- Pass engine to `renderPages()`
- Update page encoding to work with pixel buffers

- [ ] **Step 7: Test with demo book**

```bash
node scripts/gen-demo-kb.mjs
```

Verify: 16 pages render, chapter footers present, text is properly laid out.

- [ ] **Step 8: Commit**

```bash
git add src/lib/convert/page-renderer.js src/lib/convert/epub-to-kb.js scripts/gen-demo-kb.mjs
git commit -m "feat: migrate page-renderer to FreeType WASM engine"
```

---

## Task 14: Migrate image-to-kp.js

**Depends on:** Task 9

**Files:**
- Modify: `src/lib/convert/image-to-kp.js`
- Modify: `package.json`

- [ ] **Step 1: Replace @napi-rs/canvas image loading with pure-JS decoders**

```js
// Before:
import { createCanvas, loadImage } from '@napi-rs/canvas'

// After:
import { decode as decodeJpeg } from 'jpeg-js'
import { PNG } from 'pngjs'
import { resizeImage } from '../eink-renderer/image-resizer.js'
```

- [ ] **Step 2: Implement cross-environment image decode**

```js
async function decodeImage(input) {
  // input: ArrayBuffer or Buffer
  const buf = input instanceof ArrayBuffer ? Buffer.from(input) : input

  // Detect format from magic bytes
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    // JPEG
    const { data, width, height } = decodeJpeg(buf)
    return { pixels: new Uint8Array(data), width, height }
  } else if (buf[0] === 0x89 && buf[1] === 0x50) {
    // PNG
    const png = PNG.sync.read(buf)
    return { pixels: new Uint8Array(png.data), width: png.width, height: png.height }
  }
  throw new Error('Unsupported image format')
}
```

- [ ] **Step 3: Replace canvas drawImage + getImageData with resizeImage**

```js
export async function imageToKp(input, opts = {}) {
  const { width, height, ... } = opts

  // 1. Decode
  const decoded = await decodeImage(input)

  // 2. Resize
  const resized = await resizeImage(decoded.pixels, {
    srcW: decoded.width, srcH: decoded.height,
    dstW: width, dstH: height,
    fit, background: 0xFF,
  })

  // 3. Quantize + encode (unchanged)
  // ...
}
```

- [ ] **Step 4: Test with demo book (cover generation)**

```bash
node scripts/gen-demo-kb.mjs
```

Verify: cover and thumbnail generated correctly.

- [ ] **Step 5: Commit**

```bash
git add src/lib/convert/image-to-kp.js package.json package-lock.json
git commit -m "feat: migrate image-to-kp to pica + pure-JS decoders"
```

---

## Task 15: Remove @napi-rs/canvas Dependency

**Depends on:** Tasks 11, 12, 13, 14

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -r "napi-rs/canvas\|@napi-rs" src/ scripts/ --include="*.js" --include="*.mjs"
```

Expected: no results.

- [ ] **Step 2: Remove dependency**

```bash
npm uninstall @napi-rs/canvas canvas
```

- [ ] **Step 3: Full build and test**

```bash
npm test
node scripts/gen-ui-assets.mjs --lang en
node scripts/gen-ui-assets.mjs --lang vi
node scripts/gen-demo-kb.mjs
npm run build
```

All should pass without errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove @napi-rs/canvas dependency — fully replaced by FreeType WASM"
```

---

## Dependency Graph

```
Task 0 (vitest) ─────────────────────────────────────────────┐
Task 1 (FreeType spike) ──┬── Task 5 (font manager) ──┬──── │
                           │                            │     │
Task 2 (glyph cache) ─────│────────────────────────────│──── │
Task 3 (compositor) ───────│────────────────────────────│──── │
Task 4 (config) ───────────│────────────────────────────│──── │
                           │                            │     │
                           ├── Task 6 (shaper) ────────├──── │
                           └── Task 7 (rasterizer) ────┘     │
                                                         │    │
                              Task 8 (text renderer) ◄───┘    │
                              Task 9 (image resizer) ◄────────┘
                                        │
                              Task 10 (engine) ◄──── Tasks 4,5,6,7,8,9
                                        │
              Task 10.5 (quantize gray) ─┤  (independent, can run early)
                                        │
                    ┌───────────────┬────┴─────┬──────────────┐
                    ▼               ▼          ▼              ▼
             Task 11           Task 12     Task 13       Task 14
          (asset-renderer)   (asset-gen) (page-renderer) (image-to-kp)
                    │               │          │              │
                    └───────────────┴────┬─────┴──────────────┘
                                        ▼
                                   Task 15
                              (remove @napi-rs)
```
