import {
  W, H, SAFE_X, SAFE_W, SAFE_Y, STATUS_BAR, HOME_ARROW_W, HOME_LAYOUT, HOME_THUMB,
  contentRect,
} from '../layout.js'
import {
  drawBatteryFill, drawProgressBarFill,
  drawTriangle,
  debugContainer, debugRect,
} from '../draw.js'
import { dynamic, slotBounds, helpSlotElements } from '../defs.js'
import { getAsset, blitAsset } from '../asset-loader.js'

const BAT = dynamic['battery.frame']
const PROG = dynamic['progress.frame']
const ARROW = dynamic['arrow.left']
const homeHelpEls = helpSlotElements('home')

const HL = HOME_LAYOUT

// ─── Blit helpers with anchor modes ─────────────────────────

/** Blit asset at (x, y) with anchor: BL=bottom-left, BC=bottom-center, BR=bottom-right */
function blitAnchored(ctx, asset, x, y, anchor = 'BL') {
  if (!asset?.imageData) return
  let bx, by
  by = Math.round(y - asset.h)  // y = bottom edge for all anchors
  switch (anchor) {
    case 'BC': bx = Math.round(x - asset.w / 2); break
    case 'BR': bx = Math.round(x - asset.w); break
    default:   bx = Math.round(x); break  // BL
  }
  blitAsset(ctx, asset, bx, by)
  return { x: bx, y: by, w: asset.w, h: asset.h }
}

// ─── Progress label ─────────────────────────────────────────

function blitProgressLabel(ctx, centerX, bottomY, progress) {
  let key
  if (progress <= 0) key = 'progress.unread'
  else if (progress >= 100) key = 'progress.finished'
  else key = `progress.${progress}`

  const a = getAsset(key)
  if (!a) return []

  const b = blitAnchored(ctx, a, centerX, bottomY, 'BC')
  return b ? [{ name: key, type: 'prerendered', bounds: b }] : []
}

// ─── Main render ────────────────────────────────────────────

