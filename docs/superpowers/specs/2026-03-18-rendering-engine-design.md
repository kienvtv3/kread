# Unified UI Rendering Engine Design

## Problem

Drawing logic is scattered across 5+ files, each rendering differently. Emulator draws on canvas with one set of helpers, scripts draw with another, dict-encoder has its own pipeline. Result: inconsistent visuals, bugs hard to trace, impossible to guarantee "what you see in emulator = what renders on device."

## Goal

One shared drawing engine. Emulator uses it live. Scripts use it to generate binary assets. Same function draws the same pixels everywhere.

## Architecture

```
web/src/lib/ui/          ← THE drawing engine (source of truth)
├── layout.js            ← Constants: safe margins, containers, screen dimensions
├── draw.js              ← Component drawing: battery, navBar, header, list,
│                           progressBar, triangles, truncate, wordWrap
├── screens/
│   ├── home.js          ← renderHome(ctx, data)
│   ├── library.js       ← renderLibrary(ctx, data)
│   ├── settings.js      ← renderSettings(ctx, data), renderSettingsDevice(ctx, data)
│   ├── gallery.js       ← renderGalleryList(ctx, data), renderGalleryView(ctx, data),
│   │                       renderGalleryFull(ctx, data)
│   ├── reader.js        ← renderReader(ctx, data)
│   └── book-menu.js     ← renderBookMenu(ctx, data), renderBookChapters(ctx, data)
└── index.js             ← Re-exports all screens + components

web/src/lib/eink/        ← Encoding engine (existing, unchanged)
├── quantize.js
├── encoder.js
└── index.js
```

## Screen Renderer API

Every screen renderer is a pure function: takes a canvas 2D context + a data object, draws on the context. No side effects, no state, no encoding knowledge.

```js
// Signature
export function renderHome(ctx, {
  hasBook,          // boolean
  title,            // string
  author,           // string
  progress,         // number 0-100
  coverImage,       // HTMLImageElement or null
  batteryPercent,   // number 0-100
})

// Returns nothing. Just draws on ctx.
```

Data objects are plain JS objects — the caller (emulator or script) provides the data.

## Drawing Components (draw.js)

### Static components (same in emulator + firmware assets)
- `drawNavBar(ctx, slots)` — 4 slots with triangle icons + text labels
- `drawHeader(ctx, title)` — bold title + separator line
- `drawHelpBar(ctx, hints)` — contextual hint bar at bottom
- `drawList(ctx, opts)` — generic scrollable list (single/double row, selectable/not)
- `drawEmptyState(ctx, primary, secondary)` — centered message
- `drawCoverFrame(ctx, x, y, w, h)` — double border cover frame

### Dynamic components (vẽ bằng code, mirrored in C firmware)
- `drawBattery(ctx, x, y, percent)` — battery icon with fill level
- `drawProgressBar(ctx, x, y, w, h, percent, label)` — rounded progress bar

### Icons
- `drawTriangle(ctx, x, y, size, direction, filled)` — 6 variants (left/right/up/down × filled/outline)
  - Outline triangles use outset path + round joins to match filled size
  - No unicode characters — pure canvas path drawing

## State Machine (emulator)

### Current state-machine.js → split into:

```
web/src/emulator/
├── state-machine.js     ← State transitions + button handlers only
├── state-data.js        ← State variables, demo data (library, settings items, etc.)
├── screen.js            ← 2bpp screen buffer (unchanged)
├── text.js              ← beginFrame/flushToScreen (unchanged)
├── Emulator.svelte      ← "Device" tab — new emulator using shared ui/
└── EmulatorOld.svelte   ← "Device Old" tab — current emulator preserved as reference
```

### state-machine.js restructured

Manages state data properly — selected indices, scroll positions, current book, etc. Each state has well-defined data:

```js
export function createStateMachine(screen, onChange) {
  // State data — properly managed
  const data = {
    state: 'HOME',
    batteryPercent: 85,
    // Home
    hasBook: false,
    bookTitle: '',
    bookAuthor: '',
    readProgress: 0,
    coverImage: null,
    // Library
    libraryIndex: 0,
    libraryPage: 0,
    // Settings
    settingsIndex: 0,
    // Gallery
    galleryIndex: 0,
    galleryPage: 0,
    // Reader
    currentPage: 0,
    totalPages: 0,
    // ...
  }

  function render() {
    const ctx = beginFrame()
    switch (data.state) {
      case 'HOME':
        renderHome(ctx, {
          hasBook: data.hasBook,
          title: data.bookTitle,
          author: data.bookAuthor,
          progress: data.readProgress,
          coverImage: data.coverImage,
          batteryPercent: data.batteryPercent,
        })
        break
      case 'LIBRARY':
        renderLibrary(ctx, {
          books: library,
          selectedIndex: data.libraryIndex,
          page: data.libraryPage,
          perPage: 8,
        })
        break
      // ... etc
    }
    flushToScreen(screen)
  }

  function handleButton(button) {
    // Pure state transition logic — updates data, calls render()
  }

  return { handleButton, render, data, /* ... */ }
}
```

## Consumers

### 1. Emulator ("Device" tab)

