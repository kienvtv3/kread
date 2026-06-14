# Firmware Home Screen — Design Spec

**Date:** 2026-03-19
**Scope:** Home screen implementation + asset pipeline + KB reader

## Goal

Implement Home screen on ESP32-C3 firmware matching the web emulator: display current book (cover, title, author, progress), navigate between books with Left/Right, battery indicator, help bar. All UI assets embedded in firmware flash as C arrays.

## Asset Pipeline

### Flow

```
definitions.yaml
    → gen-ui-assets.mjs → .kp files (per language)
    → gen-asset-headers.mjs (new) → .h + .c files → firmware compile
```

### Generated Output

`gen-asset-headers.mjs` converts all .kp files into C source:

```c
// ui_assets_data.c — auto-generated, do not edit

#include "ui_assets.h"

// ── English ──
static const uint8_t _en_help_read[] = { 0x4B, 0x50, 0x00, 0x02, ... };
static const uint8_t _en_help_library[] = { ... };
// ... 203 assets

const ui_asset_t UI_ASSETS_EN[] = {
    [ASSET_HELP_READ]    = { _en_help_read,    116, 39 },
    [ASSET_HELP_LIBRARY] = { _en_help_library,  116, 39 },
    // ...
};

// ── Vietnamese ──
static const uint8_t _vi_help_read[] = { ... };
// ... 203 assets

const ui_asset_t UI_ASSETS_VI[] = { ... };
```

Header file:

```c
// ui_assets.h — auto-generated
#pragma once
#include <stdint.h>

typedef struct {
    const uint8_t *data;  // KP v2 blob in flash (DROM)
    uint16_t w, h;        // pixel dimensions
} ui_asset_t;

// Asset index — shared across all languages
enum {
    ASSET_HELP_READ = 0,
    ASSET_HELP_LIBRARY,
    ASSET_HELP_GALLERY,
    ASSET_HELP_SETTINGS,
    ASSET_HDR_LIBRARY,
    ASSET_HDR_SETTINGS,
    ASSET_PROGRESS_UNREAD,
    ASSET_PROGRESS_FINISHED,
    ASSET_PROGRESS_1,
    // ... ASSET_PROGRESS_99
    ASSET_BATTERY_FRAME,
    ASSET_PROGRESS_FRAME,
    ASSET_ARROW_LEFT,
    ASSET_ARROW_RIGHT,
    ASSET_EMPTY_NO_BOOK,
    ASSET_EMPTY_NO_BOOK_SUB,
    // ... all 203 entries
    ASSET_COUNT
};

// Per-language asset tables (in DROM, 0 RAM)
extern const ui_asset_t UI_ASSETS_EN[];
extern const ui_asset_t UI_ASSETS_VI[];
```

### No shared assets

Each language has a full set of 203 assets. No sharing logic — keeps lookup simple (single array index). Flash cost: ~273KB per language, ~546KB for 2 languages (8% of 6.5MB flash).

### Language switching

```c
// Runtime language pointer
const ui_asset_t *ui_lang = UI_ASSETS_EN;

// Switch: just swap pointer, instant, no reload
void ui_set_language(const ui_asset_t *table) {
    ui_lang = table;
}

// Access: ui_lang[ASSET_HELP_READ].data / .w / .h
```

Language preference saved to NVS, restored on boot.

## KB Reader

New file: `src/kb_reader.c` (implement the existing `kb_reader.h` interface)

### API

```c
// Open a .kb file from SD, parse header + page table + asset index
bool kb_open(const char *path);

// Close current file
void kb_close(void);

// Metadata
const kb_metadata_t *kb_get_metadata(void);
uint32_t kb_get_page_count(void);

// Load an asset (cover, title, author) into buffer
// Returns size of KP blob, or 0 if not found
uint32_t kb_load_asset(uint8_t type, uint8_t index, uint8_t *buf, uint32_t buf_size);

// Load a page into framebuffer (decompress LZ4 → decode KP → blit)
bool kb_load_page(uint32_t page_num, uint8_t *fb_bw, uint8_t *fb_gs);
```

### Parse strategy

- Open file, read 32-byte header → page count, chapter count, asset count, offsets
- Read page table into RAM (~8 bytes × page_count, max 32 pages = 256 bytes for scanning)
- Asset index: ~12 bytes × asset_count (~13 assets = 156 bytes)
- Pages loaded on-demand: seek to offset, read compressed KP, LZ4 decompress, blit
- Only 1 book open at a time — close previous before opening next

### Memory for KB reader

| Item | RAM |
|------|-----|
| Header | 32 bytes |
| Page table (max 500 pages) | 4KB |
| Asset index (max 20 assets) | 240 bytes |
| File handle | ~100 bytes |
| **Total** | ~4.5KB |

