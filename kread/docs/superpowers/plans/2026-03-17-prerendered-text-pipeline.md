# Pre-rendered Text Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete pre-rendered bitmap pipeline: dictionary generator → firmware dictionary reader → firmware UI state machine → .kb book format → EPUB converter → gallery management.

**Architecture:** Web converter (Node.js) renders all text/icons as bitmaps into .kp format blobs. Dictionary binary embeds in firmware DROM (zero RAM). Firmware UI state machine reads dictionary + .kb assets to compose screens. Everything reuses the existing .kp parser.

**Tech Stack:** Node.js + canvas (rendering), LZ4 (compression), ESP-IDF C (firmware), PlatformIO (build), .kp format (bitmap container)

---

## Phase 1: Dictionary Generator + Firmware UI

### Chunk 1: Dictionary Definition Schema + Generator

#### Task 1.1: Create definitions.json schema

**Files:**
- Create: `web/resources/definitions.json`

- [ ] **Step 1: Create definitions.json with all UI elements**

```json
{
  "version": 1,
  "containers": {
    "nav_slot": { "width": 108, "height": 30, "align": "center" },
    "header": { "width": 430, "height": 40, "align": "left" },
    "list_label": { "width": 280, "height": 24, "align": "left" },
    "list_value": { "width": 150, "height": 24, "align": "right" },
    "home_title": { "width": 420, "height": 28, "align": "left" },
    "home_author": { "width": 420, "height": 20, "align": "left" },
    "home_progress": { "width": 420, "height": 18, "align": "center" },
    "reader_status": { "width": 430, "height": 16, "align": "center" },
    "gallery_title": { "width": 400, "height": 24, "align": "center" },
    "empty_primary": { "width": 430, "height": 28, "align": "left" },
    "empty_secondary": { "width": 430, "height": 20, "align": "left" },
    "digit": { "width": 16, "height": 20, "align": "left" }
  },
  "fonts": {
    "ui": { "family": "sans-serif", "size": 18 },
    "ui_bold": { "family": "sans-serif", "size": 18, "weight": "bold" },
    "header": { "family": "sans-serif", "size": 26, "weight": "bold" },
    "nav": { "family": "sans-serif", "size": 15 },
    "small": { "family": "sans-serif", "size": 14 },
    "digit": { "family": "monospace", "size": 16 }
  },
  "shared": {
    "digit_0": { "text": "0", "font": "digit", "container": "digit" },
    "digit_1": { "text": "1", "font": "digit", "container": "digit" },
    "digit_2": { "text": "2", "font": "digit", "container": "digit" },
    "digit_3": { "text": "3", "font": "digit", "container": "digit" },
    "digit_4": { "text": "4", "font": "digit", "container": "digit" },
    "digit_5": { "text": "5", "font": "digit", "container": "digit" },
    "digit_6": { "text": "6", "font": "digit", "container": "digit" },
    "digit_7": { "text": "7", "font": "digit", "container": "digit" },
    "digit_8": { "text": "8", "font": "digit", "container": "digit" },
    "digit_9": { "text": "9", "font": "digit", "container": "digit" },
    "char_dot": { "text": ".", "font": "digit", "container": "digit" },
    "char_percent": { "text": "%", "font": "digit", "container": "digit" },
    "char_space": { "text": " ", "font": "digit", "container": "digit" },
    "char_gb": { "text": "GB", "font": "digit", "container": "digit" },
    "battery": { "type": "icon", "draw": "battery", "width": 24, "height": 12 },
    "star": { "type": "icon", "draw": "star", "width": 16, "height": 16 },
    "select_bar": { "type": "icon", "draw": "select_bar", "width": 4, "height": 20 }
  },
  "entries": {
    "nav.read": { "container": "nav_slot", "font": "nav", "icon": "tri_left_filled", "en": "Read", "vi": "Đọc" },
    "nav.library": { "container": "nav_slot", "font": "nav", "icon": "tri_down_filled", "en": "Library", "vi": "Thư viện" },
    "nav.gallery": { "container": "nav_slot", "font": "nav", "icon": "tri_up_hollow", "en": "Gallery", "vi": "Bộ sưu tập" },
    "nav.settings": { "container": "nav_slot", "font": "nav", "icon": "tri_down_hollow", "en": "Settings", "vi": "Cài đặt" },

    "hint.home": { "container": "nav_slot", "font": "nav", "icon": "tri_left_filled", "en": "Home", "vi": "Trang chủ" },
    "hint.back": { "container": "nav_slot", "font": "nav", "icon": "tri_left_filled", "en": "Back", "vi": "Quay lại" },
    "hint.read": { "container": "nav_slot", "font": "nav", "icon": "tri_down_filled", "en": "Read", "vi": "Đọc" },
    "hint.list": { "container": "nav_slot", "font": "nav", "icon": "tri_down_filled", "en": "List", "vi": "Danh sách" },
    "hint.view": { "container": "nav_slot", "font": "nav", "icon": "tri_down_filled", "en": "View", "vi": "Xem" },
    "hint.enter": { "container": "nav_slot", "font": "nav", "icon": "tri_down_filled", "en": "Enter", "vi": "Vào" },
    "hint.go": { "container": "nav_slot", "font": "nav", "icon": "tri_down_filled", "en": "Go", "vi": "Đi" },
    "hint.zoom": { "container": "nav_slot", "font": "nav", "icon": "tri_up_hollow", "en": "Zoom", "vi": "Phóng to" },
    "hint.star": { "container": "nav_slot", "font": "nav", "icon": "tri_down_hollow", "en": "Star", "vi": "Đánh dấu" },
    "hint.page_lr": { "container": "nav_slot", "font": "nav", "icon": "tri_lr_hollow", "en": "Page", "vi": "Trang" },
    "hint.select_ud": { "container": "nav_slot", "font": "nav", "icon": "tri_ud_hollow", "en": "Select", "vi": "Chọn" },
    "hint.change_lr": { "container": "nav_slot", "font": "nav", "icon": "tri_lr_hollow", "en": "Change", "vi": "Đổi" },

    "hdr.library": { "container": "header", "font": "header", "en": "Library", "vi": "Thư viện" },
    "hdr.gallery": { "container": "header", "font": "header", "en": "Gallery", "vi": "Bộ sưu tập" },
    "hdr.settings": { "container": "header", "font": "header", "en": "Settings", "vi": "Cài đặt" },
    "hdr.book": { "container": "header", "font": "header", "en": "Book", "vi": "Sách" },
    "hdr.book_chapters": { "container": "header", "font": "header", "en": "Book › Chapters", "vi": "Sách › Mục lục" },
    "hdr.settings_device": { "container": "header", "font": "header", "en": "Settings › Device", "vi": "Cài đặt › Thiết bị" },

    "settings.ui_text": { "container": "list_label", "font": "ui", "en": "UI text", "vi": "Chữ giao diện" },
    "settings.ui_images": { "container": "list_label", "font": "ui", "en": "UI images", "vi": "Ảnh giao diện" },
    "settings.sleep_timeout": { "container": "list_label", "font": "ui", "en": "Sleep timeout", "vi": "Thời gian ngủ" },
    "settings.sleep_image": { "container": "list_label", "font": "ui", "en": "Sleep image", "vi": "Ảnh khi ngủ" },
    "settings.language": { "container": "list_label", "font": "ui", "en": "Language", "vi": "Ngôn ngữ" },
    "settings.device_info": { "container": "list_label", "font": "ui", "en": "Device info", "vi": "Thông tin thiết bị" },
    "settings.firmware": { "container": "list_label", "font": "ui", "en": "Firmware", "vi": "Phần mềm" },

    "val.bw": { "container": "list_value", "font": "ui", "en": "< B&W >", "vi": "< Đen trắng >" },
    "val.grayscale": { "container": "list_value", "font": "ui", "en": "< Grayscale >", "vi": "< Xám >" },
    "val.1min": { "container": "list_value", "font": "ui", "en": "< 1 min >", "vi": "< 1 phút >" },
    "val.3min": { "container": "list_value", "font": "ui", "en": "< 3 min >", "vi": "< 3 phút >" },
    "val.5min": { "container": "list_value", "font": "ui", "en": "< 5 min >", "vi": "< 5 phút >" },
    "val.10min": { "container": "list_value", "font": "ui", "en": "< 10 min >", "vi": "< 10 phút >" },
    "val.never": { "container": "list_value", "font": "ui", "en": "< Never >", "vi": "< Không >" },
    "val.starred": { "container": "list_value", "font": "ui", "en": "< Starred >", "vi": "< Đánh dấu >" },
    "val.book_cover": { "container": "list_value", "font": "ui", "en": "< Book cover >", "vi": "< Bìa sách >" },
    "val.english": { "container": "list_value", "font": "ui", "en": "< English >", "vi": "< English >" },
    "val.vietnamese": { "container": "list_value", "font": "ui", "en": "< Tiếng Việt >", "vi": "< Tiếng Việt >" },

    "book.chapters": { "container": "list_label", "font": "ui", "en": "Chapters", "vi": "Mục lục" },
    "book.orientation": { "container": "list_label", "font": "ui", "en": "Orientation", "vi": "Hướng màn hình" },
    "book.font": { "container": "list_label", "font": "ui", "en": "Font", "vi": "Phông chữ" },
    "book.fontsize": { "container": "list_label", "font": "ui", "en": "Font size", "vi": "Cỡ chữ" },
    "book.text_mode": { "container": "list_label", "font": "ui", "en": "Text mode", "vi": "Chế độ chữ" },
    "book.image_mode": { "container": "list_label", "font": "ui", "en": "Image mode", "vi": "Chế độ ảnh" },
    "book.refresh": { "container": "list_label", "font": "ui", "en": "Refresh every", "vi": "Làm mới mỗi" },
    "book.flip": { "container": "list_label", "font": "ui", "en": "Flip direction", "vi": "Hướng lật" },

    "val.portrait": { "container": "list_value", "font": "ui", "en": "< Portrait >", "vi": "< Dọc >" },
    "val.landscape": { "container": "list_value", "font": "ui", "en": "< Landscape >", "vi": "< Ngang >" },
    "val.8pt": { "container": "list_value", "font": "ui", "en": "< 8pt >", "vi": "< 8pt >" },
    "val.10pt": { "container": "list_value", "font": "ui", "en": "< 10pt >", "vi": "< 10pt >" },
    "val.11pt": { "container": "list_value", "font": "ui", "en": "< 11pt >", "vi": "< 11pt >" },
    "val.12pt": { "container": "list_value", "font": "ui", "en": "< 12pt >", "vi": "< 12pt >" },
    "val.14pt": { "container": "list_value", "font": "ui", "en": "< 14pt >", "vi": "< 14pt >" },
    "val.1page": { "container": "list_value", "font": "ui", "en": "< 1 page >", "vi": "< 1 trang >" },
    "val.5pages": { "container": "list_value", "font": "ui", "en": "< 5 pages >", "vi": "< 5 trang >" },
    "val.10pages": { "container": "list_value", "font": "ui", "en": "< 10 pages >", "vi": "< 10 trang >" },
    "val.15pages": { "container": "list_value", "font": "ui", "en": "< 15 pages >", "vi": "< 15 trang >" },
    "val.30pages": { "container": "list_value", "font": "ui", "en": "< 30 pages >", "vi": "< 30 trang >" },
    "val.down_next": { "container": "list_value", "font": "ui", "en": "< ▽ Next >", "vi": "< ▽ Tiếp >" },
    "val.up_next": { "container": "list_value", "font": "ui", "en": "< △ Next >", "vi": "< △ Tiếp >" },

    "dev.storage": { "container": "list_label", "font": "ui", "en": "Storage", "vi": "Bộ nhớ" },
    "dev.temperature": { "container": "list_label", "font": "ui", "en": "Temperature", "vi": "Nhiệt độ" },
    "dev.battery": { "container": "list_label", "font": "ui", "en": "Battery", "vi": "Pin" },
    "dev.hardware": { "container": "list_label", "font": "ui", "en": "Hardware", "vi": "Phần cứng" },
    "dev.display": { "container": "list_label", "font": "ui", "en": "Display", "vi": "Màn hình" },
    "dev.grayscale": { "container": "list_label", "font": "ui", "en": "Grayscale", "vi": "Xám" },
    "dev.val_hardware": { "container": "list_value", "font": "ui", "en": "ESP32-C3", "vi": "ESP32-C3" },
    "dev.val_display": { "container": "list_value", "font": "ui", "en": "480×800 E-Ink", "vi": "480×800 E-Ink" },
    "dev.val_grayscale": { "container": "list_value", "font": "ui", "en": "4 levels", "vi": "4 mức" },

    "empty.library": { "container": "empty_primary", "font": "ui", "en": "No books.", "vi": "Chưa có sách." },
    "empty.library_sub": { "container": "empty_secondary", "font": "ui", "en": "Connect device to add books.", "vi": "Kết nối thiết bị để thêm sách." },
    "empty.gallery": { "container": "empty_primary", "font": "ui", "en": "No images yet.", "vi": "Chưa có ảnh." },
    "empty.gallery_sub": { "container": "empty_secondary", "font": "ui", "en": "Add images via the web app.", "vi": "Thêm ảnh qua ứng dụng web." },
    "empty.book": { "container": "home_title", "font": "ui_bold", "en": "No book selected", "vi": "Chưa chọn sách" },
    "empty.book_sub": { "container": "home_author", "font": "ui", "en": "Add a book via Library", "vi": "Thêm sách qua Thư viện" },

    "progress.unread": { "container": "home_progress", "font": "small", "en": "UNREAD", "vi": "CHƯA ĐỌC" }
  },
  "progress_range": {
    "container": "home_progress",
    "font": "small",
    "template": { "en": "{n}% READ", "vi": "{n}% ĐÃ ĐỌC" },
    "range": [1, 100]
  }
}
```

