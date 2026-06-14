# Unified E-ink Rendering Engine Design

## Problem

5 JS scripts + 1 web app emulator each implement their own canvas→quantize→encode pipeline with different conventions:

- **3 different quantization methods**: fixed thresholds (80/150/210), inverted levels (3-level=black), gamma-corrected
- **2 bit conventions**: "set bit = darker" (inverted) vs "set bit = lighter" (direct)
- **2 plane naming schemes**: lsb/msb vs bw/gs
- **2 KP versions**: v1 vs v2 with different data layouts
- **2 LZ4 methods**: frame format (strip header hack) vs raw block (correct)

Result: inconsistent rendering quality, firmware needs per-format adapters with inversions, bugs are hard to trace.

## Goal

One shared engine module. All scripts and the web app import from it. Firmware reads one format without adaptation.

## Design

### Module Location

```
web/src/lib/eink/
├── index.js        — re-exports public API
├── quantize.js     — gamma-corrected 4-level quantization (existing, moved)
└── encoder.js      — portrait→landscape rotation, plane packing, KP binary (existing, moved + cleaned)
```

**Why `src/lib/eink/`**: already on Vite's resolve path for the web app. Node.js scripts import via relative path `../src/lib/eink/index.js`.

### Canonical Convention

Everywhere — JS encoder, firmware decoder, KP format, documentation:

```
Level 0 = black    → (bw=0, gs=0)
Level 1 = dark     → (bw=0, gs=1)
Level 2 = light    → (bw=1, gs=0)
Level 3 = white    → (bw=1, gs=1)

bw = level >> 1
gs = level & 1
```

Planes init to 0x00 (all black). Bits SET for lighter pixels. Matches SSD1677 hardware directly: firmware writes planes to BW RAM and RED RAM without any inversion or transformation.

Plane names: **bw** and **gs** (not lsb/msb, not msb/lsb). "bw" = BW RAM on SSD1677, "gs" = RED RAM (grayscale channel).

### Quantization

Default: **gamma-corrected** (γ=1.8) with asymmetric thresholds optimized for text on white background at 220 PPI:

```js
const corrected = Math.pow(gray / 255, gamma);
if (corrected < 0.10) level = 0;  // black — text body
if (corrected < 0.35) level = 1;  // dark gray — strong AA fringe
if (corrected < 0.65) level = 2;  // light gray — soft AA fringe
else                  level = 3;  // white — background
```

This preserves anti-aliased edges as visible gray levels instead of pushing them to white, producing readable text on e-ink.

Also available: `quantizeFloydSteinberg()` for images/photos (already implemented).

### KP Binary Format (single version)

```
Header (16 bytes):
  [0..3]   magic: "KP\x00\x01"
  [4..5]   width: uint16 LE (800 — landscape)
  [6..7]   height: uint16 LE (480 — landscape)
  [8]      bit_depth: 2
  [9]      compression: 1 (LZ4 raw block)
  [10..13] data_size: uint32 LE
  [14..15] reserved

Data:
  [bw_compressed_size: uint32 LE]
  [bw_lz4_block]
  [gs_compressed_size: uint32 LE]
  [gs_lz4_block]
```

LZ4 compression uses **raw block format** (`lz4js.compressBlock`), not frame format. Firmware decodes with `LZ4_decompress_safe()`.

Portrait (480×800) input is rotated to landscape (800×480) during encoding:
```
portrait (px, py) → landscape (lx, ly) = (py, width - 1 - px)
```

### Public API

```js
// web/src/lib/eink/index.js

// Quantization: RGBA pixels → 2-bit level array
export { quantizeGamma, quantizeFloydSteinberg } from './quantize.js';

// Full-page encoding (portrait canvas → landscape KP binary)
export { canvasToKp, canvasToPlanes } from './encoder.js';

// Portrait-oriented encoding (for dictionary small bitmaps, no rotation)
export { portraitToPlanes, encodePlanes } from './encoder.js';
```

#### `canvasToKp(canvas, opts?)`

Full pipeline: canvas → quantize → rotate → pack planes → LZ4 → KP binary.

```js
const kp = canvasToKp(canvas);                    // default gamma=1.8
const kp = canvasToKp(canvas, { gamma: 2.2 });    // custom gamma
const kp = canvasToKp(canvas, { dither: true });   // Floyd-Steinberg for photos
```

