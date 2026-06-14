// UI definitions loader — single source of truth from definitions.yaml
// Parsed at module init, provides lookup API for renderers.

import { parse } from 'yaml'
import yamlText from '../../../resources/definitions.yaml?raw'

const defs = parse(yamlText)

// ─── Display ────────────────────────────────────────────────
export const W = defs.display.width      // 480
export const H = defs.display.height     // 800
export const SAFE = defs.display.safe    // { top, bottom, left, right }
export const SAFE_X = SAFE.left
export const SAFE_Y = SAFE.top
export const SAFE_W = W - SAFE.left - SAFE.right
export const SAFE_H = H - SAFE.top - SAFE.bottom

// ─── Bars ───────────────────────────────────────────────────
const helpBar = defs.bars.help
export const HELP_BAR_Y = helpBar.y
export const HELP_BAR_H = helpBar.slot_h + 1  // slot_h + divider
export const HELP_SLOT_W = helpBar.slot_w
export const HELP_SLOT_H = helpBar.slot_h

// ─── Containers ─────────────────────────────────────────────
export const containers = defs.containers

export function containerSize(name) {
  const c = containers[name]
  if (!c) throw new Error(`Unknown container: ${name}`)
  return c
}

// ─── Dynamic components ─────────────────────────────────────
export const dynamic = defs.dynamic

// ─── Assets ─────────────────────────────────────────────────
export const assets = defs.assets

export function asset(key) {
  const a = assets[key]
  if (!a) throw new Error(`Unknown asset: ${key}`)
  return a
}

// Get text for asset in current language
export function assetText(key, lang = 'en') {
  const a = assets[key]
  if (!a) return key
  if (typeof a.text === 'string') return a.text
  if (a.text) return a.text[lang] || a.text.en || ''
  return a.text || ''
}

// ─── Screen layouts ─────────────────────────────────────────
export const screens = defs.screens

export function screenLayout(name) {
  const s = screens[name]
  if (!s) throw new Error(`Unknown screen: ${name}`)
  return s
}

// Resolve slot position: { x, y, w, h }
export function slotBounds(slotDef) {
  const bar = defs.bars[slotDef.bar]
  return {
    x: SAFE_X + bar.slot_w * slotDef.index,
    y: bar.y + 1,
    w: bar.slot_w,
    h: bar.slot_h,
  }
}

// Resolve element bounds from screen layout element
export function elementBounds(el) {
  if (el.slot) return slotBounds(el.slot)
  if (el.pos === 'computed') return null
  if (el.pos) {
    const d = dynamic[el.ref] || {}
    const a = assets[el.ref] || {}
    const c = a.container ? containers[a.container] : null
    const w = el.size?.w || d.w || c?.w || 0
    const h = el.size?.h || d.h || c?.h || 0
    return { x: el.pos.x, y: el.pos.y, w, h }
  }
  return null
}

// ─── Fonts ──────────────────────────────────────────────────
export const fonts = defs.fonts

export function fontCSS(name) {
  const f = fonts[name]
  if (!f) return '20px sans-serif'
  const weight = f.weight === 'bold' ? 'bold ' : ''
  return `${weight}${f.size}px ${f.family}, sans-serif`
}

// Build help bar slot array for drawHelpBar from screen layout
export function buildHelpSlots(screenName, lang = 'en') {
  const layout = screens[screenName]
  if (!layout) return [null, null, null, null]
  const slots = [null, null, null, null]
  for (const el of layout) {
    if (!el.slot) continue
    const text = assetText(el.ref, lang)
    if (!text) continue
    const a = assets[el.ref]
    const icon = a?.icon
    let direction = null, filled = false
    if (icon?.name) {
      const m = icon.name.match(/^tri_(\w+?)_(filled|hollow)$/)
      if (m) { direction = m[1]; filled = m[2] === 'filled' }
    }
    slots[el.slot.index] = direction ? { direction, filled, label: text } : text
  }
  return slots
}

// Get help slot elements from screen layout (for asset manifest)
export function helpSlotElements(screenName) {
  const layout = screens[screenName]
  if (!layout) return []
  return layout.filter(e => e.slot)
}

// Full defs object for advanced use
export default defs