This is the single source of truth. All keys, translations, containers, and fonts defined here.

- [ ] **Step 2: Commit**
```bash
git add web/resources/definitions.json
git commit -m "feat: dictionary definitions.json — all UI elements, 2 languages"
```

---

#### Task 1.2: Dictionary generator script

**Files:**
- Create: `web/scripts/gen-dictionary.mjs` — main generator
- Create: `web/scripts/lib/dict-icons.mjs` — custom icon drawing functions
- Create: `web/scripts/lib/dict-encoder.mjs` — binary format encoder
- Create: `firmware/resources/` directory

**Dependencies:** `canvas` (already installed), `lz4js` (already installed)

- [ ] **Step 1: Create icon drawing module**

`web/scripts/lib/dict-icons.mjs` — canvas path-based icon drawing. All triangles same bounding box size.

Key functions:
- `drawTriangle(ctx, x, y, size, direction, filled)` — direction: left/right/up/down
- `drawBattery(ctx, x, y, w, h)` — battery outline with tip
- `drawStar(ctx, x, y, size)` — ★ filled star
- `drawSelectBar(ctx, x, y, w, h)` — vertical selection indicator
- `drawIconForKey(ctx, iconName, x, y)` — dispatch by icon name string

- [ ] **Step 2: Create .kp blob encoder for dictionary entries**

