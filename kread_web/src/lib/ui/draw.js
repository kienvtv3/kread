// Shared drawing components for all screens.
// Pure canvas 2D functions — no state, no encoding, no side effects.
// Sizes and fonts read from definitions.yaml via defs.js.

import {
  W, SAFE_X, SAFE_W, SAFE,
  HELP_BAR_Y, HELP_BAR_H, HELP_SLOT_W, HELP_SLOT_H,
  SUB_HEADER, SUB_HELP,
  contentRect,
} from './layout.js'
import { fontCSS, assetText, dynamic, slotBounds } from './defs.js'

let DEBUG_BORDERS = false
export function setDebugBorders(on) { DEBUG_BORDERS = on }
export function getDebugBorders() { return DEBUG_BORDERS }

// ================================================================
// Debug helpers
// ================================================================

export function debugRect(ctx, x, y, w, h) {
  if (!DEBUG_BORDERS) return
  ctx.save()
  ctx.strokeStyle = 'black'
  ctx.lineWidth = 0.5
  ctx.setLineDash([3, 3])
  ctx.strokeRect(x, y, w, h)
  ctx.setLineDash([])
  ctx.restore()
}

export function debugContainer(ctx, container) {
  if (!DEBUG_BORDERS) return
  const r = contentRect(container)
  ctx.save()
  ctx.strokeStyle = '#888'
  ctx.lineWidth = 0.5
  ctx.strokeRect(0, container.y, W, container.h)
  ctx.setLineDash([2, 2])
  ctx.strokeStyle = 'black'
  ctx.strokeRect(r.x, r.y, r.w, r.h)
  ctx.setLineDash([])
  ctx.restore()
}

// ================================================================
// Triangle icons (canvas path — consistent size for filled + outline)
// ================================================================

export function drawTriangle(ctx, cx, cy, size, direction, filled) {
  const half = size / 2
  ctx.save()
  ctx.beginPath()
  switch (direction) {
    case 'left':
      ctx.moveTo(cx - half, cy); ctx.lineTo(cx + half, cy - half); ctx.lineTo(cx + half, cy + half); break
    case 'right':
      ctx.moveTo(cx + half, cy); ctx.lineTo(cx - half, cy - half); ctx.lineTo(cx - half, cy + half); break
    case 'up':
      ctx.moveTo(cx, cy - half); ctx.lineTo(cx - half, cy + half); ctx.lineTo(cx + half, cy + half); break
    case 'down':
      ctx.moveTo(cx, cy + half); ctx.lineTo(cx - half, cy - half); ctx.lineTo(cx + half, cy - half); break
  }
  ctx.closePath()
  if (filled) {
    ctx.fillStyle = 'black'; ctx.fill()
  } else {
    ctx.strokeStyle = 'black'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke()
  }
  ctx.restore()
}

// ================================================================
// Battery icon (dynamic — frame + fill)
// ================================================================

// Battery: container includes 1px stroke pad on each side
// Draw position = container origin + 1px offset
const BAT = dynamic['battery.frame']
const BAT_PAD = 1  // stroke overshoot

export function drawBatteryFrame(ctx, cx, cy) {
  // Frame is pre-rendered as .kp asset — this is for emulator fallback only
}

export function drawBatteryFill(ctx, cx, cy, percent) {
  const x = cx + BAT_PAD, y = cy + BAT_PAD
  const tipW = 3, sw = 2  // sw = stroke width of frame
  const bw = BAT.w - BAT_PAD * 2 - tipW, bh = BAT.h - BAT_PAD * 2
  // Fill sits 1px inside the 2px stroke (stroke centered on edge → 1px inward)
  const inset = sw
  const innerMaxW = bw - inset * 2
  const innerH = bh - inset * 2
  const innerW = Math.round(innerMaxW * Math.min(percent, 100) / 100)
  if (innerW <= 0 || innerH <= 0) return
  ctx.save()
  ctx.fillStyle = 'black'
  ctx.fillRect(x + tipW + inset + (innerMaxW - innerW), y + inset, innerW, innerH)
  ctx.restore()
}

export function drawBattery(ctx, cx, cy, percent) {
  drawBatteryFrame(ctx, cx, cy)
  drawBatteryFill(ctx, cx, cy, percent)
}

