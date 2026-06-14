# UI Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the flat state machine UI with dictionary-driven rendering, producing a visible HOME screen on the Xteink X4 device.

**Architecture:** Flat state machine with 10 states, each having enter/update/render/exit lifecycle. UI elements are pre-rendered bitmaps from an embedded dictionary binary. Dictionary entries are LZ4-compressed KP blobs accessed by enum key.

**Tech Stack:** C, ESP-IDF, PlatformIO, LZ4 decompression, SSD1677 e-ink display via x4 SDK

**Spec:** `docs/superpowers/specs/2026-03-18-ui-architecture-design.md`

**Testing:** No unit test framework on ESP32-C3. Verification = compile (`pio run`) + flash (`pio run -t upload`) + visual check on device. Each task ends with a compile check at minimum.

---

## File Structure

### New files to create

```
firmware/include/
├── ui.h                # State machine types + API
├── dict.h              # Dictionary access API
├── nav.h               # Nav bar component
├── header.h            # Header component
├── list.h              # List component
├── empty_state.h       # Empty state component
├── home.h              # HOME screen
├── blit.h              # Framebuffer blit utilities
└── (dictionary_keys.h) # Already exists

firmware/src/
├── ui.c                # State machine dispatcher
├── dict.c              # Dictionary binary parser + decompressor
├── blit.c              # Blit bitmap into framebuffer
├── main.c              # Modified: call ui_init/ui_update
├── serial.c/h          # Unchanged
├── components/
│   ├── nav.c           # Nav bar renderer
│   ├── header.c        # Header renderer
│   ├── list.c          # List renderer
│   └── empty_state.c   # Empty state renderer
└── screens/
    └── home.c          # HOME screen implementation
```

### Files to modify
- `firmware/src/main.c` — replace test code with ui_init/ui_update
- `firmware/src/CMakeLists.txt` — ensure GLOB_RECURSE picks up subdirs (already does)

### Files to backup
- `firmware/src/main.c` → `firmware/src_backup/main.c`
- `firmware/src/test_page*` → `firmware/src_backup/`

---

## Task 1: Backup Current Firmware

**Files:**
- Copy: `firmware/src/main.c` → `firmware/src_backup/main.c`
- Copy: `firmware/src/test_page*_bin.S` → `firmware/src_backup/`

- [ ] **Step 1: Create backup directory and copy files**

```bash
cd /c/Projects/kread-master/kread/firmware
mkdir -p src_backup
cp src/main.c src_backup/main.c
cp src/test_page*_bin.S src_backup/
```

- [ ] **Step 2: Verify backup**

```bash
ls -la src_backup/
```

Expected: main.c + 4 .S files present.

- [ ] **Step 3: Commit backup**

```bash
git add src_backup/
git commit -m "chore: backup test firmware before UI implementation"
```

---

## Task 2: Dictionary Access Module

The dictionary is the foundation — all UI text and icons come from it. This module parses the embedded `dictionary.bin` and provides lookup + decompression.

**Files:**
- Create: `firmware/include/dict.h`
- Create: `firmware/src/dict.c`

### Dictionary Binary Format Reference

```
Header (20 bytes):
  magic[4] = "KD\x00\x01"
  shared_count:u16, lang_count:u8, container_count:u8
  shared_index_off:u32, lang_table_off:u32, container_off:u32

Shared Index (at shared_index_off): [key_id:u16, data_off:u32, size:u16] × N
Language Table (at lang_table_off):  [lang_code:4, entry_count:u16, index_off:u32, reserved:u16] × N
Per-lang Index (at index_off):       [key_id:u16, data_off:u32, size:u16] × N
Container Specs (at container_off):  [id:u8, align:u8, x:u16, y:u16, w:u16, h:u16] × N

KP Blob (at data_off):
  magic[4] = "KP\x00\x02"
  width:u16, height:u16, bit_depth:u8, compression:u8, compressed_size:u32, flags:u8, reserved:u8
  bw_uncompressed_size:u32, bw_lz4_data[...]
  (if bit_depth==3): gray_total_size:u32, lsb_size:u32, lsb_lz4[...], msb_size:u32, msb_lz4[...]
```