`web/scripts/lib/dict-encoder.mjs` — renders one text element to a .kp blob.

Key functions:
- `renderEntry(text, font, containerWidth, iconName)` → `{ bwData, grayData, width, height }`
  - Creates canvas at container width
  - Draws icon (if any) using dict-icons
  - Draws text using specified font
  - Renders twice: aggressive hinting (B&W), light hinting (grayscale)
  - Returns raw pixel planes
- `encodeKpBlob(bwData, grayData, width, height, bitDepth)` → `Uint8Array`
  - Packs as .kp format with LZ4 compression
  - bit_depth=3 for text (dual-mode), bit_depth=1 for simple icons
- `lz4CompressRaw(input)` — reuse existing LZ4 raw block logic

- [ ] **Step 3: Create main dictionary generator**

`web/scripts/gen-dictionary.mjs` — reads definitions.json, renders all entries, outputs binary.

```
node web/scripts/gen-dictionary.mjs [--output firmware/resources/dictionary.bin]
```

Process:
1. Read definitions.json
2. For each shared entry: render → .kp blob
3. For each language × entry: render icon+text → .kp blob (bit_depth=3)
4. For progress_range: generate 100 entries from template
5. Assemble binary: header + container specs + language table + entries index + data blobs
6. Write dictionary.bin + dictionary_keys.h

