# Pre-rendered Text Pipeline Design

Date: 2026-03-17

## Overview

All text in kread is pre-rendered as bitmaps. No runtime font rendering on ESP32-C3. Two storage locations:

- **Firmware dictionary (DROM)**: UI elements — nav labels, settings, headers, icons, digits. Multi-language. Memory-mapped, 0 RAM, instant access. Update = reflash firmware.
- **Book assets (.kb)**: Per-book text — title, author, chapter names. Rendered by web converter during EPUB conversion.

Both reuse **.kp format** (bit_depth=3 dual-mode) — firmware parser shared.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Dictionary storage | Firmware flash (DROM) | Memory-mapped, 0 RAM, instant. Update = firmware reflash. |
| Language extensibility | N languages, all in firmware | Each firmware build bundles all supported languages. Adding language = new firmware version. |
| Bitmap format | .kp bit_depth=3 (dual-mode) | Reuse existing parser. B&W + grayscale per element. User toggles UI text mode. |
| Icon+text composition | Pre-composed per language | "◀ Back" = single bitmap. No runtime composite for static elements. |
| Dynamic numbers | Glyph compose for unbounded values | Storage size (e.g., "28.5 GB") composed from digit bitmaps. Bounded values (1-100%) pre-rendered. |
| Book asset variants | Multiple container widths per asset | Title rendered for both home (420px, 2-line) and library (430px, 1-line). Pixel-perfect at each size. |
| Container sizing | Embedded in dictionary header | Firmware reads container specs from dictionary. Web converter and firmware share same definitions. |
| Binary embedding | PlatformIO embed_files | `resources/dictionary.bin` embedded via linker, accessed as DROM pointer. No generated .c source. |

## Dictionary File Structure

Binary file `resources/dictionary.bin`, embedded in firmware DROM via `board_build.embed_files`.

```
DICTIONARY BINARY LAYOUT:

[Header: 20 bytes]
  magic:            4 bytes   "KD\x00\x01"
  shared_count:     uint16    number of shared entries
  lang_count:       uint8     number of languages
  container_count:  uint8     number of container specs
  shared_offset:    uint32    byte offset to shared entries index
  lang_table_off:   uint32    byte offset to language table
  container_off:    uint32    byte offset to container specs

[Container Specs: container_count × 10 bytes]
  id:       uint8     container enum
  align:    uint8     0=left, 1=center, 2=right
  x:        uint16    position
  y:        uint16    position
  width:    uint16    max bitmap width
  height:   uint16    max bitmap height

[Language Table: lang_count × 12 bytes]
  lang_code:      4 bytes   "en\0\0", "vi\0\0"
  entry_count:    uint16    entries in this language
  entries_offset: uint32    byte offset to entries index
  reserved:       uint16

[Shared Entries Index: shared_count × 8 bytes]
  key_id:       uint16    enum value
  data_offset:  uint32    byte offset to .kp blob
  data_size:    uint16    .kp blob size in bytes

[Language N Entries Index: entry_count × 8 bytes]
  key_id:       uint16    enum value
  data_offset:  uint32    byte offset to .kp blob
  data_size:    uint16    .kp blob size in bytes

[Data Section: concatenated .kp blobs]
  Each entry is a complete .kp blob (16-byte header + LZ4 compressed data)
  bit_depth=3: [bw_data][gray_data] — dual-mode, firmware picks based on setting
  bit_depth=1: [bw_data] — for entries that don't need grayscale (digits, icons)
```

Firmware access:
```c
extern const uint8_t dict_start[] asm("_binary_dictionary_bin_start");
extern const uint8_t dict_end[]   asm("_binary_dictionary_bin_end");

// Zero copy, zero RAM — pointer arithmetic on DROM
```

## Element Categories

### Shared Entries (language-independent)

