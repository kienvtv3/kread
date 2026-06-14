# kp/kb File Format Design

Date: 2026-03-16

## Overview

Binary file formats for the kread e-reader, optimized for the Xteink X4 (ESP32-C3, SSD1677 800x480). Two formats:

- **`.kp` (kread page)**: Single pre-rendered bitmap. Used standalone for covers, splash screens, testing, and as the internal page unit inside `.kb` files.
- **`.kb` (kread book)**: Container of multiple `.kp` pages with metadata, chapters, and pre-rendered UI assets.

Design philosophy: **device only dumps pixels**. All text rendering, font shaping, antialiasing, and dithering happen on the web converter. The ESP32-C3 firmware never renders text — it reads pre-rendered bitmaps and sends them to the display.

## Why Not XTC

XTC (Xteink's native format) was evaluated and rejected for kread:

1. **No compression**: XTC pages are raw bitmaps. A 300-page 2-bit book = ~29MB. With LZ4, kread achieves ~8-15MB.
2. **Wrong pixel layout**: XTH (2-bit) uses column-major right-to-left encoding. SSD1677 RAM is row-major left-to-right. Every page requires CPU-intensive pixel transform.
3. **Dithering-only rendering**: XTC converters use dithering for text. kread uses Harfbuzz + FreeType + gamma-corrected quantization for superior text quality.

kread's format stores pages in SSD1677-native layout — `memcpy` straight to display RAM after LZ4 decompress. Zero transform.

## .kp Format (kread page)

All multi-byte fields in .kp and .kb are **little-endian** unless noted otherwise.

### Header (16 bytes)

```
Offset  Size  Field         Description
0x00    4     magic         "KP\x00\x02" (bytes: 0x4B 0x50 0x00 0x02)
0x04    2     width         Image width in pixels (uint16)
0x06    2     height        Image height in pixels (uint16)
0x08    1     bit_depth     1 = B&W only, 2 = grayscale only, 3 = dual-mode
0x09    1     compression   0 = raw, 1 = LZ4 block
0x0A    4     data_size     Total compressed data size in bytes (uint32)
0x0E    1     content_flags Bit field: 0x01=HAS_TEXT, 0x02=HAS_IMAGE
0x0F    1     reserved      0x00
```

**content_flags** (bit_depth=3 only, ignored for 1 and 2):
- `0x01` HAS_TEXT — page contains rendered text
- `0x02` HAS_IMAGE — page contains images
- `0x03` HAS_TEXT | HAS_IMAGE — mixed page

Firmware uses content_flags + user settings to decide render mode:
```
need_grayscale = (has_text && settings.text_mode == GRAYSCALE) ||
                 (has_image && settings.image_mode == GRAYSCALE)
```

**Versioning**: Magic version 0x02. `raw_size_hi` field replaced by `content_flags` + `reserved`. Uncompressed plane size computed from dimensions: `ceil(width/8) * height`.

### Pixel Data

Immediately follows header. If `compression=1`, the data section is an **LZ4 block** (raw compressed data, NOT LZ4 frame format). Use `LZ4_decompress_safe(src, dst, data_size, raw_size)` to decompress.

#### 1-bit (bit_depth=1)

One plane. Row-major, left-to-right, top-to-bottom. 8 pixels per byte, MSB = leftmost pixel.

- Bit value: 0 = black, 1 = white
- Row stride: `ceil(width / 8)` bytes
- Uncompressed size: `ceil(width / 8) * height`
- For 800x480: 100 * 480 = 48,000 bytes

#### 2-bit (bit_depth=2) — Grayscale only

Two planes (LSB + MSB). For covers, standalone images, legacy pages.

- Layout: same as 1-bit per plane (row-major, 8px/byte, MSB=left)
- Pixel value: `(MSB << 1) | LSB` → 0=black, 1=dark gray, 2=light gray, 3=white
- Data: two separate LZ4 blocks
```
[lsb_size:4][lsb_data][msb_size:4][msb_data]
```
- B&W fallback: firmware thresholds `val >= 2 → white, val < 2 → black`

#### 3 — Dual-mode (bit_depth=3)

Stores **both** B&W and grayscale versions. The converter renders from source twice. Firmware picks based on user settings.

**Data layout** (2 or 3 blocks depending on content):
```
[bw_size:4][bw_data]                1-bit B&W version (always present)
[gray_size:4][gray_data]            2-bit grayscale version (LSB+MSB sub-blocks)
[mask_size:4][mask_data]            1-bit region mask (only if mixed: content_flags=0x03)
```

Both versions rendered from **original source** (not derived from each other):
- **B&W version**: text with aggressive hinting (pixel-snapped), images with Floyd-Steinberg dithering to 1-bit
- **Grayscale version**: text with light hinting (AA), images with 4-level quantization

`gray_data` contains two sub-blocks (same format as bit_depth=2):
```
[lsb_size:4][lsb_data][msb_size:4][msb_data]
```

**Region mask** (only present when `content_flags == 0x03`, mixed text+image):
- 1-bit plane, same dimensions as page
- Bit = 0 → text region
- Bit = 1 → image region
- The converter generates this from the page layout (knows which areas are text vs image)
- `mask_size = 0` for pure text (0x01) or pure image (0x02) pages → block omitted

**content_flags** in header:
- `0x01` HAS_TEXT — text regions only, no mask needed
- `0x02` HAS_IMAGE — image regions only, no mask needed
- `0x03` HAS_TEXT | HAS_IMAGE — mixed, region mask present

**Firmware rendering logic**:
```c
if (bit_depth == 3) {
  bool has_text  = content_flags & 0x01;
  bool has_image = content_flags & 0x02;
  bool mixed     = has_text && has_image;

  bool text_gray  = has_text  && (settings.text_mode  == GRAYSCALE);
  bool image_gray = has_image && (settings.image_mode == GRAYSCALE);
  bool need_gray  = text_gray || image_gray;

  if (!need_gray) {
    // Both B&W → FAST only (fastest)
    decompress(bw_plane);
    display_bw(bw_plane);

  } else if (!mixed) {
    // Pure text or pure image → use grayscale version directly
    decompress(gray_lsb); decompress(gray_msb);
    // FAST B&W base → grayscale overlay

  } else {
    // Mixed page → composite per-pixel using region mask
    decompress(bw_plane);
    decompress(gray_lsb); decompress(gray_msb);
    decompress(region_mask);

    // Composite: for each pixel, pick source based on region + setting
    for (i = 0; i < plane_size; i++) {
      uint8_t bw = bw_plane[i];
      uint8_t gl = gray_lsb[i], gm = gray_msb[i];
      uint8_t mask = region_mask[i];

      // For each bit in the byte (8 pixels)
      for (bit = 7; bit >= 0; bit--) {
        bool is_image = (mask >> bit) & 1;
        bool use_gray = is_image ? image_gray : text_gray;

        if (use_gray) {
          // Keep gray pixel as-is (already in gl/gm)
        } else {
          // Replace with B&W pixel (val=0 or val=3)
          bool black = !((bw >> bit) & 1);  // bw: 0=black, 1=white
          // Set gray planes to B&W equivalent
          if (black) { gl &= ~(1<<bit); gm &= ~(1<<bit); }  // val=0
          else       { gl |= (1<<bit);  gm |= (1<<bit);  }  // val=3
        }
      }
      gray_lsb[i] = gl;
      gray_msb[i] = gm;
    }

    // Display composited result
    // FAST B&W base → grayscale overlay
  }
}
```

**Settings combinations for a mixed page** (text + image):
```
Text=B&W,  Image=B&W   → bw_data only           → FAST only     (fastest)
Text=B&W,  Image=Gray  → composite: BW text +    → FAST+gray     (text sharp, image smooth)
                          gray image via mask
Text=Gray, Image=B&W   → composite: gray text +  → FAST+gray     (text smooth, image sharp)
                          BW image via mask
Text=Gray, Image=Gray  → gray_data only          → FAST+gray     (all smooth)
```

**Key advantage**: Every pixel uses the EXACT data for its requested mode. Text=B&W always gets aggressive-hinted text, even on mixed pages. No quality compromise.

**Region mask overhead**: ~8KB uncompressed, ~1-3KB LZ4 (rectangular regions compress well). Only present on mixed pages. Pure text/image pages have no mask.

**Size per page**:
```
Content         B&W LZ4    Gray LZ4    Mask LZ4   Total
Pure text       ~8KB       ~25KB       —          ~33KB
Pure image      ~12KB      ~25KB       —          ~37KB
Mixed           ~10KB      ~25KB       ~2KB       ~37KB
```

Trade-off vs delta encoding: larger per-page, but supports per-pixel compositing with independent Text/Image mode control. Both versions rendered at highest quality from original source.

**When to use each bit_depth**:
- `1`: UI assets (menus, settings, library items) — always B&W, no choice needed
- `2`: Cover images, splash screens — grayscale only, B&W fallback via threshold
- `3`: All reader pages (text, image, mixed) — dual-mode, firmware picks based on settings

**Per-page bit_depth in .kb**: Each page has its own kp header. A .kb file can mix bit_depths. Typically all reader pages are bit_depth=3, while assets are bit_depth=1 and cover is bit_depth=2.

### SSD1677 Compatibility

The plane layout directly matches `x4_display_grayscale_lsb()` / `x4_display_grayscale_msb()`:

- LSB plane → BW RAM (CMD 0x24)
- MSB plane → RED RAM (CMD 0x26)
- Grayscale LUT refresh → 4-level display

After LZ4 decompress, firmware sends planes to display with zero pixel transformation.

### Grayscale Value Mapping

```
Value  LSB(BW)  MSB(RED)  SSD1677 LUT Result
0      0        0         Black
1      1        0         Dark gray
2      0        1         Light gray
3      1        1         White
```

Note: Value = `(MSB << 1) | LSB`. For value 1 (dark gray): MSB=0, LSB=1 → `(0<<1)|1 = 1`. For value 2 (light gray): MSB=1, LSB=0 → `(1<<1)|0 = 2`.

This mapping matches the kread x4 SDK's `lut_grayscale` LUT (ported from Papyrix, tuned for GDEQ0426T82).

## .kb Format (kread book)

### File Layout

```
┌─ Header ─────────────────────────────────┐
│  32 bytes, fixed binary struct           │
├─ Page Table ─────────────────────────────┤
│  8 bytes per page                        │
├─ Chapter Offsets ────────────────────────┤
│  2 bytes per chapter (page indices)      │
├─ Asset Index + Asset Data ───────────────┤
│  Pre-rendered bitmaps (kp format)        │
├─ Page Data ──────────────────────────────┤
│  kp blobs (header + LZ4 compressed)     │
├─ Converter Metadata ─────────────────────┤
│  JSON blob (web app only, firmware skip) │
└──────────────────────────────────────────┘
```

### Header (32 bytes, little-endian)

```
Offset  Size  Field              Description
0x00    4     magic              "KB\x00\x02" (bytes: 0x4B 0x42 0x00 0x02)
0x04    2     page_count         Total pages (uint16)
0x06    1     chapter_count      Number of chapters (uint8)
0x07    1     rendition_count    Number of renditions (uint8, =1 for v1)
0x08    1     font_size_idx      Enum: 0=8pt, 1=10pt, 2=11pt, 3=12pt, 4=14pt
0x09    1     orientation        0=portrait, 1=landscape
0x0A    1     mode               0=light, 1=dark
0x0B    1     flags              Bit field: 0x01=HAS_DUAL_MODE (pages have bit_depth=3)
0x0C    4     page_table_offset  Byte offset to page table (uint32)
0x10    4     chapter_offset     Byte offset to chapter offsets (uint32)
0x14    4     asset_offset       Byte offset to asset section (uint32)
0x18    2     asset_count        Number of pre-rendered assets (uint16)
0x1A    4     meta_offset        Byte offset to converter metadata (uint32)
0x1E    2     meta_size          Converter metadata size in bytes (uint16, max 64KB)
```

`flags` field: `HAS_DUAL_MODE` (0x01) indicates reader pages use bit_depth=3 (dual-mode with both B&W and grayscale versions). Assets always use bit_depth=1 (B&W). Cover uses bit_depth=2. Dithering info moved to converter metadata JSON.

**Version note**: Magic bumped to 0x02. v1 firmware rejects v2 files gracefully.

### Page Table

Located at `page_table_offset`. Array of `page_count` entries, 8 bytes each:

```
Offset  Size  Field        Description
0x00    4     data_offset  Byte offset to page kp data (uint32)
0x04    4     data_size    Total page size including kp header (uint32)
```

Page dimensions and bit_depth are stored in each page's kp header. For books, all pages typically share the same dimensions (e.g., 800x480 landscape or 480x800 portrait).

### Chapter Offsets

Located at `chapter_offset`. Array of `chapter_count` entries:

```
uint16[chapter_count]  — 0-based page indices
```

Example: `[0, 24, 51]` means Chapter 1 starts at page 0, Chapter 2 at page 24, Chapter 3 at page 51.

Chapter offsets are per-rendition (different font/size = different page breaks). For v1 with rendition_count=1, there is one array. Future multi-rendition support would store multiple arrays.

### Pre-rendered Assets

Located at `asset_offset`. Contains pre-rendered bitmaps for UI display.

#### Asset Index

Array of `asset_count` entries, 12 bytes each:

```
Offset  Size  Field   Description
0x00    1     type    Asset type enum (see below)
0x01    1     index   Sub-index (e.g., chapter number)
0x02    2     height  Asset height in pixels (uint16)
0x04    4     offset  Byte offset to asset kp data (uint32)
0x08    4     size    Asset kp data size in bytes (uint32)
```

Width is not stored per-asset — assets are rendered at a predefined container width per asset type (e.g., display width for titles, column width for chapter list items). Height varies per asset.

#### Asset Types

```
0x00  ASSET_FONT_NAME      Pre-rendered font name (e.g., "Literata")
0x01  ASSET_BOOK_TITLE     Pre-rendered book title
0x02  ASSET_BOOK_AUTHOR    Pre-rendered author name
0x03  ASSET_COVER          Cover image (full page or thumbnail)
0x04  ASSET_CHAPTER_NAME   Pre-rendered chapter name (index = chapter number)
```

#### Asset Data

Each asset is a kp blob (16-byte header + LZ4 compressed bitmap). Assets are always **bit_depth=1** (B&W with aggressive hinting) for sharpest UI text. Cover images (ASSET_COVER) use **bit_depth=2** (grayscale).

Assets are typically small bitmaps (e.g., 480x30 for a chapter name line, 480x60 for a book title).

### Page Data

Pages stored sequentially (order matches page table). Each page is a complete kp blob:

```
[kp header 16 bytes][LZ4 compressed plane data]
```

### Converter Metadata

Located at `meta_offset`, size `meta_size`. JSON blob readable by the web app for library management and re-conversion. Firmware never reads this section.

```json
{
  "title": "Dế Mèn Phiêu Lưu Ký",
  "author": "Tô Hoài",
  "language": "vi",
  "font_family": "Literata",
  "font_size": "11pt",
  "orientation": "portrait",
  "mode": "light",
  "dither": "gamma-threshold",
  "converter": "kread-web 0.1.0",
  "source_format": "epub",
  "source_hash": "sha256:abc123...",
  "created": "2026-03-16T10:00:00Z"
}
```

## Reading Progress

Progress is NOT stored in `.kb` files. `.kb` files are read-only after transfer.

Progress is stored in a separate file on SD card:

```
/sd/.kread/progress.json
{
  "books/demen.kb": {"page": 42, "ts": 1741024800},
  "books/harry.kb": {"page": 156, "ts": 1741020000}
}
```

Written by firmware when user exits a book or periodically. Small file, minimal SD wear.

Progress display on home/library screen: firmware computes `page / page_count` and displays using baked digit bitmaps (0-9, %).

## Compression

LZ4 only. No other algorithms supported.

- Decompress speed: ~5ms for 96KB on ESP32-C3 (160MHz RISC-V)
- Compress ratio: ~40-60% for text pages (48KB → ~20-30KB compressed)
- Library: Bundle LZ4 source (lz4.c/lz4.h, ~800 LOC) in firmware. ESP-IDF's `esp_rom` includes miniz (zlib), not LZ4.

Text pages compress well because large areas are white (0xFF bytes). Image pages compress less but still benefit.

## Dithering Algorithms

The web converter supports 15 algorithms for image processing. Text always uses the kread pipeline (Harfbuzz → FreeType → gamma-aware quantization, no dithering).

The `dither_algo` field in `.kb` header records which algorithm was used (informational for UI display). Firmware bakes bitmap labels for each algorithm name.

### Algorithm Enum

```
0   Gamma-aware threshold (default for text, kread pipeline)
1   Threshold (simple quantize, no dithering)
2   Floyd-Steinberg
3   Jarvis-Judice-Ninke
4   Stucki
5   Atkinson
6   Sierra
7   Sierra Two-Row
8   Sierra Lite
9   Burkes
10  Bayer 2x2
11  Bayer 4x4
12  Bayer 8x8
13  Random noise
14  Blue noise
```

### Algorithm Categories

**Error Diffusion** (diffuse quantization error to neighboring pixels):
- Floyd-Steinberg: Classic, 4 neighbors, 100% error diffusion. Balanced.
- Jarvis-Judice-Ninke: 12 neighbors, smoothest, slowest.
- Stucki: 12 neighbors, different weights than Jarvis.
- Atkinson: 6 neighbors, 75% error diffusion. Preserves highlights, "lighter" feel.
- Sierra: 3-row, good detail preservation.
- Sierra Two-Row: 2-row variant, faster.
- Sierra Lite: 2 neighbors only, fastest error diffusion, sharp.
- Burkes: 2-row, strong weights.

**Ordered Dithering** (deterministic threshold matrix):
- Bayer 2x2: Visible grid, predictable. Good for pixel art.
- Bayer 4x4: Less visible pattern, common.
- Bayer 8x8: Smoothest ordered, still has structured look.

**Other**:
- Threshold: Direct quantize to nearest level. Clean for AA text, bad for gradients.
- Random noise: Add random noise before threshold. Breaks banding but grainy.
- Blue noise: Evenly distributed random noise. Highest quality noise-based. Requires pre-computed texture.
- Gamma-aware threshold: Threshold with gamma curve (γ≈1.8) for e-ink non-linearity compensation. Default for kread text pipeline.

### Converter UI

- **Basic mode**: 4 presets (Sharp/Smooth/Light/Retro) mapping to Gamma-threshold, Floyd-Steinberg, Atkinson, Bayer 4x4
- **Advanced mode**: Full 15 algorithms with preview

## Multi-Rendition (Future)

Reserved in v1, not implemented.

`rendition_count` field in header is set to 1. Future versions can store multiple renditions (different font/size/orientation) in the same `.kb` file. Each rendition would have its own page table and chapter offsets. Pre-rendered assets (chapter names, title) are shared across renditions.

Backward compatible: v1 firmware reads `rendition_count=1` and ignores the field. v2 firmware reads `rendition_count=N` and presents a selection UI.

## Page Turn Performance

```
Step                          Time
SD card seek + read           ~3ms   (LZ4 page ~30KB)
LZ4 decompress → 96KB        ~5ms
SPI write LSB plane           ~10ms
SPI write MSB plane           ~10ms
Grayscale LUT refresh         ~600ms
──────────────────────────────────────
Total                         ~628ms
```

With SD cache (pre-decompress next pages in background):
```
SD read (raw plane)           ~3ms
SPI write 2 planes            ~20ms
Refresh                       ~600ms
──────────────────────────────────────
Total                         ~623ms
```

## Typical File Sizes

| Content | Pages | Raw Size | LZ4 Compressed |
|---------|-------|----------|----------------|
| Novel (text only, 2-bit) | 300 | 29 MB | ~10-15 MB |
| Manga (images, 1-bit) | 200 | 9.6 MB | ~5-8 MB |
| Technical book (mixed) | 500 | 48 MB | ~20-30 MB |

## Firmware Reading Flow

```c
// Open book
FILE *f = fopen("/sd/books/novel.kb", "rb");
kb_header_t hdr;
fread(&hdr, sizeof(hdr), 1, f);

// Read page table into RAM (~2.4KB for 300 pages)
fseek(f, hdr.page_table_offset, SEEK_SET);
page_entry_t *pages = malloc(hdr.page_count * sizeof(page_entry_t));
fread(pages, sizeof(page_entry_t), hdr.page_count, f);
// ... use pages ...
// free(pages) when done with book

// Display page N
fseek(f, pages[N].data_offset, SEEK_SET);
// Read kp header, LZ4 decompress, blast to display
```

## Pre-rendered UI Asset Dictionary (Future Design)

A key-value dictionary system for pre-rendered text elements is planned as a separate design. This will support:
- Firmware UI elements keyed by semantic name (e.g., "btn.back", "label.chapters")
- Multi-language support via keyed dictionaries (e.g., "en/btn.back", "vi/btn.back")
- Container-based layout (each asset has a bounding box, firmware places at positions)
- Separation of concerns: `.kb` assets are per-book, UI dictionary is firmware-level

This will be specified in a dedicated design document.