Output files:
- `firmware/resources/dictionary.bin` — binary dictionary for firmware embedding
- `firmware/include/dictionary_keys.h` — C header with enums

- [ ] **Step 4: Generate dictionary_keys.h**

Auto-generated C header with enums for all keys and containers:
```c
// AUTO-GENERATED by gen-dictionary.mjs — do not edit
#ifndef DICTIONARY_KEYS_H
#define DICTIONARY_KEYS_H

// Shared entry keys
enum dict_shared_key {
    DICT_DIGIT_0 = 0,
    DICT_DIGIT_1,
    // ...
    DICT_BATTERY,
    DICT_STAR,
    DICT_SELECT_BAR,
    DICT_SHARED_COUNT,
};

// Per-language entry keys
enum dict_entry_key {
    DICT_NAV_READ = 0,
    DICT_NAV_LIBRARY,
    // ... all entries
    DICT_PROGRESS_UNREAD,
    DICT_PROGRESS_1,
    // ... DICT_PROGRESS_100
    DICT_ENTRY_COUNT,
};

// Container IDs
enum dict_container {
    DICT_CONTAINER_NAV_SLOT = 0,
    DICT_CONTAINER_HEADER,
    DICT_CONTAINER_LIST_LABEL,
    DICT_CONTAINER_LIST_VALUE,
    // ...
    DICT_CONTAINER_COUNT,
};

#endif
```

