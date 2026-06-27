// Unified UI drawing engine
// All screens + components exported from here

export { setDebugBorders, getDebugBorders } from './draw.js'
export {
  drawBattery, drawBatteryFrame, drawBatteryFill,
  drawProgressBar, drawProgressBarFrame, drawProgressBarFill, drawProgressLabel,
  drawTriangle,
  drawNavBar, drawHelpBar, drawBottomBar, drawNavSlot,
  drawSubHeader, renderList, barSlotAssets,
  truncate, wordWrap,
  debugRect, debugContainer,
  renderSettingsItem, renderInfoItem, renderTextItem, renderBookItem, renderGalleryItem,
} from './draw.js'

export * from './layout.js'

export { renderHome } from './screens/home.js'
export { renderLibrary } from './screens/library.js'
export { renderSettings, renderSettingsDevice } from './screens/settings.js'
export { renderGalleryList, renderGalleryThumb, renderGalleryFull } from './screens/gallery.js'
export { renderReader } from './screens/reader.js'
export { renderBookMenu, renderBookChapters } from './screens/book-menu.js'

// Definitions API
export {
  default as defs,
  W, H, SAFE, SAFE_X, SAFE_Y, SAFE_W, SAFE_H,
  containers, dynamic, assets, fonts,
  containerSize, asset, assetText, fontCSS,
  screenLayout, slotBounds, elementBounds,
  buildHelpSlots, helpSlotElements,
} from './defs.js'
