import { W, H, SAFE_X, SAFE_W } from '../layout.js'
import { renderList, renderSettingsItem, renderInfoItem } from '../draw.js'
import { SUB_HEADER, SUB_HELP } from '../layout.js'
import { assetText, slotBounds, buildHelpSlots, helpSlotElements } from '../defs.js'
import { getAsset, blitAsset } from '../asset-loader.js'

const SETTINGS_HELP = buildHelpSlots('settings')
const settingsHelpEls = helpSlotElements('settings')
const DEVICE_HELP = buildHelpSlots('settings_device')
const deviceHelpEls = helpSlotElements('settings_device')

function renderHeader(ctx, key) {
  const hdrAsset = getAsset(key)
  if (hdrAsset) blitAsset(ctx, hdrAsset, SAFE_X, SUB_HEADER.y)
  ctx.fillStyle = 'black'
  ctx.fillRect(SAFE_X, SUB_HEADER.y + SUB_HEADER.h - 1, SAFE_W, 1)
}

function renderHelpBar(ctx, helpEls, dynSlots) {
  const barY = slotBounds(helpEls[0].slot).y - 1
  ctx.fillStyle = 'black'
  ctx.fillRect(SAFE_X, barY, SAFE_W, 1)
  const assets = []
  for (const el of helpEls) {
    const b = slotBounds(el.slot)
    // Check if this slot is active in dynSlots
    if (dynSlots && !dynSlots[el.slot.index]) continue
    const slotAsset = getAsset(el.ref)
    if (slotAsset) blitAsset(ctx, slotAsset, b.x, b.y)
    assets.push({ name: el.ref, type: 'prerendered', bounds: b })
  }
  return assets
}

export function renderSettings(ctx, data) {
  const { items = [], selectedIndex = 0 } = data
  const assets = []

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'top'
  renderHeader(ctx, 'hdr.settings')
  assets.push({ name: 'hdr.settings', type: 'prerendered', bounds: { x: SAFE_X, y: SUB_HEADER.y, w: SAFE_W, h: SUB_HEADER.h } })

  renderList(ctx, { items, selectedIndex, perPage: 12, renderItem: renderSettingsItem })
  const listTop = SUB_HEADER.y + SUB_HEADER.h
  assets.push({ name: 'list', type: 'canvas', bounds: { x: SAFE_X, y: listTop, w: SAFE_W, h: SUB_HELP.y - listTop } })

  const item = items[selectedIndex]
  const active = [true, item?.type === 'action', item?.type === 'value' || item?.type === 'toggle', true]
  assets.push(...renderHelpBar(ctx, settingsHelpEls, active))
  return assets
}

export function renderSettingsDevice(ctx, data) {
  const { items = [] } = data
  const assets = []

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'top'
  renderHeader(ctx, 'hdr.settings_device')
  assets.push({ name: 'hdr.settings_device', type: 'prerendered', bounds: { x: SAFE_X, y: SUB_HEADER.y, w: SAFE_W, h: SUB_HEADER.h } })

  renderList(ctx, { items, selectedIndex: -1, perPage: 12, selectable: false, renderItem: renderInfoItem })
  const listTop = SUB_HEADER.y + SUB_HEADER.h
  assets.push({ name: 'list', type: 'canvas', bounds: { x: SAFE_X, y: listTop, w: SAFE_W, h: SUB_HELP.y - listTop } })

  assets.push(...renderHelpBar(ctx, deviceHelpEls))
  return assets
}
