# kread — Product Brief
**Phiên bản:** 0.4 · **Tháng 3/2026** · **Trạng thái:** Khởi động

---

## 1. Tổng quan

**kread** là hệ thống gồm hai phần:

1. **web** — static web app (GitHub Pages) để convert EPUB → `.kb`, preview, quản lý passes/covers, push lên thiết bị qua USB, và flash firmware — **không cần server, không cần install bất cứ thứ gì.**
2. **firmware** — custom firmware cho Xteink X4 (ESP32-C3) để đọc file `.kb` với tốc độ cao và typography đẹp.

### Vấn đề cần giải quyết

| Vấn đề | Hiện tại | kread giải quyết |
|---|---|---|
| Typography thấp | Firmware gốc / CrossPoint render on-device, giới hạn ~380 KB RAM | Pre-render Harfbuzz-quality trên browser, lưu pixel |
| Page turn chậm | ~50–200ms layout on-device | ~7ms — chỉ đọc bitmap và blast pixels |
| Không preview được | Calibre không show được | Web UI preview chính xác 480×800 trước khi push |
| Workflow phức tạp | Cần install Calibre + plugin | Mở Chrome, cắm cáp, xong |
| Passes/QR rời rạc | Không có tool | Tích hợp trong cùng web app |
| Flash firmware khó | Cần `esptool.py`, Python, terminal | Bấm Flash trên web, cắm cáp, xong |

---

## 2. Tên & File Format

| | Giá trị |
|---|---|
| **Tên project** | kread |
| **Tên firmware** | firmware |
| **Tên web app** | web |
| **Sách** | `.kb` (kread book), magic `KBOK` |
| **Passes** | `passes.kb` — QR code, barcode, membership card, vé |
| **Covers** | `covers.kb` — ảnh sleep screen tùy chỉnh |

---

## 3. Kiến trúc tổng thể

**Nguyên tắc thiết kế: không cần server cho bất cứ thứ gì.**

```
kread.github.io  (GitHub Pages, HTTPS, static)
│
├── /                Landing + Flash Firmware
│                    └── ESP Web Tools → firmware.json + *.bin
│
└── /app             Web App (Svelte + Vite)
                     ├── EPUB → parse → render → .kb     [Harfbuzz WASM, client-side]
                     ├── Preview engine (480×800 canvas)  [OffscreenCanvas + Web Worker]
                     ├── Passes Manager → passes.kb       [client-side]
                     ├── Covers Manager → covers.kb       [client-side]
                     └── Push to device                   [Web Serial API, USB-C]
```

### Không cần server cho bất cứ thứ gì

| Việc | Giải pháp | Cần server? |
|---|---|---|
| Convert EPUB → `.kb` | Harfbuzz WASM + Canvas, client-side | ❌ |
| Preview 480×800 | OffscreenCanvas trong Web Worker | ❌ |
| Passes / QR / barcode | JS client-side | ❌ |
| Covers / sleep screen | JS client-side | ❌ |
| Push file lên device | Web Serial API (USB-C) | ❌ |
| Flash firmware | ESP Web Tools (USB-C) | ❌ |
| Host toàn bộ | GitHub Pages | ❌ |

> ⚠️ **Web Serial và ESP Web Tools yêu cầu Chrome hoặc Edge.** Firefox không hỗ trợ Web Serial API.

---

## 4. web (kread-web)

### 4.1 Tech stack

| Layer | Lựa chọn | Lý do |
|---|---|---|
| Framework | **Svelte 5** + Vite | Static output, bundle nhỏ, DX tốt |
| Font shaping | **Harfbuzz WASM** | Full OpenType: GSUB ligatures, GPOS kerning, complex scripts |
| EPUB parse | `JSZip` + DOMParser | EPUB là zip chứa HTML/XML |
| Canvas render | `OffscreenCanvas` + Web Worker | Render không block UI |
| Binary build | `DataView` / `ArrayBuffer` | Build `.kb` binary trong browser |
| LZ4 compress | `lz4js` | Compress page bitmaps |
| QR decode | `zxing-js` | Decode QR/barcode từ ảnh |
| QR render | `qrcode` (JS) | Re-render QR clean, 1-bit |
| Serial | Web Serial API | Push file qua USB-C |
| Firmware flash | `esp-web-tools` | Flash `.bin` từ browser |
| Storage | IndexedDB | Lưu library, settings cục bộ |
| Host | GitHub Pages | Static, free, HTTPS |

