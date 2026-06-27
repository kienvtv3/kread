import { W, H, SAFE_X, SAFE_W } from '../layout.js'
import { renderList, renderSettingsItem, renderTextItem } from '../draw.js'
import { SUB_HEADER, SUB_HELP } from '../layout.js'
import { assetText, slotBounds, buildHelpSlots, helpSlotElements } from '../defs.js'
import { getAsset, blitAsset } from '../asset-loader.js'

const MENU_HELP = buildHelpSlots('book_menu')
const menuHelpEls = helpSlotElements('book_menu')
const CHAP_HELP = buildHelpSlots('book_chapters')
const chapHelpEls = helpSlotElements('book_chapters')

function renderHeader(ctx, key) {
  const a = getAsset(key)
  if (a) blitAsset(ctx, a, SAFE_X, SUB_HEADER.y)
  ctx.fillStyle = 'black'
  ctx.fillRect(SAFE_X, SUB_HEADER.y + SUB_HEADER.h - 1, SAFE_W, 1)
}

function renderHelpBarSlots(ctx, helpEls, active) {
  const barY = slotBounds(helpEls[0].slot).y - 1
  ctx.fillStyle = 'black'
  ctx.fillRect(SAFE_X, barY, SAFE_W, 1)
  const assets = []
  for (const el of helpEls) {
    if (active && !active[el.slot.index]) continue
    const b = slotBounds(el.slot)
    const a = getAsset(el.ref)
    if (a) blitAsset(ctx, a, b.x, b.y)
    assets.push({ name: el.ref, type: 'prerendered', bounds: b })
  }
  return assets
}

export function renderBookMenu(ctx, data) {
  const { items = [], selectedIndex = 0 } = data
  const assets = []

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'top'
  renderHeader(ctx, 'hdr.book')
  assets.push({ name: 'hdr.book', type: 'prerendered', bounds: { x: SAFE_X, y: SUB_HEADER.y, w: SAFE_W, h: SUB_HEADER.h } })

  renderList(ctx, { items, selectedIndex, perPage: 12, renderItem: renderSettingsItem })
  const listTop = SUB_HEADER.y + SUB_HEADER.h
  assets.push({ name: 'list', type: 'canvas', bounds: { x: SAFE_X, y: listTop, w: SAFE_W, h: SUB_HELP.y - listTop } })

  const item = items[selectedIndex]
  const active = [true, item?.type === 'action', item?.type === 'value', true]
  assets.push(...renderHelpBarSlots(ctx, menuHelpEls, active))
  return assets
}

export function renderBookChapters(ctx, data) {
  const { chapters = [], selectedIndex = 0, page = 0, perPage = 12 } = data
  const assets = []

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'top'
  renderHeader(ctx, 'hdr.book_chapters')
  assets.push({ name: 'hdr.book_chapters', type: 'prerendered', bounds: { x: SAFE_X, y: SUB_HEADER.y, w: SAFE_W, h: SUB_HEADER.h } })

  const ps = page * perPage
  renderList(ctx, {
    items: chapters.slice(ps, ps + perPage),
    selectedIndex: selectedIndex - ps, perPage,
    renderItem: renderTextItem, totalItems: chapters.length, globalIndex: selectedIndex,
  })
  const listTop = SUB_HEADER.y + SUB_HEADER.h
  assets.push({ name: 'list', type: 'canvas', bounds: { x: SAFE_X, y: listTop, w: SAFE_W, h: SUB_HELP.y - listTop } })

  assets.push(...renderHelpBarSlots(ctx, chapHelpEls))
  return assets
}