Page/asset decompression uses the framebuffer itself as destination — no extra buffer needed for full pages. For smaller assets (cover thumb 300×400), a temp buffer of ~2KB (packed planes) is needed.

## KP Decode on Firmware

All assets are KP v2, bit_depth=2. Firmware decode:

```c
// KP v2 header: [magic:4][w:2][h:2][depth:1][comp:1][dataSize:4][flags:1][reserved:1]
// Data: [lsb_size:4][lsb_data][msb_size:4][msb_data]

void kp_decode_and_blit(const uint8_t *kp_data, uint32_t kp_size,
                         uint8_t *fb_bw, uint8_t *fb_gs,
                         uint16_t dst_x, uint16_t dst_y) {
    // 1. Parse header → w, h, compression
    // 2. Read lsb_size, lsb_data (decompress if LZ4)
    // 3. Read msb_size, msb_data (decompress if LZ4)
    // 4. blit_gs(fb_bw, fb_gs, lsb, msb, w, h, dst_x, dst_y)
}
```

For flash-embedded assets (uncompressed): direct pointer, no copy needed.
For SD assets (may be LZ4 compressed): decompress into temp buffer, then blit.

## Book List

### Scanning

On boot (and after serial file transfer), scan `/sd/*.kb`:

```c
#define MAX_BOOKS 32
typedef struct {
    char filename[64];      // e.g., "demo.kb"
    char title[128];        // from kb metadata
    char author[64];        // from kb metadata
    uint32_t page_count;
    uint8_t progress;       // 0-100, stored in NVS
} book_entry_t;

book_entry_t book_list[MAX_BOOKS];
uint8_t book_count = 0;
int8_t current_book = -1;   // -1 = no book
```

Scan: `opendir("/sd")` → filter `*.kb` → for each: `kb_open` → read metadata → `kb_close` → store in `book_list`. RAM: ~8KB for 32 books.

### Progress tracking

Per-book progress stored in NVS under key `prog_{filename_hash}`. Updated when reader navigates pages.

## Home Screen Rendering

### Layout (matches emulator exactly)

```
┌──────────────────────────────────────────────┐
│                              [battery] 433,18 │ ← status bar
│                                               │
│    ◁   ┌──────────────────┐   ▷              │ ← arrows centered
│        │                  │                    │   in gap between
│        │   Cover 300×400  │                    │   bezel and cover
│        │                  │                    │
│        └──────────────────┘                    │
│                                               │
│   Title Line 1                                │ ← from .kb asset
│   Title Line 2...                             │   x=28, bottom=603
│   AUTHOR NAME                                 │ ← x=28, y=611
│                                               │
│              UNREAD / 42% READ                │ ← progress label
│   [════════════════════════════]              │ ← progress bar
│                                               │
│  ◀Read   ▼Library   ▲Gallery   ▼Settings     │ ← help bar
└──────────────────────────────────────────────┘
```

### Positions (from emulator layout.js)

| Element | Position | Source |
|---------|----------|--------|
| Battery frame | x=433, y=18 | flash asset |
| Battery fill | inside frame | firmware fillRect |
| Cover thumb | centered, y=64, 300×400 | .kb asset |
| Arrow left | centered in left gap | flash asset |
| Arrow right | centered in right gap | flash asset |
| Title | x=28, bottom_y=603, max 2 lines | .kb asset |
| Author | x=28, y=611 | .kb asset |
| Progress label | center_x=240, bottom_y=696 | flash asset (progress.N) |
| Progress frame | x=27, y=700 | flash asset |
| Progress fill | inside frame | firmware fillRect |
| Help bar | y=752, 4 slots | flash assets |
| Help divider | y=751, full width | firmware hline |
| No-book msg | centered | flash asset |

### Render function