### 4.2 Harfbuzz WASM

Harfbuzz WASM (~1.5–2 MB) cung cấp full OpenType shaping pipeline:

```
text + font
  └── Harfbuzz shape()
        ├── GSUB: ligature substitution (fi, fl, ff, ffi...)
        ├── GPOS: kerning, mark positioning
        ├── Complex scripts (Arabic, Devanagari... nếu cần sau)
        └── GlyphBuffer [{glyph_id, x_advance, x_offset, y_offset}]
              └── OffscreenCanvas: vẽ từng glyph path
```

Load một lần khi app khởi động (~300ms init), sau đó shape mỗi dòng text tốc độ bình thường.

### 4.3 Lazy rendering — Windowed

Render theo sliding window, không load cả quyển vào RAM:

```
Window: [N-2] [N-1] [N] [N+1] ... [N+7]
         giữ          current    preload
```

- Mỗi trang 480×800 2bpp ≈ 96 KB raw
- Window 10 trang ≈ ~1 MB RAM browser
- Render chạy trong **Web Worker** (OffscreenCanvas) — không block UI
- Discard trang ngoài window để giải phóng RAM

```javascript
// Khi navigate đến trang N:
renderWindow(current = N, behind = 2, ahead = 7)
discardOutside(N - 2, N + 7)
```

### 4.4 Reading Modes

Option lưu vào `.kb` header, firmware đọc và áp dụng waveform:

| Mode | Bit depth | Waveform | Page turn | Dùng khi |
|---|---|---|---|---|
| **Fast** | 2bpp | DU | ~120ms | Đọc liên tục, text thuần |
| **Balanced** *(default)* | 2bpp text / 4bpp image | DU / GC16 | ~200ms avg | Sách có hình |
| **Quality** | 4bpp | GC16 | ~450ms | Ảnh đẹp, graphic novel |

### 4.5 Các màn hình

#### `/` — Landing & Firmware
- Giới thiệu kread
- **"Flash kread-fw"** (ESP Web Tools) — detect chip, flash, progress bar
- Link download `.bin` thủ công (fallback `esptool.py`)

#### `/app` — Web App

**Library**
- Danh sách EPUB (IndexedDB)
- Status: `chưa build` / `đã build` / `đang trên thiết bị`
- Build settings per-book: font, size, margin, reading mode, orientation

**Converter Settings** (per book)
- Font: Literata / Charis SIL / Atkinson Hyperlegible / upload `.ttf`
- Size: 14 / 16 / 18pt
- Margin: compact / normal / wide
- Reading mode: Fast / Balanced / Quality
- Orientation: Portrait only / Pack cả hai (portrait + landscape trong cùng file)

**Preview**
- OffscreenCanvas 480×800
- Navigate trang, jump đến chapter
- Side-by-side compare khi thay đổi settings

**Passes**
- Thêm: paste ảnh / drag file / nhập code thủ công
- Auto decode QR/barcode (`zxing-js`)
- Re-render clean (pure 1-bit, no AA — bắt buộc cho scanner)
- Tên, label, thứ tự
- Preview 480×800
- Build + Push `passes.kb`

**Covers**
- Upload ảnh tùy chỉnh cho sleep screen
- Auto resize + grayscale → 480×800
- Đặt tên, sắp xếp
- Build + Push `covers.kb`

**Device**
- Connect (Web Serial)
- Sách trên thiết bị, firmware version, dung lượng SD
- Send / Delete
- Flash firmware shortcut

### 4.6 Web Serial Protocol

```
Host → Device:
  KREAD_START <filename> <filesize>\n
  [binary data]
  KREAD_END <crc32>\n

Device → Host:
  KREAD_READY\n
  KREAD_OK\n
  KREAD_ERROR <reason>\n
```

---

## 5. Flash Firmware — ESP Web Tools

```html
<script type="module"
  src="https://unpkg.com/esp-web-tools/dist/web/install-button.js">
</script>
<esp-web-install-button manifest="firmware.json">
  <button slot="activate">⚡ Flash kread-fw</button>
</esp-web-install-button>
```

