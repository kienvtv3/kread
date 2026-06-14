# kread Web App — MVP Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working kread web app that can convert EPUBs, preview on device emulator, manage passes/covers, and push files to the Xteink X4 via Web Serial.

**Architecture:** Svelte 5 SPA with Module + Worker pattern. Heavy computation (EPUB rendering, image dithering, QR decode) runs in Web Workers. Device emulator is a 480×800 canvas with JS state machine. Serial communication via Web Serial API with KREAD text protocol.

**Tech Stack:** Svelte 5, Vite, Harfbuzz WASM, JSZip, lz4js, zxing-js, Web Serial API, ESP Web Tools, localStorage

**Spec:** `docs/superpowers/specs/2026-03-14-web-app-design.md`

---

## File Structure

```
web/
├── index.html
├── package.json
├── vite.config.js
├── svelte.config.js
├── src/
│   ├── main.js                       # Mount App
│   ├── App.svelte                    # Layout: sidebar + emulator + controls
│   ├── theme.css                     # "Paper & Pixel" CSS custom properties
│   │
│   ├── stores/
│   │   ├── connection.svelte.js      # Serial connection state
│   │   ├── books.svelte.js           # Book list, convert state, variants
│   │   ├── passes.svelte.js          # Pass cards collection
│   │   ├── covers.svelte.js          # Covers collection
│   │   └── fonts.svelte.js           # Saved Google Fonts URLs
│   │
│   ├── components/
│   │   ├── Header.svelte             # Logo + connection status + connect button
│   │   ├── Sidebar.svelte            # Icon tabs (Books/Passes/Covers/Firmware)
│   │   ├── SubViewToggle.svelte      # [Create] [On Device] toggle
│   │   ├── DropZone.svelte           # Reusable drag-and-drop file upload
│   │   └── ProgressBar.svelte        # Reusable progress bar
│   │
│   ├── emulator/
│   │   ├── Emulator.svelte           # Shell: canvas + buttons
│   │   ├── EmulatorCanvas.svelte     # 480×800 canvas, 4-level grayscale
│   │   ├── EmulatorButtons.svelte    # 6 buttons (←→↑↓ BK OK)
│   │   ├── screen.js                 # Screen buffer (480×800, 2bpp)
│   │   └── state-machine.js          # HOME/READER/PASSES/SETTINGS/SLEEP states
│   │
│   ├── tabs/
│   │   ├── books/
│   │   │   ├── BooksTab.svelte       # Container with sub-view toggle
│   │   │   ├── BooksCreate.svelte    # Upload + font/size/orient + variant picker
│   │   │   └── BooksDevice.svelte    # On-device book list
│   │   ├── passes/
│   │   │   ├── PassesTab.svelte
│   │   │   ├── PassesCreate.svelte   # Upload QR + template fields
│   │   │   └── PassesDevice.svelte   # On-device pass list
│   │   ├── covers/
│   │   │   ├── CoversTab.svelte
│   │   │   ├── CoversCreate.svelte   # Upload + crop + dither presets
│   │   │   └── CoversDevice.svelte   # On-device cover list + sleep settings
│   │   └── firmware/
│   │       └── FirmwareTab.svelte    # Device info + version list + flash
│   │
│   ├── serial/
│   │   └── serial.js                 # KREAD protocol (already exists)
│   │
│   └── workers/
│       ├── converter.worker.js       # EPUB parse + Harfbuzz + render pages
│       ├── image.worker.js           # Dithering algorithms + crop/resize
│       └── decode.worker.js          # QR/barcode decode (zxing-js)
│
└── public/
    └── favicon.svg
```

---

## Milestone 1: App Shell + Theme

Get the 3-column layout visible with tab switching and "Paper & Pixel" theme.

### Task 1: Install dependencies and configure Vite

**Files:**
- Modify: `web/package.json`
- Modify: `web/vite.config.js`

- [ ] **Step 1: Install dev/runtime deps**

```bash
cd kread/web
npm install
```

Verify: `node_modules/` created, no errors.

- [ ] **Step 2: Verify dev server starts**

```bash
npm run dev
```

Open `http://localhost:5173` — should see default Svelte page.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json vite.config.js
git commit -m "chore: install dependencies and verify dev server"
```

### Task 2: Theme CSS

**Files:**
- Create: `web/src/theme.css`

- [ ] **Step 1: Create theme file with CSS custom properties**

```css
/* Paper & Pixel theme */
@import url('https://fonts.googleapis.com/css2?family=Literata:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600&display=swap');

:root {
  /* Colors */
  --color-bg: #FAF7F2;
  --color-bg-card: #FFFFFF;
  --color-text: #1A1A1A;
  --color-text-secondary: #6B6B6B;
  --color-accent: #8B6914;
  --color-accent-hover: #A07A1A;
  --color-border: #E5E0D8;
  --color-disabled: #C4C0B8;
  --color-success: #2D7A3A;
  --color-error: #B83232;

  /* Sidebar */
  --sidebar-width: 56px;
  --sidebar-bg: #F0EBE3;
  --sidebar-active: var(--color-accent);

  /* Header */
  --header-height: 48px;
  --header-bg: var(--color-bg);
  --header-border: var(--color-border);

  /* Typography */
  --font-heading: 'Literata', 'Georgia', serif;
  --font-body: 'Inter', 'Helvetica Neue', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Borders */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Shadows */
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-hover: 0 2px 8px rgba(0, 0, 0, 0.12);

  /* E-ink grayscale (accurate 4-level) */
  --eink-black: #000000;
  --eink-dark: #555555;
  --eink-light: #AAAAAA;
  --eink-white: #FFFFFF;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-body);
  background: var(--color-bg);
  color: var(--color-text);
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4 {
  font-family: var(--font-heading);
  font-weight: 700;
}

button {
  font-family: var(--font-body);
  cursor: pointer;
  border: none;
  background: none;
}

input, textarea {
  font-family: var(--font-body);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-card);
  color: var(--color-text);
}