// ================================================================
// Progress bar (dynamic — frame + fill, label separate)
// ================================================================

// Progress bar: container includes 1px stroke pad
const PROG = dynamic['progress.frame']
const PROG_PAD = 1
const PROG_INNER_W = PROG.w - PROG_PAD * 2   // actual bar width
const PROG_INNER_H = PROG.h - PROG_PAD * 2   // actual bar height

export function drawProgressBarFrame(ctx, cx, cy) {
  const x = cx + PROG_PAD, y = cy + PROG_PAD
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x, y, PROG_INNER_W, PROG_INNER_H, PROG.radius)
  ctx.strokeStyle = 'black'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.restore()
}

export function drawProgressBarFill(ctx, cx, cy, progress) {
  if (progress <= 0) return
  const x = cx + PROG_PAD, y = cy + PROG_PAD
  const innerH = PROG_INNER_H - PROG.pad * 2
  const innerR = Math.max(1, PROG.radius - PROG.pad)
  const innerMaxW = PROG_INNER_W - PROG.pad * 2
  const innerW = Math.max(innerH, Math.round(innerMaxW * progress / 100))
  ctx.save()
  ctx.beginPath()
  ctx.roundRect(x + PROG.pad, y + PROG.pad, innerW, innerH, innerR)
  ctx.fillStyle = 'black'
  ctx.fill()
  ctx.restore()
}

export function drawProgressLabel(ctx, x, y, progress, lang = 'en') {
  // Compose: digits + "% " + suffix (mirrors firmware glyph composition)
  let label
  if (progress <= 0) label = assetText('progress.unread', lang)
  else if (progress >= 100) label = assetText('progress.finished', lang)
  else label = `${progress}% ${assetText('progress.read', lang)}`
  ctx.save()
  ctx.fillStyle = 'black'
  ctx.font = fontCSS('small')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(label, x, y)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.restore()
}

// Legacy compat
export function drawProgressBar(ctx, x, y, w, h, r, pad, progress, label) {
  ctx.save()
  ctx.fillStyle = 'black'
  ctx.font = fontCSS('small')
  ctx.textAlign = 'center'
  ctx.textBaseline = 'bottom'
  ctx.fillText(label, x + w / 2, y - 4)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.strokeStyle = 'black'
  ctx.lineWidth = 1.5
  ctx.stroke()
  if (progress > 0) {
    const innerH = h - pad * 2
    const innerR = Math.max(1, r - pad)
    const innerMaxW = w - pad * 2
    const innerW = Math.max(innerH, Math.round(innerMaxW * progress / 100))
    ctx.beginPath()
    ctx.roundRect(x + pad, y + pad, innerW, innerH, innerR)
    ctx.fillStyle = 'black'
    ctx.fill()
  }
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.restore()
}

// ================================================================
// Text helpers
// ================================================================

export function truncate(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 0 && ctx.measureText(t + '...').width > maxW) t = t.slice(0, -1)
  return t + '...'
}

export function wordWrap(ctx, text, maxW, maxLines) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line); line = word
      if (lines.length >= maxLines) break
    } else { line = test }
  }
  if (line && lines.length < maxLines) lines.push(line)
  else if (line && lines.length >= maxLines) {
    lines[lines.length - 1] = truncate(ctx, lines[lines.length - 1] + ' ' + line, maxW)
  }
  return lines
}

// ================================================================
// Help bar slot — triangle icon + label text
// ================================================================

// Parse icon name from definitions: "tri_left_filled" → { direction: 'left', filled: true }
function parseTriIcon(name) {
  if (!name) return null
  const m = name.match(/^tri_(\w+?)_(filled|hollow)$/)
  if (!m) return null
  return { direction: m[1], filled: m[2] === 'filled' }
}