- [ ] **Step 1: Create dict.h**

```c
// firmware/include/dict.h
#ifndef DICT_H
#define DICT_H

#include <stdint.h>
#include <stdbool.h>
#include "dictionary_keys.h"

// Bitmap info returned by dict lookup
typedef struct {
    uint16_t w;
    uint16_t h;
    const uint8_t *bw_data;    // decompressed 1-bit plane (0=black, 1=white)
    const uint8_t *lsb_data;   // decompressed grayscale LSB plane (NULL if bw-only)
    const uint8_t *msb_data;   // decompressed grayscale MSB plane (NULL if bw-only)
} dict_bitmap_t;

// Container spec from dictionary
typedef struct {
    uint8_t  align;   // 0=left, 1=center, 2=right
    uint16_t x, y;
    uint16_t w, h;
} dict_container_t;

// Initialize dictionary (call once at boot)
void dict_init(void);

// Look up a shared entry (digits, icons) and decompress into internal buffer.
// Returns pointer to static bitmap — valid until next dict_get_* call.
const dict_bitmap_t *dict_get_shared(enum dict_shared_key key);

// Look up a per-language entry and decompress.
// Uses current language setting (default: 0 = English).
const dict_bitmap_t *dict_get_entry(enum dict_entry_key key);

// Get container spec by ID
const dict_container_t *dict_get_container(enum dict_container id);

// Set active language (0 = English, 1 = Vietnamese)
void dict_set_language(uint8_t lang_id);

#endif
```

- [ ] **Step 2: Create dict.c**