```json
{
  "name": "kread-fw",
  "version": "1.0.0",
  "builds": [{
    "chipFamily": "ESP32-C3",
    "parts": [
      { "path": "bootloader.bin",  "offset": 0 },
      { "path": "partitions.bin",  "offset": 32768 },
      { "path": "kread-fw.bin",    "offset": 65536 }
    ]
  }]
}
```

### CI/CD

```
git tag v1.x.x → push
  └── GitHub Actions
      ├── PlatformIO build → *.bin artifacts
      ├── npm run build → kread-web dist/
      ├── Copy *.bin vào dist/
      ├── Generate firmware.json
      └── Deploy dist/ → GitHub Pages
```

---

## 6. Định dạng file `.kb`

```
HEADER (64 bytes)
  magic:           4 bytes  "KBOK"
  version:         2 bytes
  flags:           2 bytes
    bit0: has_landscape
    bit1: has_cover
    bit2: reading_mode (0=Fast, 1=Balanced, 2=Quality)
  screen_w:        2 bytes  (480)
  screen_h:        2 bytes  (800)
  total_pages:     4 bytes
  total_chapters:  2 bytes
  font_id:         1 byte   (0=Literata, 1=Charis, 2=Atkinson, 3=custom)
  font_size:       1 byte   (14 / 16 / 18)
  reserved:        42 bytes

METADATA (variable, UTF-8)
  title, author, language, isbn

COVER IMAGE
  4-bit grayscale, 240×320, LZ4-compressed

CHAPTER TABLE
  [{name: str, page_start: u32, page_end: u32}]

PAGE INDEX  (20 bytes × total_pages)
  [{
    offset:            u32
    size:              u32   compressed size
    type:              u8    TEXT=0 / IMAGE=1 / COVER=2
    char_offset_start: u32   cho orientation mapping
    diff_from_prev:    u8    0–100
    waveform_tag:      u8    GC16=0 / GL16=1 / DU=2
    reserved:          u16
  }]

PAGE DATA
  LZ4-compressed bitmap
  Fast/Balanced text:  2bpp, 480×800 = 96 KB raw  → ~20–40 KB compressed
  Quality / image:     4bpp, 480×800 = 192 KB raw → ~80–120 KB compressed

[LANDSCAPE SECTION — nếu has_landscape]
  PAGE INDEX (landscape)
  PAGE DATA  (landscape, 800×480)
```

**File size ước tính:** ~15–20 MB / sách (300 trang, Balanced mode, portrait only).

---

## 7. JS Converter Core

### 7.1 Pipeline

```
EPUB (File object)
  └── JSZip + DOMParser
        └── Block flattener → [HeadingBlock | ParagraphBlock([TextRun...]) | ImageBlock]
              └── Layout engine
                    ├── Harfbuzz WASM: shape text → GlyphBuffer
                    ├── Line breaking (greedy, justified)
                    ├── Page breaking (orphan/widow control)
                    └── Image handler (decision tree)
                          └── OffscreenCanvas renderer (Web Worker)
                                └── Waveform tagger (pixel diff)
                                      └── .kb builder (ArrayBuffer + DataView + lz4js)
```

### 7.2 Image decision tree

```
img_h <= 800 AND img_w <= 480   → center, 1 trang
img_h > 1.5 × 800               → vertical slice, 40px overlap + nav dots
img_w > 1.5 × 480               → horizontal slice
cả hai chiều lớn                → overview page + tiled detail pages
```

### 7.3 CSS được xử lý

| Hỗ trợ | Bỏ qua |
|---|---|
| `text-align`, `text-indent` | `float`, `flexbox`, `grid` |
| `font-weight`, `font-style` | `table` layout, `drop-cap` |
| `margin-top/bottom` | custom `@font-face`, `color` |

---

## 8. firmware

**Mục tiêu:** ~2,500–3,500 LOC. Không có typography logic.

### 8.1 Modules

| Module | Chức năng |
|---|---|
| `kb_reader.c` | Parse header, page index, decompress LZ4 bitmap |
| `display.c` | E-ink driver (open-x4-sdk), waveform selection |
| `ui.c` | Home, library, reader, settings menu, jump-to-page |
| `input.c` | Button handler: page turn, long-press, combos |
| `serial.c` | Nhận `.kb` qua USB Serial, KREAD protocol (~100 LOC) |
| `passes.c` | Load `passes.kb`, shortcut, sleep behavior |
| `covers.c` | Load `covers.kb`, sleep screen selection |