- [ ] **Step 5: Run generator and verify output**
```bash
cd web && node scripts/gen-dictionary.mjs
ls -la ../firmware/resources/dictionary.bin
cat ../firmware/include/dictionary_keys.h | head -30
```
Expected: dictionary.bin ~50-80KB, dictionary_keys.h with all enums.

- [ ] **Step 6: Commit**
```bash
git add web/scripts/gen-dictionary.mjs web/scripts/lib/
git add firmware/resources/dictionary.bin firmware/include/dictionary_keys.h
git commit -m "feat: dictionary generator — definitions.json → dictionary.bin + keys.h"
```

---

### Chunk 2: Firmware Dictionary Reader

#### Task 2.1: Dictionary reader module

**Files:**
- Create: `firmware/lib/x4/include/x4/dict.h`
- Create: `firmware/lib/x4/src/dict.c`
- Modify: `firmware/platformio.ini` — add embed_files
- Modify: `firmware/lib/x4/CMakeLists.txt` — add dict.c

- [ ] **Step 1: Add embed_files to platformio.ini**

```ini
board_build.embed_files =
    resources/dictionary.bin
```

- [ ] **Step 2: Create dict.h — public API**

```c
#ifndef X4_DICT_H
#define X4_DICT_H

#include <stdint.h>
#include <stdbool.h>
#include "dictionary_keys.h"

typedef struct {
    uint16_t width;
    uint16_t height;
    uint8_t  align;     // 0=left, 1=center, 2=right
    uint16_t x;         // container position
    uint16_t y;
} dict_container_t;

typedef struct {
    const uint8_t *blob;    // pointer into DROM
    uint16_t size;          // .kp blob size
} dict_entry_t;

// Initialize dictionary from DROM blob
void dict_init(const uint8_t *blob);

// Set active language ("en", "vi", etc.)
bool dict_set_language(const char *lang_code);

// Get container spec by ID
const dict_container_t *dict_get_container(uint8_t container_id);

// Get shared entry (language-independent)
dict_entry_t dict_get_shared(uint16_t key);

// Get per-language entry (active language)
dict_entry_t dict_get_entry(uint16_t key);

// Blit dictionary bitmap to framebuffer at container position
// Uses B&W or grayscale based on mode parameter
void dict_blit(uint8_t *fb, uint16_t key, bool grayscale);

// Blit at arbitrary position (for compositing)
// Returns bitmap width for advancing x in glyph compose
int dict_blit_at(uint8_t *fb, uint16_t key, int x, int y, bool grayscale);

// Blit shared entry at position
int dict_blit_shared_at(uint8_t *fb, uint16_t key, int x, int y);

// Compose string from digit glyphs (for storage size, etc.)
void dict_compose_digits(uint8_t *fb, int x, int y, const char *text);

#endif
```

- [ ] **Step 3: Create dict.c — implementation**

Core logic:
- Parse binary header at init
- Language switching = change active entries index pointer
- `dict_blit` reads .kp blob from DROM, decompress LZ4, blit to framebuffer
- All memory-mapped — zero RAM allocation for dictionary data

Key internal functions:
- `parse_header()` — validate magic "KD\x00\x01", read offsets
- `find_language()` — scan language table for code match
- `decompress_and_blit()` — LZ4 decompress .kp blob, blit B&W or grayscale plane to fb at position

- [ ] **Step 4: Build and verify firmware compiles**
```bash
cd firmware && pio run
```
Expected: compiles with dictionary.bin embedded, dict.c linked.

- [ ] **Step 5: Commit**
```bash
git add firmware/lib/x4/include/x4/dict.h firmware/lib/x4/src/dict.c
git add firmware/platformio.ini
git commit -m "feat(x4): dictionary reader — DROM-mapped, zero RAM, .kp blob blit"
```

---

#### Task 2.2: Firmware UI state machine

**Files:**
- Create: `firmware/src/ui.c` — state machine (port from web emulator)
- Modify: `firmware/src/ui.h` — full API
- Modify: `firmware/src/main.c` — use ui.c instead of direct .kp loading

- [ ] **Step 1: Define UI state machine in ui.h**

