# kread Web App — Design Spec

**Date:** 2026-03-14
**Status:** Approved

---

## 1. Overview

kread web is a static SPA (Svelte 5 + Vite) hosted on GitHub Pages. It converts EPUBs to `.kb` format, manages passes/covers, previews content on a device emulator, and pushes files to the Xteink X4 via Web Serial API. No server required.

**Key principles:**
- Offline-first: all features work without device, except push/device management
- WYSIWYG: emulator shows exact 480×800 output with 4-level grayscale
- Premium quality: Harfbuzz WASM typography, smart dithering for images
- Minimalist UI with literary aesthetic

---

## 2. Architecture

**Approach: Module + Worker**

```
src/
├── App.svelte
├── stores/                 # Global state (connection, settings, data)
├── components/             # Shared (Header, Sidebar)
├── emulator/               # Device emulator (canvas, state machine, buttons)
├── tabs/
│   ├── books/              # Books tab (Create + On Device)
│   ├── passes/             # Passes tab (Create + On Device)
│   ├── covers/             # Covers tab (Create + On Device)
│   └── firmware/           # Firmware tab
├── serial/                 # Web Serial API, KREAD protocol
└── workers/
    ├── converter.worker.js # Harfbuzz WASM + EPUB parse + render
    ├── image.worker.js     # Dithering, crop, resize
    └── decode.worker.js    # QR/barcode decode (zxing-js)
```

Heavy computation runs in Web Workers to keep UI responsive.

---

## 3. Theme — "Paper & Pixel"