| Key | Content | Type |
|-----|---------|------|
| DIGIT_0..9 | "0" through "9" | Glyph for compose |
| CHAR_DOT | "." | Glyph |
| CHAR_PERCENT | "%" | Glyph |
| CHAR_DEGREE_C | "°C" | Glyph |
| CHAR_SPACE | " " | Glyph |
| CHAR_GB | "GB" | Glyph |
| CHAR_SLASH | "/" | Glyph |
| BATTERY | Battery icon outline | Icon, bit_depth=1 |
| PROGRESS_BORDER | Rounded rect outline | Icon, bit_depth=1 |
| PROGRESS_FILL | Fill segment | Icon, bit_depth=1 |
| STAR | ★ symbol | Icon, bit_depth=1 |
| SELECT_BAR | Vertical selection indicator | Icon, bit_depth=1 |

### Per-Language Entries

**Home nav bar** (4 entries): Pre-composed icon+text
- `nav.read`: "◀ Read" / "◀ Đọc"
- `nav.library`: "▼ Library" / "▼ Thư viện"
- `nav.gallery`: "△ Gallery" / "△ Bộ sưu tập"
- `nav.settings`: "▽ Settings" / "▽ Cài đặt"

**Help bar hints** (~12 entries): Pre-composed icon+text
- `hint.home`, `hint.back`, `hint.read`, `hint.list`, `hint.view`, `hint.enter`, `hint.go`, `hint.zoom`, `hint.star`, `hint.page_lr`, `hint.select_ud`, `hint.change_lr`

**Screen headers** (~6 entries):
- `hdr.library`, `hdr.gallery`, `hdr.settings`, `hdr.book`, `hdr.book_chapters`, `hdr.settings_device`

**Settings labels** (~7 entries):
- `settings.ui_text`, `settings.ui_images`, `settings.sleep_timeout`, `settings.sleep_image`, `settings.language`, `settings.device_info`, `settings.firmware`

**Settings values** (~20 entries): Pre-rendered with `< >` arrows
- `val.bw`, `val.grayscale`, `val.1min`...`val.never`, `val.starred`, `val.book_cover`, `val.english`, `val.vietnamese`, etc.

**Book menu labels** (~8 entries):
- `book.chapters`, `book.orientation`, `book.font`, `book.fontsize`, `book.text_mode`, `book.image_mode`, `book.refresh`, `book.flip`

**Book menu values** (~15 entries):
- `val.portrait`, `val.landscape`, `val.8pt`...`val.14pt`, `val.1page`...`val.30pages`, `val.down_next`, `val.up_next`

**Device info labels** (~6 entries):
- `dev.storage`, `dev.temperature`, `dev.battery`, `dev.hardware`, `dev.display`, `dev.grayscale`

**Device info static values** (~3 entries):
- `dev.val_hardware`, `dev.val_display`, `dev.val_grayscale`

**Empty states** (~4 entries):
- `empty.library`, `empty.gallery`, `empty.book`, `empty.book_sub`

**Progress labels** (100 entries):
- `progress.unread`, `progress.1`..."progress.100" — "UNREAD", "1% READ"..."100% READ"

**Total per language: ~85 unique + 100 progress = ~185 entries**

## Container System

Container specs embedded in dictionary header. Firmware reads to determine bitmap placement.

```
Container ID             Width   Height  Align   Purpose
─────────────────────────────────────────────────────────
NAV_SLOT_0..3            108     30      center  Nav bar 4 equal slots
HEADER                   430     40      left    Sub-page header text
LIST_LABEL_SINGLE        280     24      left    Settings/chapter item label
LIST_VALUE               150     24      right   Settings item value
LIST_LABEL_DOUBLE_L1     430     24      left    Library item title
LIST_LABEL_DOUBLE_L2     430     20      left    Library item author+progress
HOME_TITLE_L1            420     28      left    Home title line 1
HOME_TITLE_L2            420     28      left    Home title line 2
HOME_AUTHOR              420     20      left    Home author name
HOME_PROGRESS            420     18      center  Progress bar label
READER_STATUS            430     16      center  Chapter indicator
GALLERY_TITLE            400     24      center  Gallery view title
EMPTY_PRIMARY            430     28      left    Empty state main text
EMPTY_SECONDARY          430     20      left    Empty state sub text
```

