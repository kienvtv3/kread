# Firmware Refactor Plan

## Goals
1. Reduce display buffers from 3×48KB (144KB) to 1×48KB — like Papyrix
2. Prerendered screen backgrounds — reduce runtime blit calls
3. Smart book management — NVS tracking, sort by recent
4. Stream pages from SD — no 128KB page buffer malloc
5. CPU power optimization (see power-optimization.md)

---

## 1. Display Driver: 1 Framebuffer

### Current: 3 × 48KB = 144KB static BSS
- `fb_msb` (tracking BW state)
- `fb_lsb` (tracking GS state)
- `scratch` (SPI DMA temp + differential compute)

### Target: 1 × 48KB static BSS
Like Papyrix single-buffer mode:
- `framebuffer[48KB]` — shared render target
- SSD1677's internal RED RAM tracks previous frame for differential refresh
- No scratch buffer — write directly from framebuffer to SPI

### Grayscale render flow (new)
```
1. Clear framebuffer → white
2. Render all elements into framebuffer (BW+GS composited? or separate passes?)

Actually — for 2-plane grayscale:
  Pass 1: render MSB (BW) plane → send to SSD1677 BW RAM via SPI
  Pass 2: render LSB (GS) plane → send to SSD1677 RED RAM via SPI
  Trigger grayscale LUT refresh

Each pass reuses same 48KB framebuffer.
```

### Differential (FAST) refresh
- SSD1677 RED RAM already holds previous frame after each refresh
- For FAST: read current RED RAM? No — SSD1677 doesn't support readback
- Alternative: accept HALF refresh for now (like Papyrix grayscale)
- Or: store previous BW state in chunked heap (6×8KB) like Papyrix does when needed

### RAM savings: 96KB freed (from 144KB to 48KB)

---

## 2. Prerendered Screen Backgrounds

### Concept
Each screen has static elements (frames, labels, help bar, dividers) prerendered as 1 fullscreen KP file. Embedded in firmware flash as LZ4-compressed C arrays.

Dynamic elements (cover, title, battery fill, progress fill) blitted on top at runtime.

### Screens and their backgrounds

| Screen | Static elements in background | Dynamic overlay |
|--------|------------------------------|-----------------|
| HOME | Battery frame, progress frame, arrows, help bar (Read/Library/Gallery/Settings), divider | Cover image, title, author, battery fill, progress label, progress fill |
| HOME_EMPTY | Same as HOME but with "No Books" + "Add books via USB" centered | Battery fill only |
| LIBRARY | Header "Library", divider, help bar | Book title list, selection bar |
| SETTINGS | Header "Settings", all labels + values, divider, help bar | Selection highlight |
| BOOK_MENU | Header "Book", all labels + values, divider, help bar | Selection highlight |
| BOOK_CHAPTERS | Header "Chapters", divider, help bar | Chapter name list, selection |
| READER | (no background — fullscreen page content) | — |

### Generation
New script: `gen-screen-backgrounds.mjs`
- Uses @napi-rs/canvas to render each screen's static elements
- Quantize → landscape planes → LZ4 compress
- Output: C arrays embedded in firmware

### Storage estimate
- Each background: ~5-15KB compressed (mostly white with a few elements)
- 6 backgrounds × ~10KB = ~60KB flash
- At runtime: LZ4 decompress into framebuffer (48KB) — ~1ms

### Render flow (Home example)
```
home_render():
  1. LZ4 decompress home_bg into framebuffer    // static background
  2. Send framebuffer → SSD1677 BW RAM          // MSB plane of background
  3. LZ4 decompress home_bg_gs into framebuffer  // GS plane
  4. Blit cover, title, author onto framebuffer  // dynamic elements
  5. Draw battery fill, progress fill            // primitive rects
  6. Send framebuffer → SSD1677 RED RAM          // LSB plane
  7. Trigger grayscale refresh
```

Wait — this doesn't work cleanly because background has BOTH BW and GS info mixed.

Better approach: prerender TWO planes per background:
- `home_bg_bw[compressed]` — BW/MSB plane of static elements
- `home_bg_gs[compressed]` — GS/LSB plane of static elements

Render:
```
1. Decompress home_bg_bw → framebuffer (48KB)
2. Blit dynamic BW elements (cover BW, title BW, fills)
3. Send framebuffer → SSD1677 BW RAM
4. Decompress home_bg_gs → framebuffer (48KB) — reuse same buffer
5. Blit dynamic GS elements (cover GS, title GS)
6. Send framebuffer → SSD1677 RED RAM
7. Trigger grayscale refresh
```

This works with 1×48KB framebuffer!