#### `canvasToPlanes(canvas, opts?)`

Returns raw landscape-rotated planes (no KP header, no compression). For gen-test-pages which outputs raw .bin files.

```js
const { bw, gs } = canvasToPlanes(canvas);
writeFileSync('page_bw.bin', bw);
writeFileSync('page_gs.bin', gs);
```

#### `portraitToPlanes(canvas, opts?)`

Returns portrait-oriented planes (no rotation). For dictionary bitmaps that are blitted at arbitrary positions by firmware.

```js
const { bw, gs, width, height } = portraitToPlanes(canvas);
```

#### `encodePlanes(bw, gs, width, height)`

Wraps pre-built planes into KP binary with LZ4 compression.

### Dictionary Integration

`scripts/lib/dict-encoder.mjs` keeps its canvas drawing logic (`renderEntry`, `renderIconEntry`) but replaces its encoding internals:

```js
// Before (inline, inverted convention):
function pixelsToPlanes(rgba, w, h) { ... 3-level inversion ... }
function lz4CompressRaw(input) { ... frame format strip hack ... }
function encodeKpBlob(bw, lsb, msb, w, h, depth) { ... }

// After:
import { quantizeGamma } from '../src/lib/eink/quantize.js';
import { portraitToPlanes, encodePlanes } from '../src/lib/eink/encoder.js';

// renderEntry returns portrait canvas, then:
const { bw, gs } = portraitToPlanes(canvas);
const blob = encodePlanes(bw, gs, canvas.width, canvas.height);
```

Dictionary blobs use the **same KP format** but with portrait dimensions (e.g., 120×48) and no rotation.

### Firmware Changes

#### KP Decoder (`home.c`)

```c
// Decompress KP planes directly — no inversion needed
LZ4_decompress_safe(p, fb_msb, bw_comp_size, FB_SIZE);  // bw → BW RAM
LZ4_decompress_safe(p, fb_lsb, gs_comp_size, FB_SIZE);  // gs → RED RAM
// Planes match display convention directly
x4_display_render_grayscale(fb_msb, fb_lsb, X4_REFRESH_FULL);
```

#### Blit (`blit.c`)

Remove `!pixel` inversion from `blit_bw()` — dictionary planes now use same convention:

```c
// Before: fb_set_pixel(fb, x+col, y+row, !pixel);
// After:  fb_set_pixel(fb, x+col, y+row, pixel);
```

Same for `blit_gs()` — remove `!msb_pixel` and `!lsb_pixel`.

#### Dictionary decoder (`ui_assets.c`)

No changes needed to decompression logic. Just convention now matches — decoded planes are used as-is.

### Migration Checklist

| File | Action |
|------|--------|
| `src/lib/quantize.js` | Move to `src/lib/eink/quantize.js` |
| `src/lib/kp-encoder.js` | Merge into `src/lib/eink/encoder.js`, rename lsb/msb → bw/gs, add `canvasToKp` |
| `src/lib/eink/index.js` | New: re-export public API |
| `scripts/gen-test-pages.mjs` | Replace inline encoding with `import { canvasToPlanes, quantizeGamma }` |
| `scripts/gen-home-kp.mjs` | Replace inline encoding with `import { canvasToKp }` |
| `scripts/gen-screens.mjs` | Replace inline encoding with `import { canvasToKp }` |
| `scripts/gen-home-empty.mjs` | Replace inline encoding with `import { canvasToKp }` |
| `scripts/gen-test-kp.mjs` | Check and update if uses own encoding |
| `scripts/lib/dict-encoder.mjs` | Remove `pixelsToPlanes`, `lz4CompressRaw`, `encodeKpBlob`. Import from eink engine. |
| `src/emulator/screen.js` | Import quantization from eink engine |
| `firmware/src/blit.c` | Remove `!pixel` inversion |
| `firmware/src/screens/home.c` | Remove `~` plane inversion |
| `firmware/src/ui_assets.c` | Verify convention match (may need no changes) |

### Files Deleted After Migration

- `src/lib/quantize.js` (moved to eink/)
- `src/lib/kp-encoder.js` (merged into eink/encoder.js)
- `scripts/test-quantize.mjs` (temporary test tool)