input:focus, textarea:focus {
  outline: 2px solid var(--color-accent);
  outline-offset: -1px;
}
```

- [ ] **Step 2: Import theme in main.js**

```js
// web/src/main.js
import './theme.css'
import { mount } from 'svelte'
import App from './App.svelte'

const app = mount(App, { target: document.getElementById('app') })
export default app
```

- [ ] **Step 3: Verify in browser** — background should be off-white, fonts loaded.

- [ ] **Step 4: Commit**

```bash
git add src/theme.css src/main.js
git commit -m "feat: add Paper & Pixel theme with CSS custom properties"
```

### Task 3: Header component

**Files:**
- Create: `web/src/components/Header.svelte`

- [ ] **Step 1: Create Header**

```svelte
<script>
  let { connected = false, deviceInfo = null, onConnect } = $props()
</script>

<header class="header">
  <h1 class="logo">kread</h1>
  <div class="status">
    {#if connected && deviceInfo}
      <span class="dot connected"></span>
      <span>{deviceInfo.fw} · {Math.round(deviceInfo.sd_free / 1e9)}GB free</span>
    {:else}
      <span class="dot disconnected"></span>
      <span>Disconnected</span>
    {/if}
    <button class="connect-btn" onclick={onConnect}>
      {connected ? 'Disconnect' : 'Connect'}
    </button>
  </div>
</header>

<style>
  .header {
    height: var(--header-height);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--space-lg);
    border-bottom: 1px solid var(--header-border);
    background: var(--header-bg);
  }
  .logo {
    font-family: var(--font-heading);
    font-size: 20px;
    letter-spacing: -0.5px;
  }
  .status {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 13px;
    color: var(--color-text-secondary);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
  .dot.connected { background: var(--color-success); }
  .dot.disconnected { background: var(--color-disabled); }
  .connect-btn {
    padding: var(--space-xs) var(--space-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    background: var(--color-bg-card);
    transition: border-color 0.15s;
  }
  .connect-btn:hover {
    border-color: var(--color-accent);
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Header.svelte
git commit -m "feat: add Header component with connection status"
```

### Task 4: Sidebar component

**Files:**
- Create: `web/src/components/Sidebar.svelte`

- [ ] **Step 1: Create Sidebar**

```svelte
<script>
  let { activeTab = 'books', onTabChange } = $props()

  const tabs = [
    { id: 'books', label: 'Books', icon: '📚' },
    { id: 'passes', label: 'Passes', icon: '🎫' },
    { id: 'covers', label: 'Covers', icon: '🖼' },
    { id: 'firmware', label: 'Firmware', icon: '⚡' },
  ]
</script>

<nav class="sidebar">
  {#each tabs as tab}
    <button
      class="tab-btn"
      class:active={activeTab === tab.id}
      onclick={() => onTabChange(tab.id)}
      title={tab.label}
    >
      <span class="icon">{tab.icon}</span>
    </button>
  {/each}
</nav>

<style>
  .sidebar {
    width: var(--sidebar-width);
    background: var(--sidebar-bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: var(--space-md);
    gap: var(--space-xs);
    border-right: 1px solid var(--color-border);
  }
  .tab-btn {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .tab-btn:hover {
    background: rgba(0, 0, 0, 0.06);
  }
  .tab-btn.active {
    background: var(--color-bg-card);
    box-shadow: var(--shadow-card);
  }
  .icon {
    font-size: 20px;
  }
</style>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Sidebar.svelte
git commit -m "feat: add Sidebar component with tab navigation"
```

### Task 5: App layout (3-column)

**Files:**
- Modify: `web/src/App.svelte`

- [ ] **Step 1: Build the 3-column layout**

```svelte
<script>
  import Header from './components/Header.svelte'
  import Sidebar from './components/Sidebar.svelte'

  let activeTab = $state('books')
  let connected = $state(false)
  let deviceInfo = $state(null)

  function handleConnect() {
    // TODO: implement serial connection
    console.log('Connect clicked')
  }

  function handleTabChange(tab) {
    activeTab = tab
  }
</script>

<div class="app">
  <Header {connected} {deviceInfo} onConnect={handleConnect} />
  <div class="main">
    <Sidebar {activeTab} onTabChange={handleTabChange} />
    <div class="emulator-area">
      <div class="emulator-placeholder">
        <div class="screen">480 × 800</div>
        <div class="buttons-placeholder">Buttons</div>
      </div>
    </div>
    <div class="controls-area">
      <div class="controls-placeholder">
        <h2>{activeTab}</h2>
        <p>Controls for {activeTab} tab</p>
      </div>
    </div>
  </div>
</div>

<style>
  .app {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  .emulator-area {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-lg);
    min-width: 300px;
  }
  .emulator-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
  }
  .screen {
    width: 240px;
    height: 400px;
    background: var(--eink-white);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-size: 14px;
    color: var(--color-text-secondary);
  }
  .buttons-placeholder {
    font-size: 13px;
    color: var(--color-text-secondary);
  }
  .controls-area {
    flex: 1;
    border-left: 1px solid var(--color-border);
    padding: var(--space-lg);
    overflow-y: auto;
    max-width: 480px;
    min-width: 320px;
  }
  .controls-placeholder h2 {
    text-transform: capitalize;
    margin-bottom: var(--space-md);
  }
</style>
```

- [ ] **Step 2: Verify in browser** — 3-column layout: sidebar | emulator placeholder | controls. Click tabs to switch.

- [ ] **Step 3: Commit**

```bash
git add src/App.svelte
git commit -m "feat: implement 3-column app layout with tab switching"
```

---

## Milestone 2: Device Emulator

### Task 6: Emulator screen buffer

**Files:**
- Create: `web/src/emulator/screen.js`

- [ ] **Step 1: Create screen buffer module**

```js
// 480×800 2bpp screen buffer (4 grayscale levels)
// Each pixel = 2 bits: 0=black, 1=dark, 2=light, 3=white

const WIDTH = 480
const HEIGHT = 800
const BYTES_PER_ROW = WIDTH / 4  // 2bpp: 4 pixels per byte

export function createScreen() {
  const buffer = new Uint8Array(BYTES_PER_ROW * HEIGHT)
  buffer.fill(0xFF) // all white

  return {
    width: WIDTH,
    height: HEIGHT,
    buffer,

    clear(level = 3) {
      const byte = (level << 6) | (level << 4) | (level << 2) | level
      buffer.fill(byte)
    },

    setPixel(x, y, level) {
      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return
      const byteIndex = y * BYTES_PER_ROW + Math.floor(x / 4)
      const bitOffset = (3 - (x % 4)) * 2
      buffer[byteIndex] = (buffer[byteIndex] & ~(0x03 << bitOffset)) | (level << bitOffset)
    },

    getPixel(x, y) {
      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return 3
      const byteIndex = y * BYTES_PER_ROW + Math.floor(x / 4)
      const bitOffset = (3 - (x % 4)) * 2
      return (buffer[byteIndex] >> bitOffset) & 0x03
    },

    // Draw filled rect
    fillRect(x, y, w, h, level) {
      for (let py = y; py < y + h && py < HEIGHT; py++) {
        for (let px = x; px < x + w && px < WIDTH; px++) {
          this.setPixel(px, py, level)
        }
      }
    },

    // Draw text (simple bitmap font for UI, not Harfbuzz)
    // For MVP: basic 8px monospace for menu text
    drawText(x, y, text, level = 0, size = 16) {
      // Placeholder: will be replaced by proper font rendering
      // For now, draw a rect as text placeholder
      this.fillRect(x, y, text.length * (size * 0.6), size, level)
    },

    // Render to ImageData for canvas
    toImageData() {
      const imageData = new ImageData(WIDTH, HEIGHT)
      const colors = [
        [0x00, 0x00, 0x00], // 0 = black
        [0x55, 0x55, 0x55], // 1 = dark gray
        [0xAA, 0xAA, 0xAA], // 2 = light gray
        [0xFF, 0xFF, 0xFF], // 3 = white
      ]

      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const level = this.getPixel(x, y)
          const [r, g, b] = colors[level]
          const i = (y * WIDTH + x) * 4
          imageData.data[i] = r
          imageData.data[i + 1] = g
          imageData.data[i + 2] = b
          imageData.data[i + 3] = 255
        }
      }
      return imageData
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/emulator/screen.js
git commit -m "feat: add 2bpp screen buffer for device emulator"
```

### Task 7: Emulator state machine

**Files:**
- Create: `web/src/emulator/state-machine.js`

- [ ] **Step 1: Create state machine**

```js
// Emulator state machine for firmware UI simulation

export const STATES = {
  HOME: 'HOME',
  READER: 'READER',
  PASSES: 'PASSES',
  SETTINGS: 'SETTINGS',
  JUMP_PAGE: 'JUMP_PAGE',
  SLEEP: 'SLEEP',
}

export const BUTTONS = {
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  UP: 'UP',
  DOWN: 'DOWN',
  BACK: 'BACK',
  OK: 'OK',
}

export function createStateMachine(screen) {
  let state = $state(STATES.HOME)
  let menuIndex = $state(0)
  let currentPage = $state(0)
  let totalPages = $state(0)

  // Data provided by tabs
  let pages = []        // rendered page bitmaps
  let passCards = []     // pass card bitmaps
  let coverImage = null  // cover bitmap

  function transition(newState) {
    state = newState
    render()
  }

  function handleButton(button) {
    switch (state) {
      case STATES.HOME:
        handleHome(button)
        break
      case STATES.READER:
        handleReader(button)
        break
      case STATES.PASSES:
        handlePasses(button)
        break
      case STATES.SETTINGS:
        handleSettings(button)
        break
    }
  }

  function handleHome(button) {
    if (button === BUTTONS.OK) {
      if (pages.length > 0) transition(STATES.READER)
    }
    if (button === BUTTONS.UP || button === BUTTONS.DOWN) {
      // navigate menu
      const dir = button === BUTTONS.UP ? -1 : 1
      menuIndex = Math.max(0, Math.min(menuIndex + dir, 2))
      render()
    }
  }

  function handleReader(button) {
    if (button === BUTTONS.RIGHT || button === BUTTONS.DOWN) {
      if (currentPage < totalPages - 1) {
        currentPage++
        render()
      }
    }
    if (button === BUTTONS.LEFT || button === BUTTONS.UP) {
      if (currentPage > 0) {
        currentPage--
        render()
      }
    }
    if (button === BUTTONS.BACK) {
      transition(STATES.HOME)
    }
  }

  function handlePasses(button) {
    if (button === BUTTONS.UP || button === BUTTONS.LEFT) {
      if (currentPage > 0) { currentPage--; render() }
    }
    if (button === BUTTONS.DOWN || button === BUTTONS.RIGHT) {
      if (currentPage < passCards.length - 1) { currentPage++; render() }
    }
    if (button === BUTTONS.BACK) {
      transition(STATES.HOME)
    }
  }

  function handleSettings(button) {
    if (button === BUTTONS.BACK) transition(STATES.HOME)
  }

  function render() {
    screen.clear(3) // white

    switch (state) {
      case STATES.HOME:
        renderHome()
        break
      case STATES.READER:
        renderReader()
        break
      case STATES.PASSES:
        renderPasses()
        break
      case STATES.SLEEP:
        renderSleep()
        break
      default:
        renderPlaceholder(state)
    }
  }

  function renderHome() {
    // Title bar
    screen.fillRect(0, 0, 480, 40, 0) // black bar
    // Menu items placeholder
    screen.fillRect(20, 60, 440, 2, 2)  // divider
    // "Library" text area
    screen.fillRect(20, 80, 200, 16, 0)
    // "Passes" text area
    screen.fillRect(20, 120, 160, 16, 0)
    // Selection indicator
    const itemY = 80 + menuIndex * 40
    screen.fillRect(10, itemY, 4, 16, 0)
  }

  function renderReader() {
    if (pages.length > 0 && pages[currentPage]) {
      // Copy page bitmap to screen
      const pageData = pages[currentPage]
      screen.buffer.set(pageData)
    } else {
      // Placeholder
      screen.fillRect(20, 20, 440, 16, 0) // "Page N" placeholder
    }
  }

  function renderPasses() {
    if (passCards.length > 0 && passCards[currentPage]) {
      screen.buffer.set(passCards[currentPage])
    } else {
      renderPlaceholder('No passes')
    }
  }

  function renderSleep() {
    if (coverImage) {
      screen.buffer.set(coverImage)
    } else {
      screen.clear(0) // black screen
    }
  }

  function renderPlaceholder(label) {
    screen.fillRect(160, 380, 160, 20, 1) // gray text placeholder
  }

  // Public API
  return {
    get state() { return state },
    get currentPage() { return currentPage },
    get totalPages() { return totalPages },
    get menuIndex() { return menuIndex },

    handleButton,
    render,
    transition,

    // Set content from tabs
    setPages(pageBuffers) {
      pages = pageBuffers
      totalPages = pageBuffers.length
      currentPage = 0
    },
    setPassCards(cards) {
      passCards = cards
      currentPage = 0
    },
    setCoverImage(img) {
      coverImage = img
    },

    // Direct screen access for tab-driven preview
    setScreenBuffer(buffer) {
      screen.buffer.set(buffer)
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/emulator/state-machine.js
git commit -m "feat: add emulator state machine with HOME/READER/PASSES states"
```

### Task 8: Emulator Svelte components

**Files:**
- Create: `web/src/emulator/EmulatorCanvas.svelte`
- Create: `web/src/emulator/EmulatorButtons.svelte`
- Create: `web/src/emulator/Emulator.svelte`

- [ ] **Step 1: Create EmulatorCanvas**

```svelte
<!-- web/src/emulator/EmulatorCanvas.svelte -->
<script>
  import { onMount } from 'svelte'

  let { screen } = $props()
  let canvas
  let ctx

  onMount(() => {
    ctx = canvas.getContext('2d')
    renderFrame()
  })

  export function renderFrame() {
    if (!ctx || !screen) return
    const imageData = screen.toImageData()
    ctx.putImageData(imageData, 0, 0)
  }

  // Re-render when screen changes
  $effect(() => {
    if (screen && ctx) {
      renderFrame()
    }
  })
</script>

<canvas
  bind:this={canvas}
  width={480}
  height={800}
  class="emulator-screen"
></canvas>

<style>
  .emulator-screen {
    width: 240px;
    height: 400px;
    border: 2px solid #2A2A2A;
    border-radius: var(--radius-md);
    image-rendering: pixelated;
    background: var(--eink-white);
  }
</style>
```

- [ ] **Step 2: Create EmulatorButtons**

```svelte
<!-- web/src/emulator/EmulatorButtons.svelte -->
<script>
  import { BUTTONS } from './state-machine.js'

  let { onButton } = $props()

  const layout = [
    [BUTTONS.LEFT, BUTTONS.RIGHT, null, BUTTONS.BACK, BUTTONS.OK],
    [BUTTONS.UP, BUTTONS.DOWN],
  ]

  const labels = {
    [BUTTONS.LEFT]: '←',
    [BUTTONS.RIGHT]: '→',
    [BUTTONS.UP]: '↑',
    [BUTTONS.DOWN]: '↓',
    [BUTTONS.BACK]: 'BK',
    [BUTTONS.OK]: 'OK',
  }

  // Keyboard shortcuts
  function handleKeydown(e) {
    const keyMap = {
      ArrowLeft: BUTTONS.LEFT,
      ArrowRight: BUTTONS.RIGHT,
      ArrowUp: BUTTONS.UP,
      ArrowDown: BUTTONS.DOWN,
      Escape: BUTTONS.BACK,
      Enter: BUTTONS.OK,
    }
    const button = keyMap[e.key]
    if (button) {
      e.preventDefault()
      onButton(button)
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="buttons">
  <div class="button-row">
    <button class="emu-btn" onclick={() => onButton(BUTTONS.LEFT)}>{labels[BUTTONS.LEFT]}</button>
    <button class="emu-btn" onclick={() => onButton(BUTTONS.RIGHT)}>{labels[BUTTONS.RIGHT]}</button>
    <div class="spacer"></div>
    <button class="emu-btn" onclick={() => onButton(BUTTONS.BACK)}>{labels[BUTTONS.BACK]}</button>
    <button class="emu-btn" onclick={() => onButton(BUTTONS.OK)}>{labels[BUTTONS.OK]}</button>
  </div>
  <div class="button-row">
    <button class="emu-btn" onclick={() => onButton(BUTTONS.UP)}>{labels[BUTTONS.UP]}</button>
    <button class="emu-btn" onclick={() => onButton(BUTTONS.DOWN)}>{labels[BUTTONS.DOWN]}</button>
  </div>
</div>

<style>
  .buttons {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .button-row {
    display: flex;
    gap: var(--space-xs);
    justify-content: center;
    align-items: center;
  }
  .spacer {
    width: var(--space-lg);
  }
  .emu-btn {
    width: 36px;
    height: 36px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-bg-card);
    font-size: 14px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s;
  }
  .emu-btn:hover {
    background: var(--sidebar-bg);
  }
  .emu-btn:active {
    background: var(--color-border);
  }
</style>
```

- [ ] **Step 3: Create Emulator shell**

```svelte
<!-- web/src/emulator/Emulator.svelte -->
<script>
  import { onMount } from 'svelte'
  import EmulatorCanvas from './EmulatorCanvas.svelte'
  import EmulatorButtons from './EmulatorButtons.svelte'
  import { createScreen } from './screen.js'
  import { createStateMachine } from './state-machine.js'

  let screen = createScreen()
  let machine = createStateMachine(screen)
  let canvasRef

  function handleButton(button) {
    machine.handleButton(button)
    // trigger re-render
    canvasRef?.renderFrame()
  }

  onMount(() => {
    machine.render()
    canvasRef?.renderFrame()
  })
</script>

<div class="emulator">
  <EmulatorCanvas bind:this={canvasRef} {screen} />
  <EmulatorButtons onButton={handleButton} />
  <div class="state-label">{machine.state}</div>
</div>

<style>
  .emulator {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
  }
  .state-label {
    font-size: 11px;
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
  }
</style>
```

- [ ] **Step 4: Wire Emulator into App.svelte**

Replace the emulator placeholder in `App.svelte` with:

```svelte
<script>
  import Emulator from './emulator/Emulator.svelte'
  // ... existing imports
</script>

<!-- Replace emulator-placeholder div with: -->
<div class="emulator-area">
  <Emulator />
</div>
```

- [ ] **Step 5: Verify in browser** — should see 480×800 canvas (scaled to 240×400) with 6 clickable buttons. Arrow keys and Enter/Escape work. State label shows "HOME".

- [ ] **Step 6: Commit**

```bash
git add src/emulator/
git commit -m "feat: add interactive device emulator with canvas and button controls"
```

---

## Milestone 3: Serial Connection

### Task 9: Connection store

**Files:**
- Create: `web/src/stores/connection.svelte.js`

- [ ] **Step 1: Create connection store**

```js
// Reactive connection state
import { serial } from '../serial/serial.js'

export function createConnectionStore() {
  let connected = $state(false)
  let deviceInfo = $state(null)
  let error = $state(null)

  async function connect() {
    try {
      error = null
      await serial.connect()
      const info = await serial.sendCommand('KREAD_INFO')
      if (info.error) {
        throw new Error(info.error)
      }
      deviceInfo = info
      connected = true
    } catch (e) {
      error = e.message
      connected = false
      deviceInfo = null
    }
  }

  async function disconnect() {
    try {
      await serial.disconnect()
    } finally {
      connected = false
      deviceInfo = null
    }
  }

  async function listFiles() {
    if (!connected) return { files: [], free: 0 }
    const result = await serial.sendCommand('KREAD_LIST')
    return result
  }

  async function deleteFile(filename) {
    if (!connected) return false
    const result = await serial.sendCommand(`KREAD_DELETE ${filename}`)
    return result.ok
  }

  async function pushFile(filename, data, onProgress) {
    if (!connected) throw new Error('Not connected')
    return serial.sendFile(filename, data, onProgress)
  }

  return {
    get connected() { return connected },
    get deviceInfo() { return deviceInfo },
    get error() { return error },
    connect,
    disconnect,
    listFiles,
    deleteFile,
    pushFile,
  }
}

export const connection = createConnectionStore()
```

- [ ] **Step 2: Wire into Header via App.svelte**

Update `App.svelte` to use connection store:

```svelte
<script>
  import { connection } from './stores/connection.svelte.js'
  // ...
</script>

<Header
  connected={connection.connected}
  deviceInfo={connection.deviceInfo}
  onConnect={() => connection.connected ? connection.disconnect() : connection.connect()}
/>
```

- [ ] **Step 3: Verify** — click Connect → browser shows serial port picker. If device connected, header updates.

- [ ] **Step 4: Commit**

```bash
git add src/stores/connection.svelte.js src/App.svelte
git commit -m "feat: add serial connection store and wire to header"
```

---

## Milestone 4: Books Tab (Core Feature)

### Task 10: Shared components

**Files:**
- Create: `web/src/components/SubViewToggle.svelte`
- Create: `web/src/components/DropZone.svelte`
- Create: `web/src/components/ProgressBar.svelte`

- [ ] **Step 1: Create SubViewToggle**

```svelte
<script>
  let { active = 'create', disabled = false, onToggle } = $props()
</script>

<div class="toggle">
  <button
    class="toggle-btn"
    class:active={active === 'create'}
    onclick={() => onToggle('create')}
  >Create</button>
  <button
    class="toggle-btn"
    class:active={active === 'device'}
    class:disabled
    onclick={() => !disabled && onToggle('device')}
    {disabled}
  >
    On Device {disabled ? '🔒' : ''}
  </button>
</div>

<style>
  .toggle {
    display: flex;
    gap: 2px;
    background: var(--sidebar-bg);
    border-radius: var(--radius-md);
    padding: 2px;
    margin-bottom: var(--space-lg);
  }
  .toggle-btn {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-secondary);
    transition: all 0.15s;
  }
  .toggle-btn.active {
    background: var(--color-bg-card);
    color: var(--color-text);
    box-shadow: var(--shadow-card);
  }
  .toggle-btn.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

- [ ] **Step 2: Create DropZone**

```svelte
<script>
  let { accept = '*', label = 'Drop file here', onFile } = $props()
  let dragging = $state(false)
  let inputEl

  function handleDrop(e) {
    e.preventDefault()
    dragging = false
    const file = e.dataTransfer?.files[0]
    if (file) onFile(file)
  }

  function handleInput(e) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
  }
</script>

<div
  class="dropzone"
  class:dragging
  ondragover|preventDefault={() => dragging = true}
  ondragleave={() => dragging = false}
  ondrop={handleDrop}
  onclick={() => inputEl.click()}
  role="button"
  tabindex="0"
>
  <p>{label}</p>
  <p class="hint">or click to browse</p>
  <input
    bind:this={inputEl}
    type="file"
    {accept}
    onchange={handleInput}
    hidden
  />
</div>

<style>
  .dropzone {
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--space-xl);
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .dropzone:hover, .dropzone.dragging {
    border-color: var(--color-accent);
    background: rgba(139, 105, 20, 0.04);
  }
  .hint {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin-top: var(--space-xs);
  }
</style>
```

- [ ] **Step 3: Create ProgressBar**

```svelte
<script>
  let { progress = 0, label = '' } = $props()
</script>

<div class="progress-container">
  <div class="progress-bar">
    <div class="progress-fill" style="width: {progress}%"></div>
  </div>
  {#if label}
    <span class="progress-label">{label}</span>
  {/if}
</div>

<style>
  .progress-container {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .progress-bar {
    flex: 1;
    height: 6px;
    background: var(--sidebar-bg);
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--color-accent);
    border-radius: 3px;
    transition: width 0.2s;
  }
  .progress-label {
    font-size: 12px;
    color: var(--color-text-secondary);
    min-width: 40px;
    text-align: right;
  }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/SubViewToggle.svelte src/components/DropZone.svelte src/components/ProgressBar.svelte
git commit -m "feat: add shared UI components (SubViewToggle, DropZone, ProgressBar)"
```

### Task 11: Books tab UI

**Files:**
- Create: `web/src/tabs/books/BooksTab.svelte`
- Create: `web/src/tabs/books/BooksCreate.svelte`
- Create: `web/src/tabs/books/BooksDevice.svelte`
- Create: `web/src/stores/books.svelte.js`
- Create: `web/src/stores/fonts.svelte.js`

- [ ] **Step 1: Create fonts store**

```js
// web/src/stores/fonts.svelte.js
const STORAGE_KEY = 'kread-saved-fonts'

const DEFAULT_FONTS = [
  { name: 'Literata', url: 'https://fonts.googleapis.com/css2?family=Literata&display=swap' },
  { name: 'Lora', url: 'https://fonts.googleapis.com/css2?family=Lora&display=swap' },
  { name: 'Merriweather', url: 'https://fonts.googleapis.com/css2?family=Merriweather&display=swap' },
]

export function createFontsStore() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  let fonts = $state(saved || [...DEFAULT_FONTS])

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fonts))
  }

  function addFont(name, url) {
    if (fonts.some(f => f.url === url)) return
    fonts = [...fonts, { name, url }]
    save()
  }

  function removeFont(url) {
    fonts = fonts.filter(f => f.url !== url)
    save()
  }

  return {
    get fonts() { return fonts },
    addFont,
    removeFont,
  }
}

export const fontsStore = createFontsStore()
```

- [ ] **Step 2: Create books store**

```js
// web/src/stores/books.svelte.js
export function createBooksStore() {
  let epub = $state(null)           // loaded EPUB File
  let epubName = $state('')
  let selectedFonts = $state([])     // checked font URLs
  let selectedSizes = $state([16])   // checked sizes
  let selectedOrientations = $state(['portrait'])
  let variants = $state([])          // generated variant list
  let activeVariant = $state(0)      // radio selection for emulator
  let converting = $state(false)
  let convertProgress = $state(0)

  function setEpub(file) {
    epub = file
    epubName = file.name.replace('.epub', '')
  }

  function updateVariants() {
    const v = []
    for (const font of selectedFonts) {
      for (const size of selectedSizes) {
        for (const orient of selectedOrientations) {
          v.push({ font, size, orientation: orient })
        }
      }
    }
    variants = v
    if (activeVariant >= v.length) activeVariant = 0
  }

  return {
    get epub() { return epub },
    get epubName() { return epubName },
    get selectedFonts() { return selectedFonts },
    set selectedFonts(v) { selectedFonts = v; updateVariants() },
    get selectedSizes() { return selectedSizes },
    set selectedSizes(v) { selectedSizes = v; updateVariants() },
    get selectedOrientations() { return selectedOrientations },
    set selectedOrientations(v) { selectedOrientations = v; updateVariants() },
    get variants() { return variants },
    get activeVariant() { return activeVariant },
    set activeVariant(v) { activeVariant = v },
    get converting() { return converting },
    get convertProgress() { return convertProgress },
    setEpub,
  }
}

export const booksStore = createBooksStore()
```

- [ ] **Step 3: Create BooksCreate.svelte**

```svelte
<script>
  import DropZone from '../../components/DropZone.svelte'
  import ProgressBar from '../../components/ProgressBar.svelte'
  import { booksStore } from '../../stores/books.svelte.js'
  import { fontsStore } from '../../stores/fonts.svelte.js'
  import { connection } from '../../stores/connection.svelte.js'

  const sizes = [12, 14, 16, 18, 20]
  const orientations = [
    { id: 'portrait', label: 'Portrait' },
    { id: 'landscape', label: 'Landscape' },
  ]

  let newFontUrl = $state('')

  function handleEpub(file) {
    booksStore.setEpub(file)
  }

  function toggleFont(url) {
    const current = booksStore.selectedFonts
    if (current.includes(url)) {
      booksStore.selectedFonts = current.filter(f => f !== url)
    } else {
      booksStore.selectedFonts = [...current, url]
    }
  }

  function toggleSize(size) {
    const current = booksStore.selectedSizes
    if (current.includes(size)) {
      booksStore.selectedSizes = current.filter(s => s !== size)
    } else {
      booksStore.selectedSizes = [...current, size]
    }
  }

  function toggleOrientation(id) {
    const current = booksStore.selectedOrientations
    if (current.includes(id)) {
      if (current.length > 1) {
        booksStore.selectedOrientations = current.filter(o => o !== id)
      }
    } else {
      booksStore.selectedOrientations = [...current, id]
    }
  }

  function addFont() {
    if (!newFontUrl) return
    // Extract font name from Google Fonts URL
    const match = newFontUrl.match(/family=([^&:]+)/)
    const name = match ? decodeURIComponent(match[1]).replace(/\+/g, ' ') : 'Custom Font'
    fontsStore.addFont(name, newFontUrl)
    newFontUrl = ''
  }

  function handleConvert() {
    // TODO: dispatch to converter worker
    console.log('Convert:', booksStore.variants)
  }
</script>

<div class="books-create">
  {#if !booksStore.epub}
    <DropZone accept=".epub" label="Drop EPUB here" onFile={handleEpub} />
  {:else}
    <div class="epub-loaded">
      <span>📖 {booksStore.epubName}</span>
      <button class="text-btn" onclick={() => booksStore.setEpub(null)}>Change</button>
    </div>
  {/if}

  {#if booksStore.epub}
    <section>
      <h3>Font</h3>
      <div class="checkbox-group">
        {#each fontsStore.fonts as font}
          <label class="checkbox">
            <input
              type="checkbox"
              checked={booksStore.selectedFonts.includes(font.url)}
              onchange={() => toggleFont(font.url)}
            />
            {font.name}
          </label>
        {/each}
      </div>
      <div class="add-font">
        <input
          type="text"
          placeholder="Paste Google Fonts URL"
          bind:value={newFontUrl}
        />
        <button class="small-btn" onclick={addFont}>Add</button>
      </div>
    </section>

    <section>
      <h3>Size</h3>
      <div class="checkbox-group inline">
        {#each sizes as size}
          <label class="checkbox">
            <input
              type="checkbox"
              checked={booksStore.selectedSizes.includes(size)}
              onchange={() => toggleSize(size)}
            />
            {size}pt
          </label>
        {/each}
      </div>
    </section>

    <section>
      <h3>Orientation</h3>
      <div class="checkbox-group inline">
        {#each orientations as orient}
          <label class="checkbox">
            <input
              type="checkbox"
              checked={booksStore.selectedOrientations.includes(orient.id)}
              onchange={() => toggleOrientation(orient.id)}
            />
            {orient.label}
          </label>
        {/each}
      </div>
    </section>

    {#if booksStore.variants.length > 0}
      <section>
        <h3>Preview on Emulator</h3>
        <div class="variant-list">
          {#each booksStore.variants as variant, i}
            <label class="radio">
              <input
                type="radio"
                name="variant"
                checked={booksStore.activeVariant === i}
                onchange={() => booksStore.activeVariant = i}
              />
              {variant.font.split('family=')[1]?.split('&')[0] || 'Font'} {variant.size}pt {variant.orientation}
            </label>
          {/each}
        </div>
      </section>
    {/if}

    <div class="actions">
      {#if booksStore.converting}
        <ProgressBar progress={booksStore.convertProgress} label="{booksStore.convertProgress}%" />
      {:else}
        <button class="primary-btn" onclick={handleConvert}
          disabled={booksStore.variants.length === 0}
        >
          Convert {booksStore.variants.length > 1 ? `(${booksStore.variants.length} variants)` : ''}
        </button>
      {/if}
      <button class="primary-btn" disabled={!connection.connected}>
        Push to Device {!connection.connected ? '🔒' : ''}
      </button>
    </div>
  {/if}
</div>

<style>
  .books-create {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  h3 {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
  }
  .epub-loaded {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .checkbox-group.inline {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-md);
  }
  .checkbox, .radio {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 14px;
    cursor: pointer;
  }
  .variant-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm);
    background: var(--sidebar-bg);
    border-radius: var(--radius-sm);
    max-height: 150px;
    overflow-y: auto;
  }
  .add-font {
    display: flex;
    gap: var(--space-sm);
  }
  .add-font input {
    flex: 1;
    font-size: 13px;
  }
  .small-btn {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    background: var(--color-bg-card);
  }
  .small-btn:hover {
    border-color: var(--color-accent);
  }
  .text-btn {
    font-size: 13px;
    color: var(--color-accent);
    text-decoration: underline;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .primary-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-accent);
    color: white;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    transition: background 0.15s;
  }
  .primary-btn:hover:not(:disabled) {
    background: var(--color-accent-hover);
  }
  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
```

- [ ] **Step 4: Create BooksDevice.svelte**

```svelte
<script>
  import { connection } from '../../stores/connection.svelte.js'

  let files = $state([])
  let freeSpace = $state(0)
  let loading = $state(false)

  async function loadFiles() {
    loading = true
    try {
      const result = await connection.listFiles()
      files = result.files || []
      freeSpace = result.free || 0
    } finally {
      loading = false
    }
  }

  async function deleteFile(name) {
    await connection.deleteFile(name)
    await loadFiles()
  }

  $effect(() => {
    if (connection.connected) loadFiles()
  })
</script>

<div class="books-device">
  {#if loading}
    <p class="muted">Loading...</p>
  {:else if files.length === 0}
    <p class="muted">No books on device</p>
  {:else}
    {#each files as file}
      <div class="file-card">
        <div class="file-info">
          <span class="file-name">📖 {file.name}</span>
          <span class="file-size">{(file.size / 1e6).toFixed(1)} MB</span>
        </div>
        <div class="file-actions">
          <button class="text-btn">Preview</button>
          <button class="text-btn danger" onclick={() => deleteFile(file.name)}>Delete</button>
        </div>
      </div>
    {/each}
  {/if}

  {#if freeSpace > 0}
    <p class="space-info">SD Card: {(freeSpace / 1e9).toFixed(1)} GB free</p>
  {/if}
</div>

<style>
  .books-device {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .muted {
    color: var(--color-text-secondary);
    font-size: 14px;
  }
  .file-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .file-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .file-name {
    font-weight: 500;
  }
  .file-size {
    font-size: 12px;
    color: var(--color-text-secondary);
  }
  .file-actions {
    display: flex;
    gap: var(--space-md);
  }
  .text-btn {
    font-size: 13px;
    color: var(--color-accent);
  }
  .text-btn.danger {
    color: var(--color-error);
  }
  .space-info {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin-top: var(--space-md);
  }
</style>
```

- [ ] **Step 5: Create BooksTab.svelte**

```svelte
<script>
  import SubViewToggle from '../../components/SubViewToggle.svelte'
  import BooksCreate from './BooksCreate.svelte'
  import BooksDevice from './BooksDevice.svelte'
  import { connection } from '../../stores/connection.svelte.js'

  let subView = $state('create')
</script>

<div class="books-tab">
  <SubViewToggle
    active={subView}
    disabled={!connection.connected}
    onToggle={(v) => subView = v}
  />

  {#if subView === 'create'}
    <BooksCreate />
  {:else}
    <BooksDevice />
  {/if}
</div>
```

- [ ] **Step 6: Wire BooksTab into App.svelte**

Update the controls area in `App.svelte`:

```svelte
<script>
  import BooksTab from './tabs/books/BooksTab.svelte'
  // ... existing imports
</script>

<!-- In controls-area: -->
<div class="controls-area">
  {#if activeTab === 'books'}
    <BooksTab />
  {:else}
    <div class="controls-placeholder">
      <h2>{activeTab}</h2>
      <p>Coming soon</p>
    </div>
  {/if}
</div>
```

- [ ] **Step 7: Verify** — Books tab shows DropZone, font checkboxes, size checkboxes, orientation checkboxes. Upload an EPUB → options appear. Check multiple fonts/sizes → variant list auto-generates. Radio buttons switch active variant.

- [ ] **Step 8: Commit**

```bash
git add src/tabs/books/ src/stores/books.svelte.js src/stores/fonts.svelte.js src/components/ src/App.svelte
git commit -m "feat: add Books tab with EPUB upload, font/size/orient selection, variant picker"
```

---

## Remaining Milestones (Summary)

The following milestones follow the same pattern. Implementation details will be fleshed out when each milestone starts.

### Milestone 5: Passes Tab
- PassesCreate: DropZone for QR image → zxing-js decode in Worker → template fields (label, notes) → 1-bit preview on emulator
- PassesDevice: list/edit/delete passes on device
- decode.worker.js: zxing-js integration

### Milestone 6: Covers Tab
- CoversCreate: DropZone for image → crop UI (drag/zoom) → dither preset selection → preview on emulator
- CoversDevice: list/delete covers, sleep screen settings
- image.worker.js: dithering algorithms (Sharp B&W, Atkinson, Floyd-Steinberg, Blue Noise, 4-Level Direct)

### Milestone 7: Firmware Tab
- Fetch GitHub releases from `repos/kienvtv3/kread/releases`
- Display version list with release notes
- ESP Web Tools integration for flashing
- Device info display

### Milestone 8: EPUB Converter Worker
- converter.worker.js: JSZip → DOMParser → Harfbuzz WASM → OffscreenCanvas → 2bpp bitmap → LZ4 → .kb
- Windowed rendering (render current page + neighbors on-the-fly)
- Full convert (all pages → complete .kb file)
- Connect preview output to emulator screen buffer

### Milestone 9: Polish & Integration
- File push with progress bar
- Error handling and user feedback
- Clean up old files (test-serial.html, server.js)
- Build and verify `npm run build` output for GitHub Pages