```c
// firmware/src/dict.c
#include "dict.h"
#include "lz4.h"
#include <string.h>

// Embedded dictionary binary
extern const uint8_t _binary_dictionary_bin_start[] asm("_binary_dictionary_bin_start");

// --- Internal structures matching binary format ---

typedef struct __attribute__((packed)) {
    uint8_t  magic[4];
    uint16_t shared_count;
    uint8_t  lang_count;
    uint8_t  container_count;
    uint32_t shared_index_off;
    uint32_t lang_table_off;
    uint32_t container_off;
} dict_file_header_t;

typedef struct __attribute__((packed)) {
    uint16_t key_id;
    uint32_t data_off;
    uint16_t data_size;
} dict_index_entry_t;

typedef struct __attribute__((packed)) {
    uint8_t  lang_code[4];
    uint16_t entry_count;
    uint32_t index_off;
    uint16_t reserved;
} dict_lang_entry_t;

typedef struct __attribute__((packed)) {
    uint8_t  id;
    uint8_t  align;
    uint16_t x, y, w, h;
} dict_container_raw_t;

// KP blob header
typedef struct __attribute__((packed)) {
    uint8_t  magic[4];
    uint16_t width;
    uint16_t height;
    uint8_t  bit_depth;
    uint8_t  compression;
    uint32_t compressed_size;
    uint8_t  flags;
    uint8_t  reserved;
} kp_header_t;

// --- State ---

static const uint8_t *data;                    // pointer to dictionary binary in flash
static const dict_file_header_t *hdr;
static uint8_t current_lang = 0;

// Decompression buffer — largest dict bitmap is ~6KB decompressed
// (e.g., header text 420×50 = 2625 bytes BW, ×3 planes for grayscale)
#define DICT_DECOMP_BUF_SIZE (8 * 1024)
static uint8_t decomp_buf[DICT_DECOMP_BUF_SIZE];

// Current bitmap result (static, overwritten each call)
static dict_bitmap_t current_bmp;

// Parsed container specs (cached at init)
#define MAX_CONTAINERS 16
static dict_container_t containers[MAX_CONTAINERS];
static uint8_t container_count;

// --- Helpers ---

static inline uint16_t read_u16(const uint8_t *p) { return p[0] | (p[1] << 8); }
static inline uint32_t read_u32(const uint8_t *p) { return p[0] | (p[1] << 8) | (p[2] << 16) | (p[3] << 24); }

static const dict_index_entry_t *find_in_index(const uint8_t *index_base, uint16_t count, uint16_t key)
{
    // Entries are sequential by key_id — direct index if keys match positions
    const dict_index_entry_t *entries = (const dict_index_entry_t *)index_base;
    if (key < count) {
        // Fast path: key_id == position (generator outputs sequential keys)
        if (read_u16((const uint8_t *)&entries[key].key_id) == key) {
            return &entries[key];
        }
    }
    // Fallback: linear scan
    for (uint16_t i = 0; i < count; i++) {
        if (read_u16((const uint8_t *)&entries[i].key_id) == key) {
            return &entries[i];
        }
    }
    return NULL;
}

static bool decompress_kp(const uint8_t *blob, uint16_t blob_size)
{
    if (blob_size < sizeof(kp_header_t)) return false;

    const kp_header_t *kp = (const kp_header_t *)blob;
    current_bmp.w = read_u16((const uint8_t *)&kp->width);
    current_bmp.h = read_u16((const uint8_t *)&kp->height);
    current_bmp.lsb_data = NULL;
    current_bmp.msb_data = NULL;

    const uint8_t *payload = blob + sizeof(kp_header_t);
    uint32_t bw_uncomp_size = read_u32(payload);
    payload += 4;

    if (bw_uncomp_size > DICT_DECOMP_BUF_SIZE) return false;

    // Decompress BW plane
    int result = LZ4_decompress_safe(
        (const char *)payload, (char *)decomp_buf,
        blob_size - sizeof(kp_header_t) - 4,  // max input (conservative)
        bw_uncomp_size
    );
    if (result < 0) return false;

    current_bmp.bw_data = decomp_buf;

    // For grayscale (bit_depth == 3), decompress LSB and MSB planes
    // TODO: implement grayscale plane decompression when needed
    // For now, all UI elements are B&W

    return true;
}

// --- Public API ---

void dict_init(void)
{
    data = _binary_dictionary_bin_start;
    hdr = (const dict_file_header_t *)data;

    // Parse container specs
    uint32_t cont_off = read_u32((const uint8_t *)&hdr->container_off);
    container_count = hdr->container_count;
    if (container_count > MAX_CONTAINERS) container_count = MAX_CONTAINERS;

    for (uint8_t i = 0; i < container_count; i++) {
        const dict_container_raw_t *raw = (const dict_container_raw_t *)(data + cont_off + i * sizeof(dict_container_raw_t));
        containers[i].align = raw->align;
        containers[i].x = read_u16((const uint8_t *)&raw->x);
        containers[i].y = read_u16((const uint8_t *)&raw->y);
        containers[i].w = read_u16((const uint8_t *)&raw->w);
        containers[i].h = read_u16((const uint8_t *)&raw->h);
    }
}

const dict_bitmap_t *dict_get_shared(enum dict_shared_key key)
{
    uint32_t idx_off = read_u32((const uint8_t *)&hdr->shared_index_off);
    uint16_t count = read_u16((const uint8_t *)&hdr->shared_count);

    const dict_index_entry_t *entry = find_in_index(data + idx_off, count, key);
    if (!entry) return NULL;

    uint32_t blob_off = read_u32((const uint8_t *)&entry->data_off);
    uint16_t blob_size = read_u16((const uint8_t *)&entry->data_size);

    if (!decompress_kp(data + blob_off, blob_size)) return NULL;
    return &current_bmp;
}

const dict_bitmap_t *dict_get_entry(enum dict_entry_key key)
{
    uint32_t lang_table_off = read_u32((const uint8_t *)&hdr->lang_table_off);
    const dict_lang_entry_t *lang = (const dict_lang_entry_t *)(data + lang_table_off + current_lang * sizeof(dict_lang_entry_t));

    uint32_t idx_off = read_u32((const uint8_t *)&lang->index_off);
    uint16_t count = read_u16((const uint8_t *)&lang->entry_count);

    const dict_index_entry_t *entry = find_in_index(data + idx_off, count, key);
    if (!entry) return NULL;

    uint32_t blob_off = read_u32((const uint8_t *)&entry->data_off);
    uint16_t blob_size = read_u16((const uint8_t *)&entry->data_size);

    if (!decompress_kp(data + blob_off, blob_size)) return NULL;
    return &current_bmp;
}

const dict_container_t *dict_get_container(enum dict_container id)
{
    if (id >= container_count) return NULL;
    return &containers[id];
}

void dict_set_language(uint8_t lang_id)
{
    if (lang_id < hdr->lang_count) current_lang = lang_id;
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd /c/Projects/kread-master/kread/firmware && C:\Users\Kien\ Vu\.platformio\penv\Scripts\pio.exe run 2>&1 | tail -5
```