```c
#ifndef UI_H
#define UI_H

#include <x4/x4.h>

typedef enum {
    UI_HOME,
    UI_READER,
    UI_BOOK_MENU,
    UI_BOOK_CHAPTERS,
    UI_LIBRARY,
    UI_GALLERY_VIEW,
    UI_GALLERY_LIST,
    UI_GALLERY_FULL,
    UI_SETTINGS,
    UI_SETTINGS_DEVICE,
} ui_state_t;

typedef struct {
    bool ui_text_grayscale;
    bool ui_image_grayscale;
    uint8_t sleep_timeout_idx;
    uint8_t sleep_image_idx;
    uint8_t language_idx;
} ui_settings_t;

void ui_init(void);
void ui_handle_button(x4_input_button_t button);
void ui_render(void);
ui_state_t ui_get_state(void);

#endif
```

- [ ] **Step 2: Implement ui.c — core state machine**

Port logic from `web/src/emulator/state-machine.js`:
- State transitions (handleHome, handleReader, handleLibrary, etc.)
- Screen rendering using dict_blit() calls
- List rendering with selection indicator, dividers, scrollbar
- Container-based layout from dictionary specs

Key functions:
- `ui_render_home()` — battery, cover (from .kb), title, author, progress, nav bar
- `ui_render_list()` — reusable list renderer (single/double row)
- `ui_render_settings()` — settings items with values
- `ui_render_reader()` — delegates to .kb page display
- `ui_render_help_bar()` — 4-slot bottom bar from dictionary

- [ ] **Step 3: Refactor main.c to use ui.c**

```c
void app_main(void) {
    serial_init();
    x4_init(&cfg);
    dict_init(dict_start);
    dict_set_language("en");
    ui_init();

    // Initial render
    x4_display_clear(0xFF);
    x4_display_update(X4_REFRESH_FULL, false);
    ui_render();

    while (1) {
        serial_poll();
        x4_input_poll();
        x4_input_event_t evt;
        while (x4_input_next_event(&evt)) {
            if (evt.type == X4_EVT_PRESS) {
                ui_handle_button(evt.button);
            }
        }
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
```

- [ ] **Step 4: Build, flash, test on device**
```bash
pio run -t upload
```
Expected: device shows dictionary-rendered UI, buttons navigate between screens.

- [ ] **Step 5: Commit**
```bash
git add firmware/src/ui.c firmware/src/ui.h firmware/src/main.c
git commit -m "feat: firmware UI state machine — dictionary-driven, all screens"
```

---

## Phase 2: .kb Book Format + EPUB Converter (Outline)

_Detailed plan written when Phase 1 is complete._

### Task 3.1: .kb encoder (web)
- Create: `web/scripts/lib/kb-encoder.mjs`
- Implement .kb binary format per spec
- Page table, chapter offsets, asset index, metadata JSON
- Reuse .kp encoder for individual pages

### Task 3.2: EPUB → .kb converter (CLI)
- Create: `web/scripts/convert-epub.mjs`
- EPUB parsing (jszip), chapter extraction
- Canvas text rendering with Harfbuzz WASM
- Pagination: fit text to 480×800 pages
- Dual-mode rendering (B&W aggressive + grayscale AA)
- Asset generation (title, author, chapters at multiple widths)
- Cover image processing
- Output: .kb file ready for SD card

### Task 3.3: Firmware .kb reader
- Create: `firmware/src/kb_reader.c`
- Parse .kb header, page table, chapter offsets
- Load page by index → decompress → display
- Asset lookup by type + index
- Integration with UI state machine (book navigation)

### Task 3.4: Firmware book navigation
- Page turn (FAST refresh + grayscale overlay)
- Chapter jumping (from Book › Chapters menu)
- Progress tracking (save/load from SD)
- Periodic HALF refresh for ghost clearing

### Task 3.5: Web app EPUB upload + convert
- Integrate converter into BooksCreate.svelte
- Progress indicator during conversion
- Push .kb to device via serial
- Library management (list, delete)

---

## Phase 3: Gallery + Polish (Outline)

_Detailed plan written when Phase 2 is complete._

### Task 4.1: Gallery image management
- Image upload via web app
- Image format conversion (JPEG/PNG → .kp 2-bit)
- Gallery metadata file on SD
- Star/unstar management

### Task 4.2: Sleep screen
- Sleep image display (starred gallery image or book cover)
- Deep sleep entry with image retention
- Wake-up and UI restore

### Task 4.3: Web app polish
- Gallery tab: upload, preview, push to device
- Device tab: firmware info, storage management
- Settings sync between web app and device

### Task 4.4: Firmware polish
- Battery icon with real percentage
- Temperature display
- Storage calculation
- Error handling and edge cases