// Draw a help slot with text + optional triangle icon
function drawHelpSlot(ctx, x, y, w, h, text, icon) {
  ctx.save()
  ctx.font = fontCSS('small')
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fillStyle = 'black'

  if (icon) {
    const triSize = 10, gap = 5
    const textW = ctx.measureText(text).width
    const totalW = triSize + gap + textW
    const startX = x + (w - totalW) / 2
    drawTriangle(ctx, startX + triSize / 2, y + h / 2, triSize, icon.direction, icon.filled)
    ctx.fillStyle = 'black'
    ctx.fillText(text, startX + triSize + gap, y + h / 2)
  } else {
    ctx.textAlign = 'center'
    ctx.fillText(text, x + w / 2, y + h / 2)
  }
  ctx.restore()
}

// Draw nav/help slot (legacy format: { direction, filled, label } or string)
export function drawNavSlot(ctx, x, y, w, h, slot) {
  if (!slot) return
  if (typeof slot === 'string') {
    ctx.save()
    ctx.font = fontCSS('small')
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'black'
    ctx.fillText(slot, x + w / 2, y + h / 2)
    ctx.restore()
  } else {
    const { direction, filled, label } = slot
    drawHelpSlot(ctx, x, y, w, h, label, direction ? { direction, filled } : null)
  }
}

// ================================================================
// Help bar (bottom bar with 4 slots)
// ================================================================

export function drawHelpBar(ctx, slots, y = HELP_BAR_Y) {
  debugRect(ctx, SAFE_X, y, SAFE_W, HELP_BAR_H)
  ctx.fillStyle = 'black'
  ctx.fillRect(SAFE_X, y, SAFE_W, 1)
  for (let i = 0; i < 4; i++) {
    if (slots[i]) {
      drawNavSlot(ctx, SAFE_X + HELP_SLOT_W * i, y + 1, HELP_SLOT_W, HELP_SLOT_H, slots[i])
    }
  }
}

// Legacy compat
export function drawNavBar(ctx, slots) { drawHelpBar(ctx, slots, HELP_BAR_Y) }
export function drawBottomBar(ctx, slots, y) { drawHelpBar(ctx, slots, y) }

// Asset manifest helpers for help bar slots
export function barSlotAssets(prefix, slots, y) {
  const assets = []
  for (let i = 0; i < 4; i++) {
    if (slots[i]) {
      const label = typeof slots[i] === 'string'
        ? slots[i].replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
        : slots[i].label.toLowerCase().replace(/[^a-z0-9]/g, '')
      if (label) {
        assets.push({
          name: `${prefix}_${label}`,
          type: 'component',
          bounds: { x: SAFE_X + HELP_SLOT_W * i, y: y + 1, w: HELP_SLOT_W, h: HELP_SLOT_H },
        })
      }
    }
  }
  return assets
}

// ================================================================
// Sub-page header
// ================================================================

export function drawSubHeader(ctx, title) {
  debugContainer(ctx, SUB_HEADER)
  const hdr = contentRect(SUB_HEADER)
  ctx.fillStyle = 'black'
  ctx.font = fontCSS('header')
  ctx.textBaseline = 'top'
  ctx.fillText(title, hdr.x, hdr.y + 4)
  ctx.fillRect(SAFE_X, SUB_HEADER.y + SUB_HEADER.h - 1, SAFE_W, 1)
}

// ================================================================
// Generic list renderer
// ================================================================

export function renderList(ctx, opts) {
  const {
    items, selectedIndex, perPage, renderItem,
    totalItems, globalIndex, selectable = true, rowType = 'single'
  } = opts
  const listTop = SUB_HEADER.y + SUB_HEADER.h
  const listBot = SUB_HELP.y
  const effectivePerPage = perPage || (rowType === 'double' ? 8 : 12)
  const itemH = Math.floor((listBot - listTop) / effectivePerPage)
  const textX = SAFE_X + 14
  const textW = SAFE_W - 28

  items.forEach((item, i) => {
    const iy = listTop + i * itemH
    const selected = i === selectedIndex

    if (selectable && selected) {
      ctx.fillStyle = 'black'
      ctx.fillRect(SAFE_X, iy + 4, 4, itemH - 8)
    }

    const labelY = iy + Math.floor((itemH - (rowType === 'double' ? 50 : 20)) / 2)
    renderItem(ctx, item, textX, labelY, textW, selected, itemH)

    const isLast = i === items.length - 1
    const atPageBottom = i === effectivePerPage - 1
    if (!atPageBottom && (!isLast || items.length < effectivePerPage)) {
      ctx.fillStyle = '#aaa'
      ctx.fillRect(textX, iy + itemH - 1, textW, 1)
    }
  })

  const totalPages = totalItems ? Math.ceil(totalItems / effectivePerPage) : 0
  if (totalPages > 1 && globalIndex !== undefined) {
    const sbTrackH = listBot - listTop
    const sbH = Math.max(20, sbTrackH / totalPages)
    const sbY = listTop + (sbTrackH - sbH) * globalIndex / (totalItems - 1)
    ctx.fillStyle = '#aaa'
    ctx.fillRect(W - SAFE.right - 4, sbY, 3, sbH)
  }
}

