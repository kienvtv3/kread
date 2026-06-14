// 480×800 2bpp screen buffer (4 grayscale levels)
// Each pixel = 2 bits: 0=black, 1=dark gray, 2=light gray, 3=white

const WIDTH = 480
const HEIGHT = 800
const BYTES_PER_ROW = WIDTH / 4  // 2bpp: 4 pixels per byte

export function createScreen() {
  const buffer = new Uint8Array(BYTES_PER_ROW * HEIGHT)
  buffer.fill(0xFF) // all white

  return {
    width: WIDTH,
    height: HEIGHT,
    buffer,
    _version: 0,

    clear(level = 3) {
      const byte = (level << 6) | (level << 4) | (level << 2) | level
      buffer.fill(byte)
      this._version++
    },

    setPixel(x, y, level) {
      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return
      const byteIndex = y * BYTES_PER_ROW + Math.floor(x / 4)
      const bitOffset = (3 - (x % 4)) * 2
      buffer[byteIndex] = (buffer[byteIndex] & ~(0x03 << bitOffset)) | (level << bitOffset)
    },

    getPixel(x, y) {
      if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) return 3
      const byteIndex = y * BYTES_PER_ROW + Math.floor(x / 4)
      const bitOffset = (3 - (x % 4)) * 2
      return (buffer[byteIndex] >> bitOffset) & 0x03
    },

    fillRect(x, y, w, h, level) {
      for (let py = y; py < y + h && py < HEIGHT; py++) {
        for (let px = x; px < x + w && px < WIDTH; px++) {
          this.setPixel(px, py, level)
        }
      }
      this._version++
    },

    // Render to ImageData for canvas
    toImageData() {
      const imageData = new ImageData(WIDTH, HEIGHT)
      const colors = [
        [0x00, 0x00, 0x00], // 0 = black
        [0x55, 0x55, 0x55], // 1 = dark gray
        [0xAA, 0xAA, 0xAA], // 2 = light gray
        [0xFF, 0xFF, 0xFF], // 3 = white
      ]

      for (let y = 0; y < HEIGHT; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const level = this.getPixel(x, y)
          const [r, g, b] = colors[level]
          const i = (y * WIDTH + x) * 4
          imageData.data[i] = r
          imageData.data[i + 1] = g
          imageData.data[i + 2] = b
          imageData.data[i + 3] = 255
        }
      }
      return imageData
    }
  }
}