Note: dict.c won't be called yet but should compile clean. If there are errors about missing includes, check that `-I include` is in platformio.ini build_flags and that `lz4.h` is findable from `lib/lz4/`.

- [ ] **Step 4: Commit**

```bash
git add include/dict.h src/dict.c
git commit -m "feat: dictionary access module (parse embedded binary, LZ4 decompress)"
```

---

## Task 3: Blit Utility

Utility to copy a decompressed bitmap into a framebuffer at a given (x, y) position.

**Files:**
- Create: `firmware/include/blit.h`
- Create: `firmware/src/blit.c`

- [ ] **Step 1: Create blit.h**

```c
// firmware/include/blit.h
#ifndef BLIT_H
#define BLIT_H

#include <stdint.h>
#include <x4/display.h>

// Blit a 1-bit bitmap into framebuffer at (x, y).
// src: row-major, 1 bit/pixel, MSB first. 0=black, 1=white.
// fb: full 800×480 framebuffer (X4_DISPLAY_FB_SIZE bytes).
// x, y: top-left position in portrait coordinates (0,0 = top-left).
// w, h: bitmap dimensions in pixels.
void blit_bw(uint8_t *fb, int x, int y, const uint8_t *src, int w, int h);

// Blit with inversion (for selected list items): 0=white, 1=black.
void blit_bw_inverted(uint8_t *fb, int x, int y, const uint8_t *src, int w, int h);

// Fill a rectangle in the framebuffer.
// color: 0 = black, 1 = white.
void blit_fill_rect(uint8_t *fb, int x, int y, int w, int h, uint8_t color);

// Draw a horizontal line (1px).
void blit_hline(uint8_t *fb, int x, int y, int w, uint8_t color);

#endif
```

- [ ] **Step 2: Create blit.c**

The framebuffer is in **landscape orientation** (800 wide × 480 tall) but UI uses **portrait coordinates** (480 wide × 800 tall). The display driver handles the final rotation, so blit works in portrait coordinates mapping to the landscape buffer:

The framebuffer is landscape (800 wide × 480 tall, 100 bytes/row, 48000 bytes total).
The SSD1677 scan direction rotates it to portrait on the physical display.

Portrait coordinate mapping (derived from test firmware quadrant analysis):

```
Portrait (px, py) where px ∈ [0,479], py ∈ [0,799]
→ Landscape (row, col) = (px, 799 - py)
→ Byte index = px * 100 + (799 - py) / 8
→ Bit index  = 7 - ((799 - py) % 8)
```

Verification via quadrant mapping:
- Portrait TL (0,0) → landscape (row=0, col=799) = Q1 top-right ✓
- Portrait TR (479,0) → landscape (row=479, col=799) = Q3 bottom-right ✓
- Portrait BL (0,799) → landscape (row=0, col=0) = Q0 top-left ✓

