import {
  W, H, SAFE_X, SAFE_W, SAFE, SAFE_Y,
  HOME_ARROW_W, HOME_LAYOUT, HELP_BAR_Y,
  SUB_HEADER, SUB_HELP,
} from '../layout.js'
import { renderList, renderGalleryItem, debugRect } from '../draw.js'
import { dynamic, slotBounds, buildHelpSlots, helpSlotElements } from '../defs.js'
import { getAsset, blitAsset } from '../asset-loader.js'

const ARROW = dynamic['arrow.left']

/**
 * Compose counter "5/10" from tight-fit pre-rendered glyphs, centered at (cx, y).
 * Digits touch naturally (GAP=0). Space glyphs provide natural spacing around "/".
 * Supports up to 999/999.
 */
function blitCounter(ctx, cx, y, current, total) {
  const assets = []

  // Build glyph sequence: digits + space + slash + space + digits
  const glyphs = []
  for (const ch of String(current)) glyphs.push(`sm.${ch}`)
  glyphs.push('sm.space')
  glyphs.push('sm.slash')
  glyphs.push('sm.space')
  for (const ch of String(total)) glyphs.push(`sm.${ch}`)

  // Measure total width (no extra gap — glyphs are tight-fit)
  let totalW = 0
  for (const key of glyphs) {
    const a = getAsset(key)
    totalW += a?.w || 4
  }

  // Blit left to right, centered
  let curX = Math.round(cx - totalW / 2)
  for (const key of glyphs) {
    const a = getAsset(key)
    if (a) {
      blitAsset(ctx, a, curX, y)
      assets.push({ name: key, type: 'prerendered', bounds: { x: curX, y, w: a.w, h: a.h } })
      curX += a.w
    }
  }
  return assets
}

const THUMB_HELP = buildHelpSlots('gallery_thumb')
const thumbHelpEls = helpSlotElements('gallery_thumb')
const LIST_HELP = buildHelpSlots('gallery_list')
const listHelpEls = helpSlotElements('gallery_list')
const VIEW_HELP = buildHelpSlots('gallery_view')
const viewHelpEls = helpSlotElements('gallery_view')

function renderHelpBar(ctx, helpEls) {
  const barY = slotBounds(helpEls[0].slot).y - 1
  ctx.fillStyle = 'black'
  ctx.fillRect(SAFE_X, barY, SAFE_W, 1)
  const assets = []
  for (const el of helpEls) {
    const b = slotBounds(el.slot)
    const a = getAsset(el.ref)
    if (a) blitAsset(ctx, a, b.x, b.y)
    assets.push({ name: el.ref, type: 'prerendered', bounds: b })
  }
  return assets
}