All dimensions account for 8px safe margin. Width = available content width within safe area minus padding.

## .kb Book Assets

Per-book assets in .kb file, rendered at multiple container widths by converter:

```
Asset Type              Container Width   Max Lines   Font          bit_depth
────────────────────────────────────────────────────────────────────────────
BOOK_TITLE_HOME         420px             2           bold 22px     3 (dual)
BOOK_TITLE_LIST         430px             1 (trunc)   bold 20px     3 (dual)
BOOK_AUTHOR_HOME        420px             1           17px upper    3 (dual)
BOOK_AUTHOR_LIST        430px             1           16px          3 (dual)
CHAPTER_NAME            430px             1           18px          3 (dual)
FONT_NAME               150px             1           18px          3 (dual)
COVER_HOME              380×460 max       aspect-fit  —             2 (gray)
COVER_SLEEP             480×800           fill        —             2 (gray)
```

Asset type enum in .kb format:
```c
enum {
  ASSET_BOOK_TITLE_HOME   = 0x00,
  ASSET_BOOK_TITLE_LIST   = 0x01,
  ASSET_BOOK_AUTHOR_HOME  = 0x02,
  ASSET_BOOK_AUTHOR_LIST  = 0x03,
  ASSET_COVER_HOME        = 0x04,
  ASSET_COVER_SLEEP       = 0x05,
  ASSET_CHAPTER_NAME      = 0x06,   // index = chapter number
  ASSET_FONT_NAME         = 0x07,
};
```

## Web Converter Pipeline

### Dictionary Generator

```
Input:
  definitions.json     — keys, translations, container assignments, font specs
  fonts/               — TTF/OTF files

Process:
  for each shared entry:
    canvas render → .kp blob (bit_depth=1 for icons, bit_depth=3 for digits)

  for each language:
    for each entry:
      1. Create canvas at container width
      2. Draw custom icon (canvas path: triangles, symbols) + text (font)
      3. Render B&W version (aggressive hinting, pixel-snapped)
      4. Render grayscale version (light hinting, sub-pixel AA)
      5. Encode as .kp bit_depth=3
      6. LZ4 compress

  Assemble: header + container specs + language table + entries + data

Output:
  resources/dictionary.bin              — binary blob for firmware embedding
  firmware/include/dictionary_keys.h    — C enums for key IDs + container IDs
```

### Book Asset Generator (in EPUB converter)

```
For each book being converted:
  1. Extract title, author, chapter names from EPUB metadata
  2. For each text + container variant:
     - Canvas render at target container width/font
     - Dual-mode: B&W (aggressive hinting) + grayscale (AA)
     - Encode as .kp bit_depth=3
  3. Cover image: resize, quantize, encode as .kp bit_depth=2
  4. Pack into .kb assets section with asset index
```

## Firmware Integration

### Initialization
```c
#include "dictionary_keys.h"

extern const uint8_t dict_start[] asm("_binary_dictionary_bin_start");

static dict_t dict;

void app_init() {
    dict_init(&dict, dict_start);
    dict_set_language(&dict, "en");  // or from settings
}
```

### Rendering API
```c
// Blit dictionary element to framebuffer at container position
void dict_blit(const dict_t *dict, uint8_t *fb, uint16_t key_id, bool grayscale);

// Blit dictionary element at arbitrary position (for compose)
int dict_blit_at(const dict_t *dict, uint8_t *fb, uint16_t key_id, int x, int y, bool grayscale);
// Returns: bitmap width (for advancing x in glyph compose)

// Blit .kb book asset to framebuffer
void kb_blit_asset(const kb_t *book, uint8_t *fb, uint8_t asset_type, uint8_t index, int x, int y, bool grayscale);

// Glyph compose for dynamic strings (storage size)
void dict_compose(const dict_t *dict, uint8_t *fb, int x, int y, const char *text, bool grayscale);
// Composes digits/symbols character by character using shared glyph entries
```

