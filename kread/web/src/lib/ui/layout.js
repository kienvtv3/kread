// Screen layout constants — derived from definitions.yaml

export {
  W, H, SAFE, SAFE_X, SAFE_Y, SAFE_W, SAFE_H,
  HELP_BAR_Y, HELP_BAR_H, HELP_SLOT_W, HELP_SLOT_H,
} from './defs.js'

import { W, SAFE_X, SAFE_Y, SAFE_W, HELP_BAR_Y, HELP_BAR_H } from './defs.js'

// Containers used in renderers
export const STATUS_BAR = { y: SAFE_Y, h: 28, pad: [6, 16, 0, 16] }
export const SUB_HEADER = { y: SAFE_Y, h: 53, pad: [16, 24, 8, 24] }
export const SUB_BODY = { y: SAFE_Y + 53, h: HELP_BAR_Y - (SAFE_Y + 53), pad: [4, 24, 0, 24] }
export const SUB_HELP = { y: HELP_BAR_Y, h: HELP_BAR_H, pad: [8, 24, 0, 24] }

// Reader
export const READER_CONTENT = { y: SAFE_Y, h: 800 - 8 - 8 - 28, pad: [20, 28, 8, 28] }
export const READER_STATUS = { y: 800 - 8 - 28, h: 28, pad: [4, 28, 6, 28] }

// Home layout — fixed positions, bottom-up
// Thumbnail container is fixed 240×400, cover scales to fit inside
export const HOME_ARROW_W = 30
export const HOME_THUMB = { w: 300, h: 400 }  // fixed thumbnail container (supports 3:4 aspect)
export const HOME_LAYOUT = {
  // Cover area
  coverTopY: SAFE_Y + 56,        // top of cover area (pushed down for spacing)
  thumbW: 240,
  thumbH: 400,
  // Arrow gap: arrows centered in gap between safe edge and thumb container
  // Gap = (W - thumbW) / 2 - SAFE.left = (480-240)/2 - 8 = 112px each side
  // Arrow at center of gap: SAFE.left + gap/2
  arrowGap: 112,                  // gap between safe edge and thumb
  // Info area — fixed Y positions (bottom-up from help bar)
  // Help bar: y=752
  progressBarY: 700,              // progress bar frame
  progressLabelY: 696,            // progress label bottom (BC anchor)
  authorY: 611,                   // author baseline
  authorH: 22,
  titleBottomY: 603,              // title bottom edge (BL anchor, grows up)
  titleLineH: 28,
  titleMaxLines: 2,
  // Padding
  infoX: 28,
  infoW: 424,  // W - 56
}

// Legacy compat
export const BOTTOM_BAR_Y = HELP_BAR_Y
export const BOTTOM_BAR_H = HELP_BAR_H

export function contentRect(c) {
  const [pt, pr, pb, pl] = c.pad
  return { x: pl, y: c.y + pt, w: W - pl - pr, h: c.h - pt - pb }
}