> ✅ **Không có WiFi stack.** Tiết kiệm RAM, giảm LOC.

### 8.2 Settings Menu (on-device)

```
Long press BACK → Settings
  ├── Font         [Literata / Charis SIL / Atkinson / ...]  *nếu multi-font packed
  ├── Font size    [14pt / 16pt / 18pt]
  ├── Orientation  [Portrait / Landscape / Auto]
  ├── Sleep screen [Book cover / Random / <tên cover> / Off]
  └── About        [firmware version, free SD space]

Navigation: UP/DOWN chọn item · OK toggle/confirm · BACK thoát
```

Thay font hoặc size → firmware reopen `.kb` với section tương ứng.

### 8.3 Jump to Page

```
Long press OK (khi đang đọc) → Jump to page dialog

  ┌─────────────────┐
  │  Go to page     │
  │   [◄]  047  [►] │
  │                 │
  │  OK: jump       │
  │  BACK: cancel   │
  └─────────────────┘

UP / DOWN:           +1 / -1
Long press UP/DOWN:  +10 / -10
OK: jump
BACK: cancel
```

### 8.4 Page turn flow

```c
on_button(NEXT):
  page = kb_get_page(++current)
  lz4_decompress(page->data, framebuffer)   // ~5ms
  epaper_refresh(framebuffer, page->waveform_tag)  // ~120–450ms
```

### 8.5 Serial receive

```c
"KREAD_START book.kb 18432000" → open SD file, reply "KREAD_READY\n"
[binary chunks]                → write to SD
"KREAD_END a3f2c1b0"          → verify CRC32
  OK  → close, reload if active, reply "KREAD_OK\n"
  ERR → delete partial,         reply "KREAD_ERROR crc_mismatch\n"
```

---

## 9. Passes Feature (`passes.kb`)

### 9.1 Tên

`passes.kb` — bao trùm QR code, barcode, membership card, loyalty card, vé. Tương đồng với Apple Wallet / Google Wallet.

### 9.2 Firmware

- Long press power → mở passes (từ bất kỳ màn hình)
- Sleep từ passes view: giữ nguyên màn hình
- `passes.kb` update qua serial → live reload, giữ trang

### 9.3 Quy tắc render (browser)

> ⚠️ **Pure 1-bit, không AA, không dither, integer scale.** Scanner không đọc được bitmap bị blur.

```javascript
// Vẽ từng module bằng fillRect — tuyệt đối không dùng drawImage scale
for (let r = 0; r < qr.modules.size; r++) {
  for (let c = 0; c < qr.modules.size; c++) {
    ctx.fillStyle = qr.modules.get(r, c) ? '#000' : '#fff';
    ctx.fillRect(c * moduleSize, r * moduleSize, moduleSize, moduleSize);
  }
}
```

---

## 10. Covers Feature (`covers.kb`)

### 10.1 Format

```
HEADER: total_covers, default_mode
COVER_INDEX: [{name: str, offset: u32, size: u32}]
COVER_DATA: 4bpp grayscale 480×800, LZ4-compressed (mỗi cover ~80–120 KB)
```

### 10.2 Sleep screen options (firmware settings)

```
Sleep screen:
  ○ Book cover    — cover của sách đang đọc (từ .kb)
  ● Random        — random từ covers.kb  ← default
  ○ <tên cover>   — chọn cụ thể từ covers.kb
  ○ Off           — màn hình tắt (tiết kiệm, tránh burn-in)
```

### 10.3 Web UI

- Upload ảnh (JPEG, PNG, WebP)
- Auto resize + grayscale + dither → 480×800
- Preview trên canvas
- Build + Push `covers.kb`

---

## 11. Hardware Notes

### Xteink X4

| Thông số | Giá trị |
|---|---|
| MCU | ESP32-C3 |
| RAM | ~380 KB usable |
| Màn hình | 4.2" E Ink, 480×800, 4-bit grayscale (16 levels) |
| Buttons | 4 physical, no touchscreen |
| USB | USB-C (charge + serial) |
| Battery | 650 mAh, ~14 ngày |
| Weight | 74g, 4.9mm thin |