// ================================================================
// Item renderers (used with renderList)
// ================================================================

export function renderSettingsItem(ctx, item, x, y, w) {
  ctx.font = fontCSS('ui')
  ctx.fillStyle = 'black'
  ctx.fillText(item.label, x, y)
  const triSize = 8
  const triGap = 6  // gap between triangle and text
  const midY = y + 10  // vertical center of text line
  if (item.type === 'value') {
    const val = String(item.options[item.index])
    const atMin = !item.circular && item.index === 0
    const atMax = !item.circular && item.index === item.options.length - 1
    // Right triangle (if not at max)
    const rightTriX = x + w - triSize / 2
    if (!atMax) drawTriangle(ctx, rightTriX, midY, triSize, 'right', false)
    // Value text before right triangle
    const valW = ctx.measureText(val).width
    const valX = rightTriX - triGap - triSize / 2 - valW
    ctx.textAlign = 'left'
    ctx.fillStyle = 'black'
    ctx.fillText(val, valX, y)
    // Left triangle (if not at min)
    if (!atMin) drawTriangle(ctx, valX - triGap - triSize / 2, midY, triSize, 'left', false)
  } else if (item.type === 'toggle') {
    const val = item.value ? 'ON' : 'OFF'
    const rightTriX = x + w - triSize / 2
    drawTriangle(ctx, rightTriX, midY, triSize, 'right', false)
    const valW = ctx.measureText(val).width
    const valX = rightTriX - triGap - triSize / 2 - valW
    ctx.fillText(val, valX, y)
    drawTriangle(ctx, valX - triGap - triSize / 2, midY, triSize, 'left', false)
  } else if (item.type === 'info') {
    ctx.textAlign = 'right'
    ctx.fillText(item.value, x + w, y)
  } else if (item.type === 'action') {
    drawTriangle(ctx, x + w - triSize / 2, midY, triSize, 'down', true)
  }
  ctx.textAlign = 'left'
}

export function renderInfoItem(ctx, item, x, y, w) {
  ctx.font = fontCSS('ui')
  ctx.fillStyle = 'black'
  ctx.fillText(item[0], x, y)
  ctx.textAlign = 'right'
  ctx.fillText(item[1], x + w, y)
  ctx.textAlign = 'left'
}

export function renderTextItem(ctx, item, x, y, w) {
  ctx.font = fontCSS('ui')
  ctx.fillStyle = 'black'
  ctx.fillText(typeof item === 'string' ? item : item.label || item.name, x, y)
}

export function renderBookItem(ctx, book, x, y, w) {
  ctx.font = fontCSS('ui_bold')
  ctx.fillStyle = 'black'
  ctx.fillText(truncate(ctx, book.title, w), x, y)
  ctx.font = fontCSS('small')
  const progText = book.progress > 0 ? `${book.progress}% READ` : 'UNREAD'
  const progW = ctx.measureText(progText).width + 8
  ctx.fillText(truncate(ctx, book.author, w - progW), x, y + 30)
  ctx.textAlign = 'right'
  ctx.fillText(progText, x + w, y + 30)
  ctx.textAlign = 'left'
}

export function renderGalleryItem(ctx, item, x, y, w) {
  ctx.font = fontCSS('ui')
  ctx.fillStyle = 'black'
  ctx.fillText(item.name, x, y)
  if (item.isStarred) {
    ctx.textAlign = 'right'
    ctx.fillText('\u2605', x + w, y)
    ctx.textAlign = 'left'
  }
}