```js
// Emulator.svelte
import { createStateMachine } from './state-machine.js'
// state-machine imports renderHome etc. from '../lib/ui/'
// → same draw functions used everywhere
```

### 2. Scripts (binary asset generation)

```js
// scripts/gen-assets.mjs — thin CLI wrapper
import { createCanvas } from '@napi-rs/canvas'
import { renderHome } from '../src/lib/ui/screens/home.js'
import { canvasToKp } from '../src/lib/eink/index.js'

const canvas = createCanvas(480, 800)
renderHome(canvas.getContext('2d'), {
  hasBook: false,
  batteryPercent: 85,
})
writeFileSync('home_empty.bin', canvasToKp(canvas))
```

### 3. Mini Previewer (Library + Gallery tabs)

Simple embedded preview components — subset of emulator:

**Library tab** — `.kb` preview:
```svelte
<!-- BookPreview.svelte -->
<script>
import { renderReader } from '../lib/ui/screens/reader.js'
// Props: orientation, font, fontSize, pageData
// Renders single page on canvas, shows in preview frame
</script>
```

Accepts injected params:
- `orientation`: portrait/landscape
- `font`: font family name
- `fontSize`: pt size
- `pageData`: decompressed page content

Just draws the reader screen with provided content — no state machine, no button handling.

**Gallery tab** — `.kp` preview:
```svelte
<!-- ImagePreview.svelte -->
<script>
// Shows .kp image in device frame at actual display size
// No navigation, just preview
</script>
```

## Dynamic Elements: JS ↔ C Correspondence

Battery and progress bar are drawn by code at runtime (not pre-baked).

| Element | JS (draw.js) | C (firmware) |
|---------|-------------|-------------|
| Battery | `drawBattery(ctx, x, y, percent)` | `draw_battery(fb, x, y, percent)` |
| Progress bar | `drawProgressBar(ctx, x, y, w, h, percent, label)` | `draw_progress(fb, x, y, w, h, percent)` |

Same dimensions, same logic, different language. JS version is the reference.

## Triangle Icons — Redesign

Current problem: Unicode triangles ◀▶△▽ render inconsistently across fonts, outline triangles are smaller than filled.

Fix: draw all triangles as canvas paths with consistent sizing:

```js
export function drawTriangle(ctx, cx, cy, size, direction, filled) {
  // cx, cy = center point
  // size = visual height/width of triangle
  const half = size / 2
  ctx.beginPath()
  switch (direction) {
    case 'left':
      ctx.moveTo(cx - half, cy)
      ctx.lineTo(cx + half, cy - half)
      ctx.lineTo(cx + half, cy + half)
      break
    case 'right':
      ctx.moveTo(cx + half, cy)
      ctx.lineTo(cx - half, cy - half)
      ctx.lineTo(cx - half, cy + half)
      break
    case 'up':
      ctx.moveTo(cx, cy - half)
      ctx.lineTo(cx - half, cy + half)
      ctx.lineTo(cx + half, cy + half)
      break
    case 'down':
      ctx.moveTo(cx, cy + half)
      ctx.lineTo(cx - half, cy - half)
      ctx.lineTo(cx + half, cy - half)
      break
  }
  ctx.closePath()

  if (filled) {
    ctx.fillStyle = 'black'
    ctx.fill()
  } else {
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.stroke()
  }
}
```

Nav bar labels combine triangle + text:
```js
function drawNavSlot(ctx, x, y, w, h, triangleDir, filled, label) {
  const triSize = 10
  const gap = 6
  const triX = x + w/2 - (triSize + gap + ctx.measureText(label).width) / 2 + triSize/2
  drawTriangle(ctx, triX, y + h/2, triSize, triangleDir, filled)
  ctx.fillText(label, triX + triSize/2 + gap, y + h/2)
}
```

## Files to Delete After Migration

- `scripts/lib/dict-encoder.mjs` — drawing logic moves to `ui/draw.js`, encoding to `eink/`
- `scripts/lib/dict-icons.mjs` — absorbed into `ui/draw.js`
- `scripts/gen-home-kp.mjs` — replaced by `gen-assets.mjs` calling `renderHome()`
- `scripts/gen-screens.mjs` — replaced by `gen-assets.mjs`
- `scripts/gen-home-empty.mjs` — replaced by `gen-assets.mjs`
- `scripts/test-quantize.mjs` — temporary, already deleted

## Files to Keep

- `scripts/gen-dictionary.mjs` — still needed for dictionary binary, but imports draw functions from `ui/`
- `scripts/gen-test-pages.mjs` — test page generation
- `scripts/gen-test-kp.mjs` — test KP generation
- `scripts/push-kp.mjs` — serial push tool

## Migration Order

1. Create `ui/layout.js` + `ui/draw.js` — extract from state-machine.js
2. Create `ui/screens/*.js` — extract render functions
3. Update state-machine.js to import from `ui/`
4. Verify emulator still works identically
5. Rename current Emulator → EmulatorOld, create new Emulator using shared ui/
6. Update scripts to use `ui/` renderers + `eink/` encoder
7. Clean up old files
8. Add mini previewers to Library + Gallery tabs