- **Headings:** Serif font (Literata or similar) — literary, knowledge feel
- **UI text:** Clean sans-serif (Inter or IBM Plex Sans)
- **Palette:** Off-white background (#FAF7F2), charcoal text (#1A1A1A), warm accent
- **Cards:** Subtle shadows, paper-like
- **Aesthetic:** Notion meets Kindle — not retro, not techy

---

## 4. Layout

```
┌──────────────────────────────────────────────────────┐
│  kread                          ⚙  🔌 [Connect]     │  48px header
├────┬─────────────────────────────────────────────────┤
│    │                                                 │
│icon│   Device Emulator    │    Controls Panel        │
│tabs│   480×800 canvas     │    (changes per tab)     │
│    │   + 6 buttons        │                          │
│    │                      │                          │
│    │                      │                          │
└────┴─────────────────────────────────────────────────┘
 56px    flexible center         flexible right
```

- **Sidebar (56px):** Icon-only tabs with tooltip, active indicator
- **Emulator (center):** Canvas 480×800 CSS-scaled, 6 physical buttons below (←→↑↓ BK OK)
- **Controls (right):** Scrollable, content changes per tab and sub-view
- **Header (48px):** "kread" logo (serif) + connection status

### Keyboard shortcuts for emulator
- Arrow keys: ←→↑↓
- Enter: OK
- Escape: BACK

### Button mapping
- Portrait vs landscape mode affects button layout
- UP/DOWN and LEFT/RIGHT can share function depending on context
- Allow swap UP/DOWN when reading for ergonomics
- **Exact mapping deferred to post-MVP experience**

---

## 5. Tabs

### 5.1 Navigation

4 tabs in sidebar:
1. 📚 Books
2. 🎫 Passes
3. 🖼 Covers
4. ⚡ Firmware

Tabs 1-3 have sub-view toggle: **[Create] [On Device]**
- "On Device" disabled (🔒) when no device connected
- Push buttons disabled when no device connected

### 5.2 Books — Create

**Workflow:** Upload EPUB → select options → preview on-the-fly → convert full → push

**Controls:**
- Drop zone for EPUB upload
- Font: checkboxes (select multiple), saved fonts in dropdown + "Paste Google Fonts URL" → saved to localStorage
- Size: checkboxes (select multiple) — 12, 14, 16, 18, 20
- Orientation: checkboxes — Portrait, Landscape
- Selected options generate variant list (combinatorics)
- Radio button list to select which variant displays on emulator
- Emulator re-renders on-the-fly when switching variant (windowed: current page + neighbors)
- **[Convert]** — builds full `.kb` file(s) via Worker, progress bar
- **[Push to Device]** — sends `.kb` via KREAD protocol

### 5.3 Books — On Device

- List books on device (via `KREAD_LIST`)
- Each book: title, author, page count, file size
- [Preview] → emulator shows book, navigate with buttons
- [Delete] → `KREAD_DELETE`
- SD card free space (via `KREAD_INFO`)

### 5.4 Passes — Create

**Workflow:** Upload image with QR/barcode → decode → fill template → preview on-the-fly → add → push

**Controls:**
- Drop zone for image with QR/barcode
- Auto decode via zxing-js, show decoded data
- Template fields:
  - Label (e.g., "Boarding Pass")
  - QR/Barcode (auto from decode, 1-bit clean render)
  - Notes (up to 3 lines free text)
- Emulator previews pass card on-the-fly as fields change
- **[Add to passes.kb]** — adds to local passes collection
- **[Push to Device]** — sends passes.kb

### 5.5 Passes — On Device

- List passes on device (parse passes.kb from device)
- Each pass: label, first note line
- [Preview] → emulator shows pass card
- [Edit] → switch to Create view with data pre-filled
- [Delete] → remove from list
- **[Push changes]** — rebuild and send passes.kb

### 5.6 Covers — Create

**Workflow:** Upload image → crop/resize → select dither preset → preview on-the-fly → add → push

**Controls:**
- Drop zone for image (JPEG/PNG/WebP)
- Crop area: auto-detect smart crop + manual drag/zoom adjust
- Dither preset radio buttons:
  - Sharp B&W (threshold, 2 levels)
  - Atkinson Dither (retro Mac style)
  - Floyd-Steinberg (detailed gradients)
  - Blue Noise (highest quality, natural)
  - 4-Level Direct (uses all 4 grayscale levels)
- Emulator updates on-the-fly when changing preset or crop
- Name field
- **[Add to covers.kb]**
- **[Push to Device]**

### 5.7 Covers — On Device

- Sleep screen setting: Book cover / Random / Specific / Off
- List covers on device
- [Preview] → emulator shows full screen cover
- [Delete]
- **[Push changes]**

### 5.8 Firmware

- Current device info (firmware version, SD free space, status) — or "No device connected"
- Available versions list fetched from GitHub API (`repos/kienvtv3/kread/releases`)
- Each version: tag, date, release notes excerpt, file size, [Flash] button
- "latest" badge on newest version
- Flash via ESP Web Tools
- Emulator: full firmware UI simulation, interactive

---

## 6. Device Emulator

### Purpose
Full interactive emulator of the Xteink X4 device. Not just content preview — simulates firmware UI state machine.

### Implementation: Phase 1 (JS), Phase 2 (WASM)
- **Phase 1:** JavaScript re-implementation of firmware UI. Allows rapid iteration during design.
- **Phase 2:** When firmware stabilizes, compile core logic to WASM for single-codebase emulator.

### State Machine (JS Phase 1)

```
HOME → READER (select book)
HOME → PASSES (quick access)
HOME → SETTINGS
READER → JUMP_PAGE (long press OK)
READER → HOME (BACK)
SETTINGS → HOME (BACK)
Any → SLEEP (timeout or power)
```

### Emulator behavior per tab

| Tab | Emulator shows |
|-----|----------------|
| Books — Create | Preview pages of current variant, navigate with buttons |
| Books — On Device | Full firmware: HOME → select book → READER |
| Passes — Create | Preview pass card being created |
| Passes — On Device | Passes scroll view |
| Covers — Create | Full screen cover preview with current dither |
| Covers — On Device | Settings → Sleep screen selection |
| Firmware | Full firmware sim from boot, all interactions |

### Rendering
- Canvas 480×800, CSS scaled to fit container
- 4 grayscale levels rendered accurately (#000, #555, #AAA, #FFF)
- Text via same Harfbuzz WASM pipeline as converter
- 6 buttons: clickable + keyboard shortcuts

---

## 7. Connection & Serial

### Connection flow
1. User clicks [Connect] in header
2. Browser shows serial port picker (Web Serial API)
3. Select device → opens port @ 115200 baud
4. Send `KREAD_INFO` → verify firmware responds
5. Header updates: "Connected COM7 · kread v1.0.0"
6. "On Device" sub-views and push buttons become enabled

### Offline behavior
- All Create features work without device
- Emulator works without device
- "On Device" tabs show 🔒 disabled state
- Push buttons show 🔒 disabled state
- Convert, preview, dithering — all client-side, no device needed

### Protocol commands used
- `KREAD_INFO` → device info (fw version, SD space)
- `KREAD_LIST` → file list on SD
- `KREAD_START/END` → file transfer
- `KREAD_DELETE` → delete file
- `KREAD_EXISTS` → check file exists

---

## 8. Tech Stack

| Layer | Tech | Purpose |
|-------|------|---------|
| Framework | Svelte 5 + Vite | SPA, static build |
| Styling | CSS custom properties | "Paper & Pixel" theme |
| State | Svelte stores | Connection, data, UI state |
| Serial | Web Serial API | KREAD protocol |
| Flash | ESP Web Tools | Firmware flashing |
| EPUB parse | JSZip + DOMParser | In Worker |
| Typography | Harfbuzz WASM | In Worker |
| Page render | OffscreenCanvas | In Worker |
| Compression | lz4js | .kb builder |
| QR decode | zxing-js | In Worker |
| QR render | Canvas fillRect | 1-bit, no AA |
| Image process | Canvas API | Dithering, crop, resize in Worker |
| Persistence | localStorage | Saved fonts, settings |
| Fonts | Google Fonts API | Fetch .ttf by URL |
| Releases | GitHub REST API | Fetch firmware versions |

---

## 9. Data Flow

```
User ──→ Controls ──→ Svelte Stores ──→ Workers
              │                            │
              │                     ┌──────┴──────┐
              │                     │ converter   │
              │                     │ image       │
              │                     │ decode      │
              │                     └──────┬──────┘
              │                            │
              └────→ Emulator ←────────────┘
                        │
                        │ (on push)
                        ▼
                 Web Serial API
                        │
                        ▼
                  Device (USB)
```

---

## 10. Deferred Decisions

- Exact button mapping (portrait/landscape, UP/DOWN swap) → post-MVP
- Firmware UI i18n (EN + VI) → firmware design phase
- Emulator Phase 2 (WASM) → when firmware stabilizes
- Dark theme → future consideration
