# Display SDK v2 — Verified Design

## Encoding

```
(bw=0, gs=0) → black
(bw=0, gs=1) → dark gray
(bw=1, gs=0) → light gray
(bw=1, gs=1) → white
```

More bits set = whiter. `bw` = MSB of level, `gs` = LSB of level.

## Hardware Facts (verified on device)

- SSD1677 bit convention: **1 = white, 0 = black**
- FAST refresh: compares BW RAM (new) vs RED RAM (old), drives only where different
- HALF refresh: inversion-based, bypasses RED comparison, clears all ghost
- VSH1 voltage **darkens from white**. More frames = darker.
- Custom LUT mapping:
  - L0 (BW=0, RED=0): no waveform
  - L1 (BW=0, RED=1): VSH1 × 6 → light gray (less darkening)
  - L2 (BW=1, RED=0): VSH1 × 12 → dark gray (more darkening)
  - L3 (BW=1, RED=1): no waveform

## Public API

```c
void x4_display_init(const x4_display_config_t *config);
void x4_display_sleep(void);
void x4_display_render_bw(const uint8_t *bw, x4_refresh_t refresh);
void x4_display_render_grayscale(const uint8_t *bw, const uint8_t *gs, x4_refresh_t refresh);

typedef enum { X4_REFRESH_FAST, X4_REFRESH_FULL } x4_refresh_t;
```

## Grayscale Render Flow

1. `fb = bw | gs` — only true black (0,0) → 0, gray+white → 1
2. B&W FAST/HALF refresh — drives black pixels to black, gray stays white
3. Write BW=gs, RED=bw to SSD1677 — custom LUT overlay darkens gray from white
4. Zero gray positions in framebuffer_active: `fa &= ~(bw ^ gs)`
   - Result: `fa = bw & gs` (0 at all non-white, 1 at white only)
   - Next FAST: gray→white gets transition (RED=0, BW=1), no ghost

## Ghost Prevention

- `framebuffer_active` after grayscale = `bw & gs` (all non-white = 0)
- Next render FAST: RED = framebuffer_active
  - Previous gray, now white: RED=0, BW=1 → transition → clean
  - Previous gray, still gray: RED=0, BW=bw|gs=1 → transition → re-white → overlay re-darkens
  - Previous white, still white: RED=1, BW=1 → no transition → stays white
  - Previous black, still black: RED=0, BW=0 → no transition → stays black
- FULL refresh (HALF waveform) clears any accumulated artifacts
