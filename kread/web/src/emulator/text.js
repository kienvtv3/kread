// Canvas-based rendering for emulator
// Renders full screen on a hidden canvas, then quantizes to 2-bit screen buffer

let _canvas = null
let _ctx = null

function getCanvas() {
  if (!_canvas) {
    _canvas = document.createElement('canvas')
    _canvas.width = 480
    _canvas.height = 800
    _ctx = _canvas.getContext('2d')
  }
  return _ctx
}

/**
 * Get the shared offscreen canvas context for drawing.
 * Draw everything here, then call flushToScreen() to quantize.
 */
export function beginFrame() {
  const ctx = getCanvas()
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, 480, 800)
  return ctx
}

/**
 * Quantize the offscreen canvas to the 2-bit screen buffer.
 * Call after all drawing is done.
 */
export function flushToScreen(screen) {
  const ctx = getCanvas()
  const imageData = ctx.getImageData(0, 0, 480, 800)
  const pixels = imageData.data

  for (let y = 0; y < 800; y++) {
    for (let x = 0; x < 480; x++) {
      const i = (y * 480 + x) * 4
      const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114

      let level
      if (gray < 64) level = 0       // black
      else if (gray < 140) level = 1  // dark gray
      else if (gray < 200) level = 2  // light gray
      else level = 3                   // white

      screen.setPixel(x, y, level)
    }
  }
  screen._version++
}

// Legacy helpers (still useful for simple cases)
export function measureText(text, font = '20px sans-serif') {
  const ctx = getCanvas()
  ctx.font = font
  return Math.ceil(ctx.measureText(text).width)
}
