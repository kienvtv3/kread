# Text Rendering Strategy

## Core Philosophy

Pre-rendering on the web app (desktop/browser) is the key advantage of kread.
All heavy lifting happens before transfer to device — the ESP32-C3 only dumps pixels.

## EPUB Content Rendering (highest quality)

- **Shaping**: Harfbuzz WASM for full OpenType shaping (ligatures, kerning, GSUB/GPOS)
- **Rasterization**: FreeType-level vector rendering, NOT bitmap pre-baked
- **Antialiasing**: 8-bit grayscale coverage map per glyph
- **Hinting**: `FT_LOAD_TARGET_LIGHT` — light hinting only, 220ppi is above aggressive hinting threshold
- **Quantization**: 8-bit coverage → gamma correction (γ ≈ 1.8 for e-ink non-linearity) → 4 levels (2-bit)
- **Output**: Baked into `.kb` pages — device has zero font rendering logic

### Font Choices (priority order, all SIL OFL)

| Font | Style | Why |
|------|-------|-----|
| Literata | Serif | Designed specifically for e-reader body text |
| Faustina | Serif | Charter/Bookerly reference, high x-height, low contrast |
| Atkinson Hyperlegible Next | Sans | Best sans-serif for readability |
| Andika | Sans | Good hinting, literacy-optimized |

User can also add any Google Fonts URL.

## UI Text Rendering (pragmatic approach)

### Dynamic Short Strings
- Book title, author, filename
- Pre-rendered at convert time, stored as small bitmaps inside `.kb` header
- Same pipeline as EPUB — full AA + gamma

### Numeric/Status Text
- Page number, progress %, time display
- Digits-only bitmap font: `0-9`, `%`, `/`, `:` — 11 glyphs total
- Rendered once on desktop at target size with full AA
- Baked into firmware binary at build time

### Fixed System Strings
- Menu labels, settings options (~50 strings)
- Pre-rendered set baked into firmware at build time
- Same desktop rendering pipeline — not a live font system
- Supports i18n (EN + VI) by having pre-rendered sets per language

## What We Do NOT Do

- No runtime font rendering on device
- No bitmap font files shipped for body text
- No threshold-only quantization (loses all AA benefit)
- No hinting bypass (even at 220ppi, light hinting improves stem consistency)
- No GfxRenderer/EpdFont from CrossPoint/Papyrix — unnecessary complexity

## Quantization Pipeline

```
glyph vector (OTF/TTF)
  → Harfbuzz shape (GSUB/GPOS)
  → FreeType rasterize (light hinting, 8-bit AA)
  → gamma correction (γ=1.8, compensate e-ink non-linearity)
  → quantize to 4 levels:
      coverage < 0.15  → level 3 (white)
      coverage < 0.45  → level 2 (light gray)
      coverage < 0.75  → level 1 (dark gray)
      coverage >= 0.75 → level 0 (black)
  → pack 2bpp into page bitmap
  → LZ4 compress
  → store in .kb file
```

## Firmware Side

Firmware receives pre-rendered 2bpp bitmaps. For each page turn:

```c
// ~5ms
lz4_decompress(page_compressed, framebuffer, page_size);

// ~120-600ms depending on waveform
ssd1677_write_ram(framebuffer, 48000);
ssd1677_refresh(waveform_mode);
```

No font loading, no text layout, no glyph rendering. Just decompress and blast.
