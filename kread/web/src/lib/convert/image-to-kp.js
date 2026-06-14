import { createCanvas, loadImage } from '@napi-rs/canvas'
import { quantizeGamma, quantizeAtkinson } from '../eink/quantize.js'
import { pixelsToPortraitPlanes, pixelsToLandscapePlanes, encodeKpV2 } from '../eink/encoder.js'

/**
 * Convert an image to .kp binary (2-bit grayscale).
 *
 * @param {string|Buffer} input - file path or buffer
 * @param {object} opts
 * @param {number} [opts.width=480] - target width
 * @param {number} [opts.height=800] - target height
 * @param {string} [opts.dither='atkinson'] - 'gamma'|'atkinson'
 * @param {number} [opts.gamma=1.8]
 * @param {boolean} [opts.landscape=false] - rotate portrait to landscape
 * @param {string} [opts.fit='contain'] - 'contain'|'cover'|'stretch'
 * @param {number} [opts.contentFlags=0x02] - HAS_IMAGE
 * @returns {Promise<Uint8Array>} .kp binary (2-bit grayscale)
 */
export async function imageToKp(input, opts = {}) {
  const {
    width = 480, height = 800,
    dither = 'atkinson', gamma = 1.8,
    landscape = false, fit = 'contain',
    contentFlags = 0x02,
  } = opts

  // 1. Load image
  const img = await loadImage(input)

  // 2. Draw onto canvas with fit mode
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, width, height)

  // Calculate fit dimensions
  let dw, dh, dx, dy
  const imgAspect = img.width / img.height
  const canvasAspect = width / height

  if (fit === 'stretch') {
    dw = width; dh = height; dx = 0; dy = 0
  } else if (fit === 'cover') {
    if (imgAspect > canvasAspect) {
      dh = height; dw = Math.round(height * imgAspect)
    } else {
      dw = width; dh = Math.round(width / imgAspect)
    }
    dx = Math.round((width - dw) / 2)
    dy = Math.round((height - dh) / 2)
  } else { // contain
    if (imgAspect > canvasAspect) {
      dw = width; dh = Math.round(width / imgAspect)
    } else {
      dh = height; dw = Math.round(height * imgAspect)
    }
    dx = Math.round((width - dw) / 2)
    dy = Math.round((height - dh) / 2)
  }

  ctx.drawImage(img, dx, dy, dw, dh)

  // 3. Get pixels
  const imageData = ctx.getImageData(0, 0, width, height)

  // 4. Quantize to 2-bit (4 levels)
  const pixels = dither === 'atkinson'
    ? quantizeAtkinson(imageData.data, width, height, gamma)
    : quantizeGamma(imageData.data, width, height, gamma)

  // 5. Pack planes and encode (portrait for covers/thumbnails)
  const { bw, gs } = pixelsToPortraitPlanes(pixels, width, height)
  return encodeKpV2({ width, height, bitDepth: 2, contentFlags, compress: false, bw, gs })
}