### Màu sắc

| Màu | Ghi chú |
|---|---|
| Space Black | Không bug. Giá thấp hơn $5–10. Khuyến nghị nếu đọc ngoài trời. |
| Frost White | Bug UV: màn hình fade tạm thời dưới nắng. Workaround: dán sticker. |

---

## 12. Roadmap

### Phase 0 — Proof of Concept
- [ ] Harfbuzz WASM init + shape một đoạn text lên OffscreenCanvas 480×800
- [ ] Firmware: `serial.c` nhận file, lưu SD, đọc `.kb`, lật trang
- [ ] Verify: font quality, page turn speed

### Phase 1 — fw MVP
- [ ] Library screen, chapter nav, reading progress
- [ ] Waveform selection theo tag
- [ ] Settings menu (font, size, orientation)
- [ ] Jump-to-page dialog
- [ ] Portrait + landscape

### Phase 2 — web MVP
- [ ] EPUB parse + Harfbuzz shape + OffscreenCanvas render
- [ ] Windowed lazy rendering (Web Worker)
- [ ] Build `.kb` (ArrayBuffer + lz4js)
- [ ] Preview, font/size/mode picker
- [ ] Web Serial push + download fallback

### Phase 3 — Flash Firmware
- [ ] ESP Web Tools vào landing page
- [ ] GitHub Actions: PlatformIO build + deploy Pages

### Phase 4 — Passes & Covers
- [ ] Passes Manager: decode + 1-bit render + `passes.kb`
- [ ] Covers Manager: upload + grayscale + `covers.kb`
- [ ] Firmware: `passes.c`, `covers.c`, sleep screen logic

### Phase 5 — Polish
- [ ] PWA (offline support)
- [ ] Reading stats
- [ ] Error handling (EPUB malformed, ảnh lớn, SD full)
- [ ] Side-by-side preview compare

---

## 13. Open Questions

| # | Câu hỏi | Priority |
|---|---|---|
| 1 | Harfbuzz WASM build: dùng `harfbuzzjs` (pre-built) hay tự build từ source với subset nhỏ hơn? | High |
| 2 | Lazy render: discard trang ngoài window ngay hay giữ cache đến khi RAM pressure? | Medium |
| 3 | Multi-font trong `.kb`: pack nhiều font → file to hơn, hay chỉ pack 1 font + fallback sang font trên SD? | Medium |

---

## 14. Repo Structure

```
kread/
├── web/                        # Static web app (Svelte + Vite)
│   ├── src/
│   │   ├── converter/
│   │   │   ├── epub.js         # JSZip + parse HTML/XML
│   │   │   ├── layout.js       # Block flattener, line/page breaking
│   │   │   ├── renderer.js     # OffscreenCanvas, Harfbuzz shaping
│   │   │   ├── waveform.js     # Pixel diff, waveform tagging
│   │   │   └── kb.js           # .kb binary builder (ArrayBuffer + lz4js)
│   │   ├── passes/
│   │   │   ├── decode.js       # zxing-js
│   │   │   └── render.js       # QR/barcode 1-bit render
│   │   ├── covers/
│   │   │   └── process.js      # Resize + grayscale + covers.kb builder
│   │   ├── serial/
│   │   │   └── push.js         # Web Serial API, KREAD protocol
│   │   └── ui/                 # Svelte components
│   ├── public/
│   │   ├── index.html          # Landing + ESP Web Tools
│   │   └── fonts/              # Literata, Charis SIL, Atkinson
│   └── package.json
│
├── firmware/                   # ESP32-C3 firmware
│   ├── src/
│   │   ├── main.c
│   │   ├── kb_reader.c
│   │   ├── display.c
│   │   ├── ui.c
│   │   ├── input.c
│   │   ├── serial.c
│   │   ├── passes.c
│   │   └── covers.c
│   ├── platformio.ini
│   └── lib/
│       └── open-x4-sdk/        # submodule
│
├── docs/
│   ├── kb-format.md
│   └── product-brief.md        # ← file này
│
├── .github/workflows/
│   └── release.yml
│
└── README.md
```

---

*kread v0.4 · Svelte + Harfbuzz WASM + Web Serial + ESP Web Tools · Không cần server cho bất cứ thứ gì*