---

## 3. Book Management

### File list (RAM)
```c
#define MAX_BOOKS 128
typedef struct {
    char filename[32];    // just filename, not full path (save RAM)
    uint32_t last_opened; // timestamp from NVS (0 = never opened)
    uint16_t current_page;// from NVS
    uint16_t total_pages; // from .kb header (read during scan)
} book_entry_t;

// 44 bytes × 128 = 5.6KB
static book_entry_t books[MAX_BOOKS];
```

### NVS persistence
```
Key: "b_{crc16_of_filename}"  // 2-byte CRC → 4-char hex key
Value: struct { uint32_t timestamp; uint16_t page; }  // 6 bytes
```

### Sort order
1. Books with `last_opened > 0` — sorted by timestamp DESC (most recent first)
2. Books with `last_opened == 0` — sorted by filename ASC (alphabetical)

Home screen shows book[0] (most recently read). Left/Right cycles through sorted list.

### On book open (enter reader)
```c
books[i].last_opened = time(NULL);  // or monotonic counter if no RTC
nvs_set_blob("b_XXXX", &progress_data, 6);
```

### On page turn
```c
books[i].current_page = new_page;
// Debounce NVS writes — save every 5 page turns or on exit
```

---

## 4. Page Streaming from SD

### Current: malloc 128KB page buffer
Page KP = 16B header + 4B size + 48KB plane1 + 4B size + 48KB plane2 = ~96KB

### Target: stream directly into framebuffer (0 extra buffer)

For landscape-packed pages (flag 0x04):
```c
void render_page(uint32_t page_num) {
    kb_seek_page(page_num);  // fseek to page offset in .kb

    // Read KP header (16 bytes) into stack
    uint8_t hdr[16];
    fread(hdr, 1, 16, file);
    // Skip size prefix (4 bytes)

    // Plane 1 (LSB/GS): read directly into framebuffer
    uint8_t skip[4];
    fread(skip, 1, 4, file);  // lsb_size
    fread(framebuffer, 1, 48000, file);
    spi_write_to_red_ram(framebuffer, 48000);

    // Plane 2 (MSB/BW): read into same framebuffer
    fread(skip, 1, 4, file);  // msb_size
    fread(framebuffer, 1, 48000, file);
    spi_write_to_bw_ram(framebuffer, 48000);

    trigger_grayscale_refresh();
}
```

**Zero malloc. Zero extra buffer.** Same 48KB framebuffer reused for both planes.

Note: This only works for UNCOMPRESSED landscape pages. If pages are LZ4 compressed, need a temp buffer for decompression. For MVP: generate pages uncompressed (flag compress=false, already the case).

---

## 5. Dynamic Element Blitting

For elements that change per render (cover, title, author from .kb):

### Small assets (title ~4KB, author ~2KB)
- Load from SD into framebuffer region directly? No — they're portrait-packed, need blit_gs transform.
- Load into small heap buffer (~8KB), blit, free.
- Or: precompute portrait→landscape for book assets too? That changes asset-gen.

### Cover thumbnail (~30KB)
- Too large for casual malloc with tight heap.
- Option 1: Stream from SD, decompress row by row (complex)
- Option 2: Load compressed into heap (~15KB?), decompress + blit, free
- Option 3: Pre-store cover as landscape in .kb → stream directly like pages

For MVP: small heap malloc for title+author (~10KB), cover loaded via chunked approach.

---

## Summary: Memory Budget (After Refactor)

| Item | Current | After |
|------|---------|-------|
| Display framebuffers | 144KB BSS | 48KB BSS |
| Screen asset_buf | 48KB BSS | 0 (on-demand from SD) |
| Screen backgrounds | 0 | ~60KB flash (compressed) |
| Book list | 8KB BSS | 6KB BSS |
| Page buffer | 128KB heap | 0 (stream into framebuffer) |
| KB reader tables | 16KB BSS | 8KB BSS (reduced) |
| **Total RAM** | **~344KB** | **~62KB BSS + heap for temp** |
| **Free heap** | **~36KB** | **~270KB** |

This leaves plenty of room for FAST refresh, temp buffers, and future features.

---

## Implementation Order
1. Display driver refactor (1 buffer) — biggest RAM win
2. Page streaming — eliminate 128KB malloc
3. Screen backgrounds — reduce blit complexity
4. Book management with NVS — proper tracking
5. Power optimization — CPU throttle + deep sleep

## Status
- [ ] Display driver: 1 framebuffer
- [ ] Page streaming from SD
- [ ] Screen backgrounds generator
- [ ] Book management + NVS
- [ ] Power optimization
