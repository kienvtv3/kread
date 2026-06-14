<script>
  import { onMount, tick } from 'svelte'
  import defsJson from '../../../resources/definitions.json'

  // ================================================================
  // Icon drawing (same as dict-icons.mjs)
  // ================================================================

  function drawTriangle(ctx, x, y, s, dir, filled) {
    ctx.beginPath()
    switch (dir) {
      case 'left':
        ctx.moveTo(x, y + s / 2); ctx.lineTo(x + s, y); ctx.lineTo(x + s, y + s); break
      case 'right':
        ctx.moveTo(x + s, y + s / 2); ctx.lineTo(x, y); ctx.lineTo(x, y + s); break
      case 'up':
        ctx.moveTo(x + s / 2, y); ctx.lineTo(x, y + s); ctx.lineTo(x + s, y + s); break
      case 'down':
        ctx.moveTo(x + s / 2, y + s); ctx.lineTo(x, y); ctx.lineTo(x + s, y); break
    }
    ctx.closePath()
    if (filled) ctx.fill()
    else { ctx.lineWidth = 1.5; ctx.stroke() }
  }

  const ICON_MAP = {
    tri_left_filled:  (ctx, x, y, s) => drawTriangle(ctx, x, y, s, 'left', true),
    tri_right_filled: (ctx, x, y, s) => drawTriangle(ctx, x, y, s, 'right', true),
    tri_up_filled:    (ctx, x, y, s) => drawTriangle(ctx, x, y, s, 'up', true),
    tri_down_filled:  (ctx, x, y, s) => drawTriangle(ctx, x, y, s, 'down', true),
    tri_left_hollow:  (ctx, x, y, s) => drawTriangle(ctx, x, y, s, 'left', false),
    tri_right_hollow: (ctx, x, y, s) => drawTriangle(ctx, x, y, s, 'right', false),
    tri_up_hollow:    (ctx, x, y, s) => drawTriangle(ctx, x, y, s, 'up', false),
    tri_down_hollow:  (ctx, x, y, s) => drawTriangle(ctx, x, y, s, 'down', false),
    tri_lr_hollow: (ctx, x, y, s) => {
      drawTriangle(ctx, x, y, s, 'left', false)
      drawTriangle(ctx, x + s / 2 + 2, y, s, 'right', false)
    },
    tri_ud_hollow: (ctx, x, y, s) => {
      drawTriangle(ctx, x, y, s, 'up', false)
      drawTriangle(ctx, x + s / 2 + 2, y, s, 'down', false)
    },
  }

  function drawIcon(ctx, iconName, x, y, size) {
    ctx.save(); ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'
    const fn = ICON_MAP[iconName]; if (fn) fn(ctx, x, y, size)
    ctx.restore()
  }

  function drawBattery(ctx, x, y, w, h) {
    ctx.save(); ctx.fillStyle = '#000'; ctx.imageSmoothingEnabled = false
    const tipW = 2
    const tipH = Math.max(4, Math.round(h * 0.4))
    const tipY = y + Math.floor((h - tipH) / 2)
    const bodyX = x + tipW, bodyW = w - tipW
    ctx.fillRect(bodyX - tipW, tipY, tipW, tipH)
    ctx.fillRect(bodyX, y, bodyW, 1)
    ctx.fillRect(bodyX, y + h - 1, bodyW, 1)
    ctx.fillRect(bodyX, y, 1, h)
    ctx.fillRect(bodyX + bodyW - 1, y, 1, h)
    ctx.restore()
  }

  function drawStar(ctx, x, y, size) {
    ctx.save(); ctx.fillStyle = '#000'
    const cx = x + size / 2, cy = y + size / 2, outerR = size / 2, innerR = outerR * 0.38
    ctx.beginPath()
    for (let i = 0; i < 5; i++) {
      const oa = (i * 72 - 90) * Math.PI / 180, ia = ((i * 72) + 36 - 90) * Math.PI / 180
      if (i === 0) ctx.moveTo(cx + outerR * Math.cos(oa), cy + outerR * Math.sin(oa))
      else ctx.lineTo(cx + outerR * Math.cos(oa), cy + outerR * Math.sin(oa))
      ctx.lineTo(cx + innerR * Math.cos(ia), cy + innerR * Math.sin(ia))
    }
    ctx.closePath(); ctx.fill(); ctx.restore()
  }

  function drawSelectBarIcon(ctx, x, y, w, h) {
    ctx.save(); ctx.fillStyle = '#000'; ctx.fillRect(x, y, w, h); ctx.restore()
  }

  const SHARED_DRAW = { draw_battery: drawBattery, draw_star: drawStar, draw_select_bar: drawSelectBarIcon }

  // ================================================================
  // Firmware layout constants (matching ui.c)
  // ================================================================

  const SCREEN_W = 480, SCREEN_H = 800
  const SAFE_TOP = 8, SAFE_LEFT = 8, SAFE_RIGHT = 8, SAFE_BOTTOM = 8
  const SAFE_W = SCREEN_W - SAFE_LEFT - SAFE_RIGHT
  const HEADER_H = 53
  const BOTTOM_BAR_H = 40
  const BOTTOM_BAR_Y = SCREEN_H - SAFE_BOTTOM - BOTTOM_BAR_H
  const LIST_TOP = SAFE_TOP + HEADER_H
  const LIST_AREA_H = BOTTOM_BAR_Y - LIST_TOP
  const SINGLE_PER_PAGE = 12
  const SINGLE_ITEM_H = Math.floor(LIST_AREA_H / SINGLE_PER_PAGE)
  const TEXT_X = SAFE_LEFT + 14
  const TEXT_W = SCREEN_W - SAFE_LEFT - SAFE_RIGHT - 28

  // ================================================================
  // Position calculator — where firmware draws each item
  // ================================================================

  function bottomSlot(index, cw, ch) {
    const slot_w = Math.floor(SAFE_W / 4)
    return {
      x: SAFE_LEFT + slot_w * index + Math.floor((slot_w - cw) / 2),
      y: BOTTOM_BAR_Y + Math.floor((BOTTOM_BAR_H - ch) / 2) + 1
    }
  }

  function getItemPosition(item) {
    const key = item.key
    const cw = item.container.width
    const ch = item.container.height

    // Nav → specific bottom bar slots
    if (key === 'nav.read')     return bottomSlot(0, cw, ch)
    if (key === 'nav.library')  return bottomSlot(1, cw, ch)
    if (key === 'nav.gallery')  return bottomSlot(2, cw, ch)
    if (key === 'nav.settings') return bottomSlot(3, cw, ch)

    // Hints → slot 0 as example
    if (key.startsWith('hint.')) return bottomSlot(0, cw, ch)

    // Headers → full width, centered in header area
    if (key.startsWith('hdr.')) return { x: 0, y: SAFE_TOP + Math.floor((HEADER_H - ch) / 2) }

    // List labels → first row
    if (item.containerName === 'list_label') {
      return { x: TEXT_X, y: LIST_TOP + Math.floor((SINGLE_ITEM_H - ch) / 2) }
    }

    // List values → first row, right-aligned
    if (item.containerName === 'list_value') {
      return { x: TEXT_X + TEXT_W - cw, y: LIST_TOP + Math.floor((SINGLE_ITEM_H - ch) / 2) }
    }

    // Empty state
    if (key.includes('_sub') && key.startsWith('empty.')) {
      return { x: Math.floor((SCREEN_W - cw) / 2), y: Math.floor(SCREEN_H / 2) - 40 + 60 }
    }
    if (key.startsWith('empty.')) {
      return { x: Math.floor((SCREEN_W - cw) / 2), y: Math.floor(SCREEN_H / 2) - 40 }
    }

    // Battery icon → top right
    if (key === 'shared.icon_battery') return { x: SCREEN_W - SAFE_RIGHT - 27, y: SAFE_TOP + 6 }

    // Progress → home area
    if (key.startsWith('progress.')) return { x: SCREEN_W - SAFE_RIGHT - cw - 14, y: SAFE_TOP + 6 }

    // Digits → compose area center
    if (item.containerName === 'digit' || key.startsWith('shared.digit') || key.startsWith('shared.dot') || key.startsWith('shared.percent') || key.startsWith('shared.space') || key.startsWith('shared.unit')) {
      return { x: Math.floor((SCREEN_W - cw) / 2), y: Math.floor(SCREEN_H / 2) }
    }

    // Default: centered
    return { x: Math.floor((SCREEN_W - cw) / 2), y: Math.floor((SCREEN_H - ch) / 2) }
  }

  // ================================================================
  // State
  // ================================================================

  let { active = false, screen, onVersionBump } = $props()

  function bumpVersion() { onVersionBump?.() }

  const GRAY_LEVELS = [0, 96, 168, 255]
  let defs = $state(defsJson)
  let items = $state([])
  let currentIndex = $state(0)
  let emuLang = $state('en')
  let canvasEls = $state({})

  // Offscreen canvas for rendering items
  let offCanvas

  function buildFontString(fontDef) {
    return `${fontDef.weight || 'normal'} ${fontDef.size}px "Atkinson Hyperlegible", sans-serif`
  }

  function buildItems(defs) {
    const result = []
    const { containers, shared, entries, progress_range } = defs

    for (const [key, def] of Object.entries(shared)) {
      result.push({
        key: `shared.${key}`, type: 'shared', def,
        container: def.type === 'icon' ? { width: def.width, height: def.height, align: 'center' } : containers[def.container],
        containerName: def.type === 'icon' ? `${def.width}×${def.height}` : def.container,
      })
    }
    for (const [key, def] of Object.entries(entries)) {
      result.push({ key, type: 'entry', def, container: containers[def.container], containerName: def.container })
    }
    if (progress_range) {
      const c = containers[progress_range.container]
      for (const n of [1, 50, 100]) {
        result.push({ key: `progress.${n}`, type: 'progress', def: progress_range, n, container: c, containerName: progress_range.container })
      }
    }
    return result
  }

  function getText(item, lang) {
    const def = item.def
    if (item.type === 'shared') return def.text || ''
    if (item.type === 'progress') return (def.template?.[lang] || def.template?.en || '').replace('{n}', String(item.n))
    return def.text?.[lang] || def.text?.en || ''
  }

  // ================================================================
  // Canvas rendering (for preview grid + emulator)
  // ================================================================

  function renderToCanvas(canvas, item, lang, mode) {
    if (!canvas) return
    const c = item.container
    const scale = canvas === offCanvas ? 1 : 2
    canvas.width = c.width * scale
    canvas.height = c.height * scale
    const ctx = canvas.getContext('2d')
    ctx.scale(scale, scale)

    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, c.width, c.height)
    drawItemContent(ctx, item, lang, c)
    applyQuantization(ctx, c.width * scale, c.height * scale, mode)
  }

  function drawItemContent(ctx, item, lang, c) {
    const def = item.def

    if (item.type === 'shared' && def.type === 'icon') {
      ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'
      const drawFn = SHARED_DRAW[def.draw]
      if (drawFn) drawFn(ctx, 0, 0, c.width, c.height)
      return
    }

    const text = getText(item, lang)
    const fontDef = defs.fonts[def.font || 'ui']
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000'
    ctx.font = fontDef ? buildFontString(fontDef) : '20px "Atkinson Hyperlegible", sans-serif'
    ctx.textBaseline = 'middle'

    const gap = 4, iconSize = 12
    let textX = 0, textY = c.height / 2
    const iconY = Math.floor((c.height - iconSize) / 2)
    const icon = def.icon || def.icon_left
    const iconRight = def.icon_right

    if (icon && icon.position === 'above') {
      drawIcon(ctx, icon.name, Math.floor((c.width - iconSize) / 2), Math.max(2, Math.floor(c.height * 0.15)), iconSize)
      textY = c.height * 0.7
    } else if (icon) {
      drawIcon(ctx, icon.name, gap, iconY, iconSize)
      textX = iconSize + gap * 2
    }

    if (text) {
      const textW = ctx.measureText(text).width
      let x = textX, avail = c.width - textX
      if (iconRight) avail -= (iconSize + gap * 2)
      if (c.align === 'center') x = textX + Math.max(0, (avail - textW) / 2)
      else if (c.align === 'right') x = textX + Math.max(0, avail - textW - gap)
      ctx.fillStyle = '#000'
      ctx.fillText(text, x, textY)
    }

    if (iconRight) drawIcon(ctx, iconRight.name, c.width - iconSize - gap, Math.floor((c.height - iconSize) / 2), iconSize)
  }

  function applyQuantization(ctx, w, h, mode) {
    if (mode === 'source') return
    const imageData = ctx.getImageData(0, 0, w, h)
    const d = imageData.data
    for (let i = 0; i < d.length; i += 4) {
      const gray = Math.round(0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2])
      let out
      if (mode === 'bw') out = gray < 128 ? 0 : 255
      else { out = gray < 80 ? 0 : gray < 150 ? 96 : gray < 210 ? 168 : 255 }
      d[i] = d[i+1] = d[i+2] = out
    }
    ctx.putImageData(imageData, 0, 0)
  }

  // ================================================================
  // Emulator integration — render item at firmware position
  // ================================================================

  function renderToEmulator(item) {
    screen.clear(3) // white

    // Draw layout guides (level 2 = light gray)
    const drawGuideH = (y) => { for (let x = SAFE_LEFT; x < SAFE_LEFT + SAFE_W; x++) screen.setPixel(x, y, 2) }
    const drawGuideV = (x) => { for (let y = SAFE_TOP; y < SCREEN_H - SAFE_BOTTOM; y++) screen.setPixel(x, y, 2) }

    // Safe margins
    drawGuideH(SAFE_TOP)
    drawGuideH(SCREEN_H - SAFE_BOTTOM - 1)
    drawGuideV(SAFE_LEFT)
    drawGuideV(SCREEN_W - SAFE_RIGHT - 1)

    // Header separator
    drawGuideH(SAFE_TOP + HEADER_H - 1)

    // Bottom bar separator
    drawGuideH(BOTTOM_BAR_Y)

    // List row guides
    for (let i = 1; i < SINGLE_PER_PAGE; i++) {
      const y = LIST_TOP + i * SINGLE_ITEM_H
      if (y < BOTTOM_BAR_Y) drawGuideH(y)
    }

    // Render item to offscreen canvas at 1:1
    if (!offCanvas) offCanvas = document.createElement('canvas')
    renderToCanvas(offCanvas, item, emuLang, 'bw')

    // Blit to emulator at firmware position
    const pos = getItemPosition(item)
    const c = item.container
    const ctx = offCanvas.getContext('2d')
    const imageData = ctx.getImageData(0, 0, c.width, c.height)
    const d = imageData.data

    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const px = pos.x + x, py = pos.y + y
        if (px < 0 || px >= SCREEN_W || py < 0 || py >= SCREEN_H) continue
        const gray = d[(y * c.width + x) * 4]
        // Map to 4 levels: 0=black, 1=dark, 2=light, 3=white
        const level = gray < 64 ? 0 : gray < 128 ? 1 : gray < 192 ? 2 : 3
        if (level < 3) screen.setPixel(px, py, level) // skip white (already cleared)
      }
    }

    // Draw container bounding box as dashed (level 1 = dark gray, every other pixel)
    for (let x = pos.x; x < pos.x + c.width; x++) {
      if ((x & 1) === 0) {
        if (pos.y >= 0 && pos.y < SCREEN_H) screen.setPixel(x, pos.y, 2)
        const by = pos.y + c.height - 1
        if (by >= 0 && by < SCREEN_H) screen.setPixel(x, by, 2)
      }
    }
    for (let y = pos.y; y < pos.y + c.height; y++) {
      if ((y & 1) === 0) {
        if (pos.x >= 0 && pos.x < SCREEN_W) screen.setPixel(pos.x, y, 2)
        const rx = pos.x + c.width - 1
        if (rx >= 0 && rx < SCREEN_W) screen.setPixel(rx, y, 2)
      }
    }

    bumpVersion()
  }

  // ================================================================
  // Preview grid variants
  // ================================================================

  const modes = [
    { mode: 'source', label: 'Source' },
    { mode: 'gray4',  label: 'Grayscale' },
    { mode: 'bw',     label: 'B&W' },
  ]

  function renderAllPreviews() {
    if (!active) return
    const item = items[currentIndex]
    if (!item) return
    for (const m of modes) {
      const canvas = canvasEls[m.mode]
      if (canvas) renderToCanvas(canvas, item, emuLang, m.mode)
    }
    renderToEmulator(item)
  }

  // ================================================================
  // Navigation
  // ================================================================

  function navigate(delta) {
    const next = currentIndex + delta
    if (next >= 0 && next < items.length) {
      currentIndex = next
      tick().then(renderAllPreviews)
    }
  }

  function handleKeydown(e) {
    if (!active) return
    if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); navigate(-1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); navigate(1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); navigate(-10) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopImmediatePropagation(); navigate(10) }
  }

  onMount(() => {
    items = buildItems(defs)
    // Register keydown with capture to intercept before emulator
    window.addEventListener('keydown', handleKeydown, true)
    tick().then(renderAllPreviews)
    return () => window.removeEventListener('keydown', handleKeydown, true)
  })

  // Re-render when index changes or tab becomes active
  $effect(() => {
    if (items.length > 0 && active) {
      void currentIndex
      tick().then(renderAllPreviews)
    }
  })

  let currentItem = $derived(items[currentIndex] || null)
  let currentPos = $derived(currentItem ? getItemPosition(currentItem) : null)
