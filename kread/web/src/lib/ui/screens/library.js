import { W, H, SAFE_X, SAFE_W } from '../layout.js'
import { drawHelpBar, renderList, renderBookItem, debugRect } from '../draw.js'
import { SUB_HEADER, SUB_HELP } from '../layout.js'
import { assetText, slotBounds, buildHelpSlots, helpSlotElements } from '../defs.js'
import { getAsset, blitAsset } from '../asset-loader.js'

const LIB_HELP = buildHelpSlots('library')
const libHelpEls = helpSlotElements('library')

export function renderLibrary(ctx, data) {
  const { books = [], selectedIndex = 0, page = 0, perPage = 8 } = data
  const assets = []

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'top'

  // Header — blit pre-rendered
  const hdrAsset = getAsset('hdr.library')
  const hdrPos = { x: SAFE_X, y: SUB_HEADER.y }
  if (hdrAsset) blitAsset(ctx, hdrAsset, hdrPos.x, hdrPos.y)
  ctx.fillStyle = 'black'
  ctx.fillRect(SAFE_X, SUB_HEADER.y + SUB_HEADER.h - 1, SAFE_W, 1)
  assets.push({ name: 'hdr.library', type: 'prerendered', bounds: { x: hdrPos.x, y: hdrPos.y, w: SAFE_W, h: SUB_HEADER.h } })

  const listTop = SUB_HEADER.y + SUB_HEADER.h
  if (books.length === 0) {
    const emptyAsset = getAsset('empty.no_books')
    const emptySub = getAsset('empty.no_books_sub')
    if (emptyAsset) blitAsset(ctx, emptyAsset, SAFE_X + 14, listTop + 30)
    if (emptySub) blitAsset(ctx, emptySub, SAFE_X + 14, listTop + 64)
    assets.push({ name: 'empty.no_books', type: 'prerendered', bounds: { x: SAFE_X + 14, y: listTop + 30, w: SAFE_W - 28, h: 54 } })
  } else {
    const pageStart = page * perPage
    renderList(ctx, {
      items: books.slice(pageStart, pageStart + perPage), selectedIndex, perPage,
      rowType: 'double', renderItem: renderBookItem,
      totalItems: books.length, globalIndex: page * perPage + selectedIndex,
    })
    assets.push({ name: 'list', type: 'canvas', bounds: { x: SAFE_X, y: listTop, w: SAFE_W, h: SUB_HELP.y - listTop } })
  }

  // Help bar — blit pre-rendered slots
  const barY = slotBounds(libHelpEls[0].slot).y - 1
  ctx.fillStyle = 'black'
  ctx.fillRect(SAFE_X, barY, SAFE_W, 1)
  for (const el of libHelpEls) {
    const b = slotBounds(el.slot)
    const slotAsset = getAsset(el.ref)
    if (slotAsset) blitAsset(ctx, slotAsset, b.x, b.y)
    assets.push({ name: el.ref, type: 'prerendered', bounds: b })
  }

  return assets
}