```c
// firmware/src/blit.c
#include "blit.h"
#include <string.h>

#define FB_STRIDE 100  // 800 pixels / 8 bits = 100 bytes per row (landscape)

// Portrait (px, py) → framebuffer bit address
// Landscape: row = (479 - px), col = py
static inline void fb_set_pixel(uint8_t *fb, int px, int py, uint8_t color)
{
    if (px < 0 || px >= 480 || py < 0 || py >= 800) return;
    int row = px;
    int col = 799 - py;
    int byte_idx = row * FB_STRIDE + (col >> 3);
    int bit_idx = 7 - (col & 7);
    if (color)
        fb[byte_idx] |= (1 << bit_idx);   // white
    else
        fb[byte_idx] &= ~(1 << bit_idx);  // black
}

void blit_bw(uint8_t *fb, int x, int y, const uint8_t *src, int w, int h)
{
    int src_stride = (w + 7) >> 3;
    for (int row = 0; row < h; row++) {
        for (int col = 0; col < w; col++) {
            int src_byte = row * src_stride + (col >> 3);
            int src_bit = 7 - (col & 7);
            uint8_t pixel = (src[src_byte] >> src_bit) & 1;
            fb_set_pixel(fb, x + col, y + row, pixel);
        }
    }
}

void blit_bw_inverted(uint8_t *fb, int x, int y, const uint8_t *src, int w, int h)
{
    int src_stride = (w + 7) >> 3;
    for (int row = 0; row < h; row++) {
        for (int col = 0; col < w; col++) {
            int src_byte = row * src_stride + (col >> 3);
            int src_bit = 7 - (col & 7);
            uint8_t pixel = (src[src_byte] >> src_bit) & 1;
            fb_set_pixel(fb, x + col, y + row, !pixel);
        }
    }
}

void blit_fill_rect(uint8_t *fb, int x, int y, int w, int h, uint8_t color)
{
    // Optimize: if fills entire portrait rows, use memset on landscape columns
    // For now, pixel-by-pixel (correct first, optimize later)
    for (int row = 0; row < h; row++) {
        for (int col = 0; col < w; col++) {
            fb_set_pixel(fb, x + col, y + row, color);
        }
    }
}

void blit_hline(uint8_t *fb, int x, int y, int w, uint8_t color)
{
    for (int col = 0; col < w; col++) {
        fb_set_pixel(fb, x + col, y, color);
    }
}
```

**Note:** This pixel-by-pixel blit is correct but slow. For large fills (white background), use `memset(fb, 0xFF, FB_SIZE)` directly. The blit functions are for placing small dictionary bitmaps. Optimization can come later.

- [ ] **Step 3: Verify compile**

```bash
cd /c/Projects/kread-master/kread/firmware && C:\Users\Kien\ Vu\.platformio\penv\Scripts\pio.exe run 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add include/blit.h src/blit.c
git commit -m "feat: framebuffer blit utility (portrait-to-landscape coordinate mapping)"
```

---

## Task 4: State Machine Core

**Files:**
- Create: `firmware/include/ui.h`
- Create: `firmware/src/ui.c`

- [ ] **Step 1: Create ui.h**

```c
// firmware/include/ui.h
#ifndef UI_H
#define UI_H

#include <x4/input.h>

typedef enum {
    STATE_HOME,
    STATE_LIBRARY,
    STATE_BOOK,
    STATE_BOOK_CHAPTERS,
    STATE_GALLERY_LIST,
    STATE_GALLERY_THUMBNAIL,
    STATE_GALLERY_FULLSCREEN,
    STATE_SETTINGS,
    STATE_SETTINGS_DEVICE,
    STATE_SETTINGS_FIRMWARE,
    STATE_COUNT
} ui_state_t;

typedef struct {
    void (*enter)(void);
    ui_state_t (*update)(x4_input_event_t *evt);
    void (*render)(void);
    void (*exit)(void);
} ui_screen_t;

// Initialize UI: set initial state, render first screen
void ui_init(void);

// Process input events and dispatch to current state
void ui_update(void);

// Get current state (for debugging)
ui_state_t ui_current_state(void);

#endif
```

- [ ] **Step 2: Create ui.c**