export function renderGalleryThumb(ctx, data) {
  const { item, currentPage = 0, totalItems = 0 } = data
  const assets = []

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)

  // Image thumbnail — 300×400, centered vertically in available space
  // Available: SAFE_Y to HELP_BAR_Y (8 to 752 = 744px)
  // Thumb 400 + title 30 + counter 20 + gaps 30 = 480px → centered in 744
  const thumbW = 300, thumbH = 400
  const totalContent = thumbH + 60  // thumb + title area
  const contentTopY = SAFE_Y + Math.round((HELP_BAR_Y - SAFE_Y - totalContent) / 2)
  const thumbX = Math.round((W - thumbW) / 2)
  const thumbTopY = contentTopY
  const thumbCY = thumbTopY + thumbH / 2

  // Placeholder image
  ctx.fillStyle = '#ddd'
  ctx.fillRect(thumbX, thumbTopY, thumbW, thumbH)
  ctx.fillStyle = '#888'
  ctx.font = '16px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('[image]', thumbX + thumbW / 2, thumbTopY + thumbH / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'

  // Border
  ctx.strokeStyle = 'black'
  ctx.lineWidth = 2
  ctx.strokeRect(thumbX - 3, thumbTopY - 3, thumbW + 6, thumbH + 6)
  ctx.lineWidth = 1
  ctx.strokeRect(thumbX - 1, thumbTopY - 1, thumbW + 2, thumbH + 2)

  assets.push({ name: 'gallery_image', type: 'canvas', bounds: { x: thumbX, y: thumbTopY, w: thumbW, h: thumbH } })

  // Arrows — centered in gap between bezel and thumbnail
  const leftGapCenter = SAFE_X + Math.round((thumbX - SAFE_X) / 2)
  const rightGapCenter = thumbX + thumbW + Math.round((W - SAFE_X - thumbX - thumbW) / 2)
  const arrowLA = getAsset('arrow.left'), arrowRA = getAsset('arrow.right')
  const aLx = Math.round(leftGapCenter - ARROW.w / 2)
  const aRx = Math.round(rightGapCenter - ARROW.w / 2)
  const aY = Math.round(thumbCY - ARROW.h / 2)
  if (arrowLA) blitAsset(ctx, arrowLA, aLx, aY)
  if (arrowRA) blitAsset(ctx, arrowRA, aRx, aY)
  assets.push({ name: 'arrow.left', type: 'prerendered', bounds: { x: aLx, y: aY, w: ARROW.w, h: ARROW.h } })
  assets.push({ name: 'arrow.right', type: 'prerendered', bounds: { x: aRx, y: aRx, w: ARROW.w, h: ARROW.h } })

  // Title — centered below image
  const titleY = thumbTopY + thumbH + 20
  if (item) {
    ctx.fillStyle = 'black'
    ctx.font = 'bold 20px sans-serif'
    ctx.textAlign = 'center'
    const starSuffix = item.isStarred ? '  \u2605' : ''
    ctx.fillText(item.name + starSuffix, W / 2, titleY)
    ctx.textAlign = 'left'
    assets.push({ name: 'gallery_title', type: 'canvas', bounds: { x: SAFE_X, y: titleY, w: SAFE_W, h: 24 } })
  }

  // Counter — composed from pre-rendered small digit glyphs: "5 / 10"
  const counterAssets = blitCounter(ctx, W / 2, titleY + 28, currentPage + 1, totalItems)
  assets.push(...counterAssets)

  // Help bar
  const barY = slotBounds(thumbHelpEls[0].slot).y - 1
  ctx.fillStyle = 'black'
  ctx.fillRect(SAFE_X, barY, SAFE_W, 1)
  for (const el of thumbHelpEls) {
    const b = slotBounds(el.slot)
    const a = getAsset(el.ref)
    if (a) blitAsset(ctx, a, b.x, b.y)
    assets.push({ name: el.ref, type: 'prerendered', bounds: b })
  }

  return assets
}

export function renderGalleryList(ctx, data) {
  const { items = [], selectedIndex = 0, page = 0, perPage = 12 } = data
  const assets = []

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'top'

  const hdr = getAsset('hdr.gallery')
  if (hdr) blitAsset(ctx, hdr, SAFE_X, SUB_HEADER.y)
  ctx.fillStyle = 'black'
  ctx.fillRect(SAFE_X, SUB_HEADER.y + SUB_HEADER.h - 1, SAFE_W, 1)
  assets.push({ name: 'hdr.gallery', type: 'prerendered', bounds: { x: SAFE_X, y: SUB_HEADER.y, w: SAFE_W, h: SUB_HEADER.h } })

  const listTop = SUB_HEADER.y + SUB_HEADER.h
  if (items.length === 0) {
    const e1 = getAsset('empty.no_images'), e2 = getAsset('empty.no_images_sub')
    if (e1) blitAsset(ctx, e1, SAFE_X + 14, listTop + 30)
    if (e2) blitAsset(ctx, e2, SAFE_X + 14, listTop + 64)
    assets.push({ name: 'empty.no_images', type: 'prerendered', bounds: { x: SAFE_X + 14, y: listTop + 30, w: SAFE_W - 28, h: 54 } })
  } else {
    const ps = page * perPage
    renderList(ctx, {
      items: items.slice(ps, ps + perPage), selectedIndex, perPage,
      renderItem: renderGalleryItem, totalItems: items.length,
      globalIndex: ps + selectedIndex,
    })
    assets.push({ name: 'list', type: 'canvas', bounds: { x: SAFE_X, y: listTop, w: SAFE_W, h: SUB_HELP.y - listTop } })
  }

  assets.push(...renderHelpBar(ctx, listHelpEls))
  return assets
}

