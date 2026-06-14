import { createScreen } from '../emulator/screen.js'

const screen = createScreen()
let version = $state(0)

function bumpVersion() {
  version = screen._version
}

/**
 * Write a 2-bit quantized pixel array to the screen buffer.
 * @param {Uint8Array} pixels - 2-bit values (0-3), width*height elements
 * @param {number} width
 * @param {number} height
 */
function writeQuantized(pixels, width, height) {
  screen.clear(3)
  for (let y = 0; y < height && y < screen.height; y++) {
    for (let x = 0; x < width && x < screen.width; x++) {
      screen.setPixel(x, y, pixels[y * width + x])
    }
  }
  bumpVersion()
}

function clear() {
  screen.clear(3)
  bumpVersion()
}

export const screenStore = {
  get screen() { return screen },
  get version() { return version },
  writeQuantized,
  clear,
  bumpVersion,
}