Only HOME is implemented initially. Other states get stub functions that do nothing / stay in current state.

```c
// firmware/src/ui.c
#include "ui.h"
#include "home.h"
#include "esp_log.h"

static const char *TAG = "ui";

// --- Stub screen for unimplemented states ---

static void stub_enter(void) {}
static ui_state_t stub_update(x4_input_event_t *evt) { return STATE_HOME; }
static void stub_render(void) {}
static void stub_exit(void) {}

// --- Screen table ---

static const ui_screen_t screens[STATE_COUNT] = {
    [STATE_HOME]               = { home_enter, home_update, home_render, home_exit },
    [STATE_LIBRARY]            = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_BOOK]               = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_BOOK_CHAPTERS]      = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_GALLERY_LIST]       = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_GALLERY_THUMBNAIL]  = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_GALLERY_FULLSCREEN] = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_SETTINGS]           = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_SETTINGS_DEVICE]    = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_SETTINGS_FIRMWARE]  = { stub_enter, stub_update, stub_render, stub_exit },
};

static ui_state_t current_state;

void ui_init(void)
{
    current_state = STATE_HOME;
    ESP_LOGI(TAG, "init: entering HOME");
    screens[current_state].enter();
    screens[current_state].render();
}

void ui_update(void)
{
    x4_input_event_t evt;
    while (x4_input_next_event(&evt)) {
        ui_state_t next = screens[current_state].update(&evt);
        if (next != current_state && next < STATE_COUNT) {
            ESP_LOGI(TAG, "transition: %d -> %d", current_state, next);
            screens[current_state].exit();
            current_state = next;
            screens[current_state].enter();
            screens[current_state].render();
        }
    }
}

ui_state_t ui_current_state(void)
{
    return current_state;
}
```