export function renderHome(ctx, data) {
  const {
    hasBook = false, title = '', author = '', progress = 0,
    coverImage = null, batteryPercent = 85,
    coverImageData = null, coverThumbData = null,
    titleAsset = null, authorAsset = null,
  } = data

  const assets = []
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)

  // ── Battery (top-right) ──
  debugContainer(ctx, STATUS_BAR)
  const batPos = { x: 433, y: 18 }
  const batAsset = getAsset('battery.frame')
  if (batAsset) {
    blitAsset(ctx, batAsset, batPos.x, batPos.y)
    drawBatteryFill(ctx, batPos.x, batPos.y, batteryPercent)
  }
  assets.push({ name: 'battery.frame', type: 'dynamic', bounds: { x: batPos.x, y: batPos.y, w: BAT.w, h: BAT.h } })

  // ── Cover thumbnail (fixed container 240×400, centered) ──
  const thumbW = HOME_THUMB.w   // 240
  const thumbH = HOME_THUMB.h   // 400
  const thumbX = Math.round((W - thumbW) / 2)  // centered: (480-240)/2 = 120
  const thumbY = HL.coverTopY                    // 44
  const thumbCY = thumbY + thumbH / 2           // vertical center for arrows

  debugRect(ctx, thumbX, thumbY, thumbW, thumbH)

  if (coverThumbData?.imageData) {
    // Thumbnail from .kb — already 240×400 with contain fit
    blitAsset(ctx, coverThumbData, thumbX, thumbY)
    // Border
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 2
    ctx.strokeRect(thumbX - 3, thumbY - 3, thumbW + 6, thumbH + 6)
    ctx.lineWidth = 1
    ctx.strokeRect(thumbX - 1, thumbY - 1, thumbW + 2, thumbH + 2)
  } else if (coverImageData?.imageData) {
    // Full cover from .kb, scale down to fit container
    const tmpCanvas = new OffscreenCanvas(coverImageData.w, coverImageData.h)
    const tmpCtx = tmpCanvas.getContext('2d')
    tmpCtx.putImageData(coverImageData.imageData, 0, 0)
    // Fit contain
    const imgAspect = coverImageData.w / coverImageData.h
    const containerAspect = thumbW / thumbH
    let dw, dh
    if (imgAspect > containerAspect) {
      dw = thumbW; dh = Math.round(thumbW / imgAspect)
    } else {
      dh = thumbH; dw = Math.round(thumbH * imgAspect)
    }
    const dx = thumbX + Math.round((thumbW - dw) / 2)
    const dy = thumbY + Math.round((thumbH - dh) / 2)
    ctx.drawImage(tmpCanvas, dx, dy, dw, dh)
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 2
    ctx.strokeRect(dx - 3, dy - 3, dw + 6, dh + 6)
    ctx.lineWidth = 1
    ctx.strokeRect(dx - 1, dy - 1, dw + 2, dh + 2)
  } else if (coverImage) {
    // Legacy: Image element
    const imgAspect = coverImage.width / coverImage.height
    const containerAspect = thumbW / thumbH
    let dw, dh
    if (imgAspect > containerAspect) {
      dw = thumbW; dh = Math.round(thumbW / imgAspect)
    } else {
      dh = thumbH; dw = Math.round(thumbH * imgAspect)
    }
    const dx = thumbX + Math.round((thumbW - dw) / 2)
    const dy = thumbY + Math.round((thumbH - dh) / 2)
    ctx.drawImage(coverImage, dx, dy, dw, dh)
    ctx.strokeStyle = 'black'
    ctx.lineWidth = 2
    ctx.strokeRect(dx - 3, dy - 3, dw + 6, dh + 6)
    ctx.lineWidth = 1
    ctx.strokeRect(dx - 1, dy - 1, dw + 2, dh + 2)
  } else {
    // No cover placeholder
    ctx.fillStyle = 'black'
    ctx.fillRect(thumbX, thumbY, thumbW, thumbH)
    ctx.fillStyle = 'white'
    ctx.font = '20px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('No Cover', thumbX + thumbW / 2, thumbY + thumbH / 2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
  }
  assets.push({ name: 'cover_thumb', type: 'prerendered', bounds: { x: thumbX, y: thumbY, w: thumbW, h: thumbH } })

  // ── Arrows (centered in gap between safe edge and thumbnail) ──
  // Left gap: SAFE_X to thumbX. Center arrow in that gap.
  // Right gap: thumbX+thumbW to W-SAFE_X.
  const leftGapCenter = SAFE_X + Math.round((thumbX - SAFE_X) / 2)
  const rightGapCenter = thumbX + thumbW + Math.round((W - SAFE_X - thumbX - thumbW) / 2)
  const arrowLA = getAsset('arrow.left'), arrowRA = getAsset('arrow.right')
  const aLx = Math.round(leftGapCenter - ARROW.w / 2)
  const aRx = Math.round(rightGapCenter - ARROW.w / 2)
  const aY = Math.round(thumbCY - ARROW.h / 2)
  if (arrowLA) blitAsset(ctx, arrowLA, aLx, aY)
  if (arrowRA) blitAsset(ctx, arrowRA, aRx, aY)
  assets.push({ name: 'arrow.left', type: 'prerendered', bounds: { x: aLx, y: aY, w: ARROW.w, h: ARROW.h } })
  assets.push({ name: 'arrow.right', type: 'prerendered', bounds: { x: aRx, y: aY, w: ARROW.w, h: ARROW.h } })

  // ── Title (BL anchor, fixed Y) ──
  // Title bottom at titleBottomY, grows upward
  const titleX = HL.infoX
  if (titleAsset?.imageData) {
    const b = blitAnchored(ctx, titleAsset, titleX, HL.titleBottomY, 'BL')
    if (b) assets.push({ name: 'home_title', type: 'prerendered', bounds: b })
  } else if (hasBook) {
    // Fallback canvas text
    ctx.fillStyle = 'black'
    ctx.font = 'bold 22px sans-serif'
    ctx.textBaseline = 'top'
    const titleY = HL.titleBottomY - HL.titleLineH * HL.titleMaxLines
    const words = title.split(' ')
    let line = '', ly = titleY, lines = 0
    for (const word of words) {
      const test = line + (line ? ' ' : '') + word
      if (ctx.measureText(test).width > HL.infoW && line && lines < HL.titleMaxLines - 1) {
        ctx.fillText(line, titleX, ly); ly += HL.titleLineH; lines++; line = word
      } else { line = test }
    }
    if (line) ctx.fillText(line, titleX, ly)
    assets.push({ name: 'home_title', type: 'canvas', bounds: { x: titleX, y: titleY, w: HL.infoW, h: HL.titleLineH * HL.titleMaxLines } })
  }

  // ── Author (BL anchor, fixed Y) ──
  if (authorAsset?.imageData) {
    const b = blitAnchored(ctx, authorAsset, titleX, HL.authorY + HL.authorH, 'BL')
    if (b) assets.push({ name: 'home_author', type: 'prerendered', bounds: b })
  } else {
    ctx.fillStyle = 'black'
    ctx.font = '17px sans-serif'
    ctx.textBaseline = 'top'
    ctx.fillText(hasBook ? author.toUpperCase() : 'Add a book via Library', titleX, HL.authorY)
    assets.push({ name: 'home_author', type: 'canvas', bounds: { x: titleX, y: HL.authorY, w: HL.infoW, h: HL.authorH } })
  }

  // ── Progress label (BC anchor) + bar frame (BL anchor) ──
  if (hasBook) {
    const labelAssets = blitProgressLabel(ctx, W / 2, HL.progressLabelY, progress)
    assets.push(...labelAssets)

    const progAsset = getAsset('progress.frame')
    if (progAsset) {
      blitAsset(ctx, progAsset, HL.infoX - 1, HL.progressBarY)
      drawProgressBarFill(ctx, HL.infoX - 1, HL.progressBarY, progress)
    }
    assets.push({ name: 'progress.frame', type: 'dynamic', bounds: { x: HL.infoX - 1, y: HL.progressBarY, w: PROG.w, h: PROG.h } })
  }

  // ── Help bar ──
  const helpBarY = slotBounds(homeHelpEls[0].slot).y - 1
  ctx.fillStyle = 'black'
  ctx.fillRect(SAFE_X, helpBarY, SAFE_W, 1)
  for (const el of homeHelpEls) {
    const b = slotBounds(el.slot)
    const slotAsset = getAsset(el.ref)
    if (slotAsset) blitAsset(ctx, slotAsset, b.x, b.y)
    assets.push({ name: el.ref, type: 'prerendered', bounds: b })
  }

  return assets
}