</script>

<div class="dict-tab">
  <div class="controls">
    <div class="nav-row">
      <button onclick={() => navigate(-10)} disabled={currentIndex < 10}>-10</button>
      <button onclick={() => navigate(-1)} disabled={currentIndex === 0}>Prev</button>
      <span class="counter">{currentIndex + 1} / {items.length}</span>
      <button onclick={() => navigate(1)} disabled={currentIndex >= items.length - 1}>Next</button>
      <button onclick={() => navigate(10)} disabled={currentIndex >= items.length - 10}>+10</button>
    </div>
    <div class="lang-toggle">
      {#each ['en', 'vi'] as lang}
        <button class:active={emuLang === lang} onclick={() => { emuLang = lang; tick().then(renderAllPreviews) }}>{lang.toUpperCase()}</button>
      {/each}
    </div>
    <span class="hint">Arrow keys: Up/Down = ±1, Left/Right = ±10</span>
  </div>

  {#if currentItem}
    <div class="info">
      <span class="key">{currentItem.key}</span>
      <span class="meta">
        {currentItem.containerName}
        · {currentItem.container.width}×{currentItem.container.height}
        · {currentItem.container.align || 'left'}
        {#if currentPos}· pos ({currentPos.x}, {currentPos.y}){/if}
      </span>
    </div>

    <div class="preview-stack">
      {#each modes as m}
        <div class="variant">
          <span class="variant-label">{m.label}</span>
          <div class="canvas-frame"
            style:width="{currentItem.container.width * 2}px"
            style:height="{currentItem.container.height * 2}px"
          >
            <canvas bind:this={canvasEls[m.mode]}></canvas>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if items.length > 0}
    <div class="item-list">
      {#each items as item, i}
        <button
          class="item-row"
          class:active={i === currentIndex}
          onclick={() => { currentIndex = i }}
        >
          <span class="item-idx">{i}</span>
          <span class="item-key">{item.key}</span>
          <span class="item-container">{item.containerName}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .dict-tab {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    height: 100%;
  }
  .controls {
    display: flex;
    gap: var(--space-lg);
    align-items: center;
    flex-wrap: wrap;
  }
  .nav-row {
    display: flex;
    gap: var(--space-xs);
    align-items: center;
  }
  .lang-toggle {
    display: flex;
    gap: var(--space-xs);
  }
  .lang-toggle button {
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 12px;
    cursor: pointer;
  }
  .lang-toggle button.active {
    background: var(--color-text);
    color: var(--color-bg);
  }
  .nav-row button {
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 12px;
    cursor: pointer;
  }
  .nav-row button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .counter {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-secondary);
    min-width: 80px;
    text-align: center;
  }
  .hint {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-secondary);
  }
  .info {
    display: flex;
    gap: var(--space-md);
    align-items: baseline;
    flex-wrap: wrap;
  }
  .key {
    font-family: var(--font-mono);
    font-size: 14px;
    font-weight: 600;
  }
  .meta {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text-secondary);
  }
  .preview-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .variant {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .variant-label {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .canvas-frame {
    border: 1px dashed var(--color-border);
    background: #fff;
    line-height: 0;
  }
  .canvas-frame canvas {
    width: 100%;
    height: 100%;
    image-rendering: pixelated;
  }
  .item-list {
    flex: 1;
    overflow-y: auto;
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-sm);
  }
  .item-row {
    display: flex;
    gap: var(--space-sm);
    padding: 2px var(--space-xs);
    width: 100%;
    text-align: left;
    font-family: var(--font-mono);
    font-size: 11px;
    border: none;
    background: none;
    cursor: pointer;
    border-left: 2px solid transparent;
  }
  .item-row:hover {
    background: rgba(0, 0, 0, 0.04);
  }
  .item-row.active {
    background: rgba(0, 0, 0, 0.06);
    border-left-color: var(--color-text);
  }
  .item-idx {
    color: var(--color-text-secondary);
    min-width: 28px;
  }
  .item-key {
    flex: 1;
  }
  .item-container {
    color: var(--color-text-secondary);
  }
</style>