export function renderGalleryView(ctx, data) {
  const { item, currentPage = 0, totalItems = 0 } = data
  const assets = []

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'black'

  const HL = HOME_LAYOUT
  const arrowW = HOME_ARROW_W
  const coverTopY = SAFE_Y + HL.coverTopPad
  const coverBotY = HELP_BAR_Y - 80
  const titleY = coverBotY + Math.floor((HELP_BAR_Y - coverBotY - 20) / 2)
  const coverH = coverBotY - coverTopY
  const coverAreaW = SAFE_W - arrowW * 2
  const coverW = Math.min(Math.round(coverH * 0.65), coverAreaW - 20)
  const coverCX = W / 2
  const coverX = Math.round(coverCX - coverW / 2)
  const coverCY = coverTopY + coverH / 2

  ctx.fillStyle = '#ddd'
  ctx.fillRect(coverX, coverTopY, coverW, coverH)
  ctx.fillStyle = '#888'
  ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('[image]', coverCX, coverCY)
  ctx.textAlign = 'left'; ctx.textBaseline = 'top'
  assets.push({ name: 'gallery_image', type: 'canvas', bounds: { x: coverX, y: coverTopY, w: coverW, h: coverH } })

  ctx.strokeStyle = 'black'
  ctx.lineWidth = 3; ctx.strokeRect(coverX - 5, coverTopY - 5, coverW + 10, coverH + 10)
  ctx.lineWidth = 1; ctx.strokeRect(coverX - 1, coverTopY - 1, coverW + 2, coverH + 2)

  // Arrows — blit pre-rendered
  const aL = getAsset('arrow.left'), aR = getAsset('arrow.right')
  const arrowLX = SAFE_X + arrowW / 2, arrowRX = W - SAFE.right - arrowW / 2
  const aLx = Math.round(arrowLX - ARROW.w / 2), aLy = Math.round(coverCY - ARROW.h / 2)
  const aRx = Math.round(arrowRX - ARROW.w / 2), aRy = aLy
  if (aL) blitAsset(ctx, aL, aLx, aLy)
  if (aR) blitAsset(ctx, aR, aRx, aRy)
  assets.push({ name: 'arrow.left', type: 'dynamic', bounds: { x: aLx, y: aLy, w: ARROW.w, h: ARROW.h } })
  assets.push({ name: 'arrow.right', type: 'dynamic', bounds: { x: aRx, y: aRy, w: ARROW.w, h: ARROW.h } })

  if (item) {
    ctx.fillStyle = 'black'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'
    ctx.fillText(item.name + (item.isStarred ? '  \u2605' : ''), W / 2, titleY)
    ctx.textAlign = 'left'
    assets.push({ name: 'gallery_title', type: 'prerendered', bounds: { x: SAFE_X, y: titleY, w: SAFE_W, h: 20 } })
  }

  assets.push(...renderHelpBar(ctx, viewHelpEls))
  return assets
}

export function renderGalleryFull(ctx, data) {
  const { item } = data
  // Full screen — just the image, no UI, no hinting
  ctx.fillStyle = '#ddd'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#888'
  ctx.font = '16px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('[image]', W / 2, H / 2)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  return [{ name: 'gallery_image', type: 'canvas', bounds: { x: 0, y: 0, w: W, h: H } }]
}