```c
void home_render(void) {
    // 1. Clear framebuffers to white
    memset(fb_bw, 0xFF, FB_SIZE);
    memset(fb_gs, 0xFF, FB_SIZE);

    // 2. Battery
    kp_blit(ui_lang[ASSET_BATTERY_FRAME], 433, 18);
    draw_battery_fill(433, 18, battery_percent);

    if (current_book >= 0) {
        book_entry_t *b = &book_list[current_book];

        // 3. Cover thumbnail (from .kb asset, cached in RAM)
        kp_blit_asset(cover_thumb_buf, cover_thumb_size, thumb_x, 64);

        // 4. Cover border
        draw_rect_border(thumb_x, 64, 300, 400, 2);

        // 5. Arrows
        kp_blit(ui_lang[ASSET_ARROW_LEFT], arrow_left_x, arrow_y);
        kp_blit(ui_lang[ASSET_ARROW_RIGHT], arrow_right_x, arrow_y);

        // 6. Title + Author (from .kb assets, cached)
        kp_blit_asset(title_buf, title_size, 28, title_y);
        kp_blit_asset(author_buf, author_size, 28, 611);

        // 7. Progress
        uint8_t prog = b->progress;
        int asset_idx = prog == 0 ? ASSET_PROGRESS_UNREAD
                      : prog >= 100 ? ASSET_PROGRESS_FINISHED
                      : ASSET_PROGRESS_1 + prog - 1;
        kp_blit_centered(ui_lang[asset_idx], 240, 696);

        // 8. Progress bar
        kp_blit(ui_lang[ASSET_PROGRESS_FRAME], 27, 700);
        draw_progress_fill(27, 700, prog);
    } else {
        // No books state
        kp_blit_centered(ui_lang[ASSET_EMPTY_NO_BOOK], 240, 350);
        kp_blit_centered(ui_lang[ASSET_EMPTY_NO_BOOK_SUB], 240, 380);
    }

    // 9. Help bar
    draw_help_bar_divider(751);
    kp_blit(ui_lang[ASSET_HELP_READ], slot_x(0), 752);
    kp_blit(ui_lang[ASSET_HELP_LIBRARY], slot_x(1), 752);
    kp_blit(ui_lang[ASSET_HELP_GALLERY], slot_x(2), 752);
    kp_blit(ui_lang[ASSET_HELP_SETTINGS], slot_x(3), 752);

    // 10. Refresh display
    display_refresh_full();
}
```

### Button handling

```c
void home_input(x4_button_t btn) {
    switch (btn) {
        case BTN_LEFT:
            if (book_count > 0) {
                current_book = (current_book - 1 + book_count) % book_count;
                load_current_book_metadata();
                home_render();
            }
            break;
        case BTN_RIGHT:
            if (book_count > 0) {
                current_book = (current_book + 1) % book_count;
                load_current_book_metadata();
                home_render();
            }
            break;
        case BTN_UP:
            battery_percent = (battery_percent + 10) % 110; // mock for testing
            home_render();
            break;
        case BTN_DOWN:
            battery_percent = (battery_percent - 10 + 110) % 110; // mock for testing
            home_render();
            break;
        // BACK → Reader, CONFIRM → Library (stub for now)
    }
}
```

## Demo Books

3 books generated by modified `gen-demo-kb.mjs`:

| # | Title | Author | Purpose |
|---|-------|--------|---------|
| 1 | "Chip War: Fight for the World's Most Critical Technology" | Chris Miller | 2-line title (existing demo) |
| 2 | "The Pragmatic Programmer: Your Journey to Mastery, 20th Anniversary Edition" | David Thomas, Andrew Hunt | 2-line title with "..." truncation |
| 3 | "Clean Code" | Robert C. Martin | 1-line title |

Each has: cover image, 4+ pages, chapter metadata. Push to SD via serial.

Progress values: book 1 = 42% (mid), book 2 = 0% (UNREAD), book 3 = 100% (FINISHED).

## Memory Budget

| Item | RAM | Flash |
|------|-----|-------|
| Framebuffer BW | 48KB | — |
| Framebuffer GS | 48KB | — |
| Book list (32 entries) | 8KB | — |
| KB reader state | 4.5KB | — |
| Cover thumb temp buf | 2KB | — |
| Title/Author temp buf | 1KB | — |
| Stack + misc | 10KB | — |
| UI assets (2 lang) | — | 546KB |
| Code (.text) | — | ~500KB |
| **Total** | **~122KB / 380KB** | **~1MB / 6.5MB** |

## Files to Create/Modify

### New files

| File | Purpose |
|------|---------|
| `scripts/gen-asset-headers.mjs` | Convert .kp files → C arrays |
| `firmware/include/ui_assets.h` | Asset enum + struct + extern tables |
| `firmware/src/ui_assets_data.c` | Generated asset data (const arrays in DROM) |
| `firmware/src/kb_reader.c` | KB file parser + page loader |
| `firmware/src/kp_decode.c` | KP v2 decode + blit helper |
| `firmware/src/screens/home.c` | Rewrite with full layout |

### Modified files

| File | Change |
|------|--------|
| `firmware/src/ui.c` | Wire up home screen state properly |
| `firmware/src/main.c` | Boot: scan SD for books, init language from NVS |
| `firmware/platformio.ini` | Remove old dictionary embed, add ui_assets_data.c |
| `scripts/gen-demo-kb.mjs` | Add 2 more demo books |
| `package.json` | Add `gen:headers` script |

### Remove

| File | Reason |
|------|--------|
| `firmware/src/ui_assets.c` | Replaced by generated ui_assets_data.c |
| `firmware/src/dictionary_bin.S` | Old dictionary embed |
| `firmware/src/home_empty_bin.S` | Old home screen embed |
| `firmware/resources/dictionary.bin` | Replaced by C arrays |
| `firmware/resources/home_empty.bin` | No longer needed |
| `firmware/embed_dict.py` | No longer needed |