- [ ] **Step 3: Verify compile** (will fail — home.h not yet created, that's expected)

Note this won't compile until Task 6 creates home.h/home.c. Move to next task.

- [ ] **Step 4: Commit**

```bash
git add include/ui.h src/ui.c
git commit -m "feat: state machine core (10 flat states, stub fallbacks)"
```

---

## Task 5: Nav Bar Component

**Files:**
- Create: `firmware/include/nav.h`
- Create: `firmware/src/components/nav.c`

- [ ] **Step 1: Create nav.h**

```c
// firmware/include/nav.h
#ifndef NAV_H
#define NAV_H

#include <stdint.h>
#include "dictionary_keys.h"

// A nav bar slot: icon + label from dictionary
typedef struct {
    enum dict_shared_key icon;   // icon key (or -1 for no icon)
    enum dict_entry_key label;   // label key (or -1 for no label)
} nav_slot_t;

// Nav bar with 4 slots: [BACK, CONFIRM, LEFT, RIGHT]
typedef struct {
    nav_slot_t slots[4];
} nav_bar_t;

// Render nav bar into framebuffer.
// Draws at y=756, h=44 (portrait coordinates).
// Draws 1px separator line at top.
void nav_render(const nav_bar_t *bar, uint8_t *fb);

#endif
```

- [ ] **Step 2: Create components directory and nav.c**

```bash
mkdir -p /c/Projects/kread-master/kread/firmware/src/components
```

```c
// firmware/src/components/nav.c
#include "nav.h"
#include "dict.h"
#include "blit.h"

// Nav bar layout (portrait coordinates)
#define NAV_Y       756
#define NAV_H       44
#define NAV_PAD_X   30
#define NAV_PAD_BOT 12
#define NAV_SEP_Y   756
#define SCREEN_W    480

void nav_render(const nav_bar_t *bar, uint8_t *fb)
{
    // Draw separator line at top of nav bar
    blit_hline(fb, 0, NAV_SEP_Y, SCREEN_W, 0);  // black line

    // 4 slots evenly distributed across width
    int slot_w = (SCREEN_W - 2 * NAV_PAD_X) / 4;
    int label_y = NAV_Y + 14;  // vertical center-ish for label

    for (int i = 0; i < 4; i++) {
        int slot_x = NAV_PAD_X + i * slot_w;
        int center_x = slot_x + slot_w / 2;

        // Render label
        if ((int)bar->slots[i].label >= 0) {
            const dict_bitmap_t *bmp = dict_get_entry(bar->slots[i].label);
            if (bmp) {
                int bx = center_x - bmp->w / 2;
                blit_bw(fb, bx, label_y, bmp->bw_data, bmp->w, bmp->h);
            }
        }
    }
}
```

**Note:** Icons (triangle markers) are in shared dict entries. For the first iteration we render labels only. Icons can be added later by blitting the shared entry above the label.

- [ ] **Step 3: Commit**

```bash
git add include/nav.h src/components/nav.c
git commit -m "feat: nav bar component (data-driven, 4 slots from dictionary)"
```

---

## Task 6: HOME Screen + Wire into main.c

**Files:**
- Create: `firmware/include/home.h`
- Create: `firmware/src/screens/home.c`
- Modify: `firmware/src/main.c`

- [ ] **Step 1: Create screens directory**

```bash
mkdir -p /c/Projects/kread-master/kread/firmware/src/screens
```

- [ ] **Step 2: Create home.h**

```c
// firmware/include/home.h
#ifndef HOME_H
#define HOME_H

#include "ui.h"

void home_enter(void);
ui_state_t home_update(x4_input_event_t *evt);
void home_render(void);
void home_exit(void);

#endif
```

- [ ] **Step 3: Create home.c**

```c
// firmware/src/screens/home.c
#include "home.h"
#include "nav.h"
#include "dict.h"
#include "blit.h"
#include <x4/display.h>
#include <x4/power.h>
#include <string.h>
#include "esp_log.h"

static const char *TAG = "home";

// Framebuffer
static uint8_t fb[X4_DISPLAY_FB_SIZE];

// Nav bar definition for HOME
static const nav_bar_t home_nav = {
    .slots = {
        { .icon = -1, .label = DICT_NAV_READ },
        { .icon = -1, .label = DICT_NAV_LIBRARY },
        { .icon = -1, .label = DICT_NAV_GALLERY },
        { .icon = -1, .label = DICT_NAV_SETTINGS },
    }
};

void home_enter(void)
{
    ESP_LOGI(TAG, "enter");
}

ui_state_t home_update(x4_input_event_t *evt)
{
    if (evt->type != X4_EVT_PRESS) return STATE_HOME;

    switch (evt->button) {
        case X4_BTN_CONFIRM:  return STATE_LIBRARY;
        case X4_BTN_LEFT:     return STATE_GALLERY_LIST;
        case X4_BTN_RIGHT:    return STATE_SETTINGS;
        // BACK → open current book (STATE_BOOK), but no book loaded yet
        case X4_BTN_POWER:    // long press handled separately
        default:              return STATE_HOME;
    }
}

void home_render(void)
{
    ESP_LOGI(TAG, "render");

    // White background
    memset(fb, 0xFF, X4_DISPLAY_FB_SIZE);

    // --- Status bar (y=0, h=30) ---
    // Battery icon at top-right
    const dict_bitmap_t *battery = dict_get_shared(DICT_ICON_BATTERY);
    if (battery) {
        blit_bw(fb, 480 - 16 - battery->w, 8, battery->bw_data, battery->w, battery->h);
    }

    // --- Cover zone (y=30, h=480) ---
    // No book loaded: show empty state
    const dict_bitmap_t *no_book = dict_get_entry(DICT_EMPTY_NO_BOOK_SELECTED);
    if (no_book) {
        // Center in cover zone
        int cx = (480 - no_book->w) / 2;
        int cy = 30 + (480 - no_book->h) / 2 - 20;  // slightly above center
        blit_bw(fb, cx, cy, no_book->bw_data, no_book->w, no_book->h);
    }

    const dict_bitmap_t *no_book_sub = dict_get_entry(DICT_EMPTY_NO_BOOK_SELECTED_SUB);
    if (no_book_sub) {
        int cx = (480 - no_book_sub->w) / 2;
        int cy = 30 + (480 - no_book_sub->h) / 2 + 20;
        blit_bw(fb, cx, cy, no_book_sub->bw_data, no_book_sub->w, no_book_sub->h);
    }

    // --- Nav bar ---
    nav_render(&home_nav, fb);

    // --- Display ---
    x4_display_render_bw(fb, X4_REFRESH_FULL);
}

void home_exit(void)
{
    ESP_LOGI(TAG, "exit");
}
```

- [ ] **Step 4: Replace main.c**

```c
// firmware/src/main.c
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

#include "serial.h"
#include "dict.h"
#include "ui.h"
#include <x4/x4.h>

static const char *TAG = "kread";

void app_main(void)
{
    ESP_LOGI(TAG, "kread v" KREAD_VERSION);

    serial_init();

    x4_config_t cfg = {
        .input = X4_INPUT_CONFIG_DEFAULT,
        .sd    = X4_SD_CONFIG_DEFAULT,
    };
    x4_init(&cfg);

    dict_init();
    ui_init();

    while (1) {
        serial_poll();
        x4_input_poll();
        ui_update();
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}
```

- [ ] **Step 5: Remove test page embeds from platformio.ini** (optional, saves flash)

In `platformio.ini`, remove the test_page embed lines since HOME doesn't use them:

```ini
board_build.embed_files =
    resources/dictionary.bin
```

Keep the test_page .S files in src_backup/ but remove from src/ to avoid linking them:

```bash
rm /c/Projects/kread-master/kread/firmware/src/test_page*_bin.S
```

- [ ] **Step 6: Build**

```bash
cd /c/Projects/kread-master/kread/firmware && C:\Users\Kien\ Vu\.platformio\penv\Scripts\pio.exe run 2>&1 | tail -20
```

Expected: BUILD SUCCESS. If errors:
- Missing include path → check `-I include` in platformio.ini
- Undefined `home_*` → check that screens/home.c is picked up by GLOB_RECURSE
- LZ4 link errors → check lib/lz4/ is auto-discovered

- [ ] **Step 7: Flash and verify**

```bash
# Kill any serial monitor first
taskkill //F //IM python.exe 2>/dev/null
cd /c/Projects/kread-master/kread/firmware && C:\Users\Kien\ Vu\.platformio\penv\Scripts\pio.exe run -t upload
```

**Expected on device:**
- White screen
- Battery icon in top-right
- "No book selected" centered in cover zone
- "Add a book via Library" below it
- Nav bar at bottom: "Read | Library | Gallery | Settings"
- Pressing CONFIRM/LEFT/RIGHT logs state transition (but shows stub white screen since those states aren't implemented)

- [ ] **Step 8: Commit**

```bash
git add include/home.h src/screens/home.c src/main.c platformio.ini
git add -u  # catch deleted test_page .S files
git commit -m "feat: HOME screen with nav bar, dictionary rendering, state machine wired"
```

---

## Verification Checklist

After all tasks:

- [ ] `src_backup/` contains original test firmware main.c + test pages
- [ ] Device shows HOME screen with:
  - Battery icon (top-right)
  - Empty state text (center)
  - Nav bar with 4 labels (bottom)
- [ ] Serial monitor shows: `kread v0.1.0`, `ui: init: entering HOME`, `home: render`
- [ ] Button presses log transitions: `ui: transition: 0 -> 1` etc.
- [ ] Build size is reasonable (< 1MB firmware)

---

## What's Next (not in this plan)

After this plan, the following can be implemented as separate plans:
1. **Library screen** — scan SD for .kb files, list component
2. **Settings screen** — list component with value toggling, NVS persistence
3. **Gallery screens** — .kp reader, thumbnail/list/fullscreen views
4. **Book reader** — kb_reader module, page decompression, chapter navigation
5. **Remaining screens** — Settings > Device, Settings > Firmware, Book > Chapters