### Screen Rendering Example
```c
void render_settings_screen(uint8_t *fb) {
    bool gs = settings.ui_text_mode == GRAYSCALE;

    // Header
    dict_blit(&dict, fb, DICT_HDR_SETTINGS, gs);

    // List items — label left, value right
    for (int i = 0; i < num_items; i++) {
        dict_blit_at(&dict, fb, items[i].label_key, label_x, item_y, gs);
        dict_blit_at(&dict, fb, items[i].value_key, value_x, item_y, gs);

        // Selection indicator (shared, language-independent)
        if (i == selected) {
            dict_blit_at(&dict, fb, DICT_SELECT_BAR, SAFE_X, item_y + 4, false);
        }

        // Divider (drawn by firmware, not pre-rendered)
        if (show_divider) {
            draw_hline(fb, div_x, item_y + itemH - 1, div_w);
        }
    }

    // Help bar — 4 slots
    dict_blit(&dict, fb, hint_keys[0], gs);  // slot 0
    dict_blit(&dict, fb, hint_keys[1], gs);  // slot 1
    dict_blit(&dict, fb, hint_keys[2], gs);  // slot 2
    dict_blit(&dict, fb, hint_keys[3], gs);  // slot 3
}
```

## Language Switching

```c
void handle_language_change(const char *new_lang) {
    dict_set_language(&dict, new_lang);  // switches active language index
    // Re-render current screen — all dict_blit calls now return new language bitmaps
    render_current_screen();
}
```

`dict_set_language` only changes which entries index is active. Shared entries unaffected. Zero RAM impact — just pointer offset change within DROM.

## Build Pipeline

```
1. Edit definitions.json (add text, language, container)
2. node web/scripts/gen-dictionary.mjs
   → resources/dictionary.bin
   → firmware/include/dictionary_keys.h
3. cd firmware && pio run -t upload
   → dictionary.bin embedded in DROM via embed_files
   → firmware uses dictionary_keys.h for enum access

platformio.ini:
  board_build.embed_files =
      resources/dictionary.bin
```

Adding a new language:
1. Add translations to `definitions.json` under new lang code
2. Run `gen-dictionary.mjs`
3. Rebuild + reflash
4. New language appears in Settings → Language

Changing UI layout:
1. Edit container specs in `definitions.json`
2. Re-render affected entries (tool handles automatically)
3. Rebuild + reflash

## Size Estimates

```
Component                  Entries    Avg bytes/entry    Total
─────────────────────────────────────────────────────────────
Shared (digits, icons)     15         100                ~1.5KB
English entries            185        150                ~28KB
Vietnamese entries         185        160                ~30KB
Container specs            15         10                 ~0.2KB
Index tables + header      —          —                  ~4KB
─────────────────────────────────────────────────────────────
Total (2 languages)                                      ~64KB

In 16MB flash: 64KB = 0.4% — negligible
Per additional language: ~30KB
10 languages total: ~300KB = 1.9% of flash
```

Book assets per book:
```
Title (2 variants):     ~1KB
Author (2 variants):    ~0.5KB
Chapters (20 avg):      ~5KB
Cover (2 variants):     ~30KB
Font name:              ~0.2KB
Total per book:         ~37KB
```

## What Firmware Does NOT Do

- No font rendering
- No text shaping
- No line wrapping
- No Unicode handling
- No glyph lookup tables
- No FreeType/Harfbuzz

Firmware only:
- Reads .kp blobs from DROM (dictionary) or SD (.kb)
- Blits bitmaps to framebuffer at known positions
- Composes digit glyphs for dynamic numbers (storage size only)
- Draws simple primitives (lines for dividers, rects for progress bar fill)

## Integration with Existing Formats

- Dictionary entries are .kp blobs — same parser as `kp_display_file()`
- Book assets are .kp blobs in .kb assets section — already specified
- Container system replaces hardcoded positions in firmware
- `bit_depth=3` dual-mode reused for B&W/Grayscale UI toggle
- Dividers, progress bar fill, selection indicators remain firmware-drawn (simple rects)
