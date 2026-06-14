/**
 * E-ink plane encoder for Xteink X4 (SSD1677, 800×480).
 *
 * Canonical convention (matches display hardware directly):
 *   Level 0 = black  → (bw=0, gs=0) → no bits set
 *   Level 1 = dark   → (bw=0, gs=1) → gs bit set
 *   Level 2 = light  → (bw=1, gs=0) → bw bit set
 *   Level 3 = white  → (bw=1, gs=1) → both bits set
 *
 *   bw = level >> 1,  gs = level & 1
 *
 * Firmware writes planes directly to BW RAM and RED RAM without inversion.
 *
 * Portrait (480×800) → Landscape (800×480) rotation:
 *   portrait (px, py) → landscape (lx, ly) = (py, pw - 1 - px)
 */

import lz4 from 'lz4js';
import { quantizeGamma, quantizeFloydSteinberg } from './quantize.js';

// ---------------------------------------------------------------------------
// LZ4 raw block compression (firmware-compatible)
// ---------------------------------------------------------------------------

function compressBlock(src) {
  const input = src instanceof Buffer ? new Uint8Array(src) : src;
  const maxSize = lz4.compressBound(input.length);
  const dst = new Uint8Array(maxSize);
  const hashTable = new Int32Array(65536);
  const written = lz4.compressBlock(input, dst, 0, input.length, hashTable);
  return dst.slice(0, written);
}

// ---------------------------------------------------------------------------
// Pixel → Plane packing
// ---------------------------------------------------------------------------

/**
 * Pack 2-bit pixel levels into bw/gs planes with portrait→landscape rotation.
 *
 * @param {Uint8Array} pixels - 2-bit levels (0-3), portrait order (pw × ph)
 * @param {number} pw - portrait width (e.g., 480)
 * @param {number} ph - portrait height (e.g., 800)
 * @returns {{ bw: Uint8Array, gs: Uint8Array, width: number, height: number }}
 *   width/height are landscape dimensions (800×480)
 */
export function pixelsToLandscapePlanes(pixels, pw, ph) {
  const lw = ph;  // 800
  const lh = pw;  // 480
  const rowBytes = Math.ceil(lw / 8);
  const planeSize = rowBytes * lh;
  const bw = new Uint8Array(planeSize);  // init 0 = all black
  const gs = new Uint8Array(planeSize);

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      const level = pixels[py * pw + px];
      if (level === 0) continue;  // black = no bits set

      const lx = py;
      const ly = pw - 1 - px;
      const byteIdx = ly * rowBytes + (lx >> 3);
      const bitMask = 1 << (7 - (lx & 7));

      // BW RAM = MSB, RED RAM = LSB (from pseudo-display.md)
      if (level & 2) bw[byteIdx] |= bitMask;  // bw = MSB (level >> 1) → BW RAM
      if (level & 1) gs[byteIdx] |= bitMask;  // gs = LSB (level & 1) → RED RAM
    }
  }

  return { bw, gs, width: lw, height: lh };
}

/**
 * Pack 2-bit pixel levels into bw/gs planes WITHOUT rotation (portrait).
 *
 * @param {Uint8Array} pixels - 2-bit levels (0-3), row-major
 * @param {number} w - width
 * @param {number} h - height
 * @returns {{ bw: Uint8Array, gs: Uint8Array, width: number, height: number }}
 */
export function pixelsToPortraitPlanes(pixels, w, h) {
  const rowBytes = Math.ceil(w / 8);
  const planeSize = rowBytes * h;
  const bw = new Uint8Array(planeSize);
  const gs = new Uint8Array(planeSize);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const level = pixels[y * w + x];
      if (level === 0) continue;

      const byteIdx = y * rowBytes + (x >> 3);
      const bitMask = 1 << (7 - (x & 7));

      if (level & 2) bw[byteIdx] |= bitMask;  // bw = MSB
      if (level & 1) gs[byteIdx] |= bitMask;  // gs = LSB
    }
  }

  return { bw, gs, width: w, height: h };
}

// ---------------------------------------------------------------------------
// KP Binary encoding
// ---------------------------------------------------------------------------

/**
 * Encode bw/gs planes into KP v1 binary with LZ4 compression.
 *
 * @param {Uint8Array} bw - BW plane (packed bits)
 * @param {Uint8Array} gs - GS plane (packed bits)
 * @param {number} width - plane width in pixels
 * @param {number} height - plane height in pixels
 * @returns {Uint8Array} - Complete .kp file binary
 */
export function encodePlanes(bw, gs, width, height) {
  const bwComp = compressBlock(bw);
  const gsComp = compressBlock(gs);

  const dataSize = 4 + bwComp.length + 4 + gsComp.length;
  const file = new Uint8Array(16 + dataSize);
  const view = new DataView(file.buffer);

  // Header
  file[0] = 0x4B; file[1] = 0x50; file[2] = 0x00; file[3] = 0x01;  // KP v1
  view.setUint16(4, width, true);
  view.setUint16(6, height, true);
  file[8] = 2;   // bitDepth = 2
  file[9] = 1;   // compression = LZ4
  view.setUint32(10, dataSize, true);
  // [14..15] reserved = 0

  // Data: [bw_size:4][bw_lz4][gs_size:4][gs_lz4]
  let off = 16;
  view.setUint32(off, bwComp.length, true); off += 4;
  file.set(bwComp, off); off += bwComp.length;
  view.setUint32(off, gsComp.length, true); off += 4;
  file.set(gsComp, off);

  return file;
}

/**
 * Encode bw/gs planes into KP v1 binary WITHOUT compression.
 * Smaller code path, useful for small UI asset bitmaps.
 */
export function encodePlanesRaw(bw, gs, width, height) {
  const dataSize = bw.length + gs.length;
  const file = new Uint8Array(16 + dataSize);
  const view = new DataView(file.buffer);

  file[0] = 0x4B; file[1] = 0x50; file[2] = 0x00; file[3] = 0x01;
  view.setUint16(4, width, true);
  view.setUint16(6, height, true);
  file[8] = 2;   // bitDepth = 2
  file[9] = 0;   // compression = none
  view.setUint32(10, dataSize, true);

  file.set(bw, 16);
  file.set(gs, 16 + bw.length);

  return file;
}

// ---------------------------------------------------------------------------
// 1-bit plane packing
// ---------------------------------------------------------------------------

/**
 * Pack 1-bit pixel levels into a single BW plane (no rotation).
 *
 * @param {Uint8Array} pixels - 1-bit levels (0=black, 1=white), row-major
 * @param {number} w - width
 * @param {number} h - height
 * @returns {Uint8Array} - Packed bit plane
 */
export function pixelsTo1bitPlane(pixels, w, h) {
  const rowBytes = Math.ceil(w / 8);
  const plane = new Uint8Array(rowBytes * h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (pixels[y * w + x]) {
        const byteIdx = y * rowBytes + (x >> 3);
        plane[byteIdx] |= 1 << (7 - (x & 7));
      }
    }
  }

  return plane;
}

/**
 * Pack 1-bit pixel levels into a single BW plane with portrait→landscape rotation.
 *
 * @param {Uint8Array} pixels - 1-bit levels (0=black, 1=white), portrait order (pw × ph)
 * @param {number} pw - portrait width (e.g., 480)
 * @param {number} ph - portrait height (e.g., 800)
 * @returns {{ plane: Uint8Array, width: number, height: number }}
 */
export function pixelsTo1bitLandscapePlane(pixels, pw, ph) {
  const lw = ph;  // 800
  const lh = pw;  // 480
  const rowBytes = Math.ceil(lw / 8);
  const plane = new Uint8Array(rowBytes * lh);

  for (let py = 0; py < ph; py++) {
    for (let px = 0; px < pw; px++) {
      if (pixels[py * pw + px]) {
        const lx = py;
        const ly = pw - 1 - px;
        const byteIdx = ly * rowBytes + (lx >> 3);
        plane[byteIdx] |= 1 << (7 - (lx & 7));
      }
    }
  }

  return { plane, width: lw, height: lh };
}

// ---------------------------------------------------------------------------
// KP v2 Binary encoding
// ---------------------------------------------------------------------------

/**
 * Encode planes into KP v2 binary format.
 *
 * KP v2 header (16 bytes):
 *   [0..3]   magic: 0x4B 0x50 0x00 0x02
 *   [4..5]   width (uint16 LE)
 *   [6..7]   height (uint16 LE)
 *   [8]      bit_depth: 1, 2, or 3
 *   [9]      compression: 0 or 1
 *   [10..13] data_size (uint32 LE)
 *   [14]     content_flags: 0x01=HAS_TEXT, 0x02=HAS_IMAGE, 0x03=both
 *   [15]     reserved: 0x00
 *
 * @param {object} opts
 * @param {number} opts.width - Width in pixels
 * @param {number} opts.height - Height in pixels
 * @param {number} opts.bitDepth - 1, 2, or 3
 * @param {number} [opts.contentFlags=0x01] - Content flags
 * @param {boolean} [opts.compress=true] - Use LZ4 compression
 * @param {Uint8Array} [opts.bw] - BW plane (required for bitDepth 1, 2, 3)
 * @param {Uint8Array} [opts.gs] - GS plane (required for bitDepth 2)
 * @param {Uint8Array} [opts.grayLsb] - Gray LSB plane (required for bitDepth 3)
 * @param {Uint8Array} [opts.grayMsb] - Gray MSB plane (required for bitDepth 3)
 * @param {Uint8Array} [opts.mask] - Mask plane (optional for bitDepth 3, only if contentFlags & 0x03 === 0x03)
 * @returns {Uint8Array} - Complete .kp v2 file binary
 */
export function encodeKpV2(opts) {
  const {
    width, height, bitDepth,
    contentFlags = 0x01,
    compress = true,
    bw, gs,
    grayLsb, grayMsb, mask,
  } = opts;

  const pack = compress ? (data) => compressBlock(data) : (data) => data;
  const blocks = [];

  if (bitDepth === 1) {
    // [bw_size:4][bw_lz4]
    const bwPacked = pack(bw);
    blocks.push(bwPacked);
  } else if (bitDepth === 2) {
    // File order: [gs (LSB) first][bw (MSB) second]
    // Firmware reads: gs → RED RAM (LSB), bw → BW RAM (MSB)
    const gsPacked = pack(gs);
    const bwPacked = pack(bw);
    blocks.push(gsPacked, bwPacked);
  } else if (bitDepth === 3) {
    // [bw_size:4][bw_lz4]
    const bwPacked = pack(bw);
    blocks.push(bwPacked);

    // [gray_size:4][gray_data] where gray_data = [lsb_size:4][lsb_lz4][msb_size:4][msb_lz4]
    const grayLsbPacked = pack(grayLsb);
    const grayMsbPacked = pack(grayMsb);
    // gray_data is the inner content: lsb_size + lsb_data + msb_size + msb_data
    const grayDataSize = 4 + grayLsbPacked.length + 4 + grayMsbPacked.length;
    blocks.push({ type: 'gray', lsb: grayLsbPacked, msb: grayMsbPacked, size: grayDataSize });

    // [mask_size:4][mask_lz4] only if contentFlags has both HAS_TEXT and HAS_IMAGE
    if ((contentFlags & 0x03) === 0x03 && mask) {
      const maskPacked = pack(mask);
      blocks.push(maskPacked);
    }
  }

  // Calculate total data size
  let dataSize = 0;
  for (const block of blocks) {
    if (block.type === 'gray') {
      dataSize += 4 + block.size; // gray_size prefix + gray_data
    } else {
      dataSize += 4 + block.length; // size prefix + data
    }
  }

  const file = new Uint8Array(16 + dataSize);
  const view = new DataView(file.buffer);

  // Header
  file[0] = 0x4B; file[1] = 0x50; file[2] = 0x00; file[3] = 0x02;  // KP v2
  view.setUint16(4, width, true);
  view.setUint16(6, height, true);
  file[8] = bitDepth;
  file[9] = compress ? 1 : 0;
  view.setUint32(10, dataSize, true);
  file[14] = contentFlags;
  file[15] = 0x00;

  // Data blocks
  let off = 16;
  for (const block of blocks) {
    if (block.type === 'gray') {
      view.setUint32(off, block.size, true); off += 4;
      view.setUint32(off, block.lsb.length, true); off += 4;
      file.set(block.lsb, off); off += block.lsb.length;
      view.setUint32(off, block.msb.length, true); off += 4;
      file.set(block.msb, off); off += block.msb.length;
    } else {
      view.setUint32(off, block.length, true); off += 4;
      file.set(block, off); off += block.length;
    }
  }

  return file;
}

// ---------------------------------------------------------------------------
// Convenience: canvas → output
// ---------------------------------------------------------------------------

/**
 * Full pipeline: portrait canvas → landscape KP binary.
 *
 * @param {Canvas} canvas - Portrait-oriented canvas (e.g., 480×800)
 * @param {object} [opts]
 * @param {number} [opts.gamma=1.8] - Gamma for quantization
 * @param {boolean} [opts.dither=false] - Use Floyd-Steinberg dithering (for photos)
 * @returns {Uint8Array} - Complete .kp file binary (landscape 800×480)
 */
export function canvasToKp(canvas, opts = {}) {
  const { gamma = 1.8, dither = false } = opts;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const quantize = dither ? quantizeFloydSteinberg : quantizeGamma;
  const pixels = quantize(imageData.data, canvas.width, canvas.height, gamma);

  const { bw, gs, width, height } = pixelsToLandscapePlanes(pixels, canvas.width, canvas.height);
  return encodePlanes(bw, gs, width, height);
}

/**
 * Portrait canvas → raw landscape planes (no KP header, no compression).
 * For gen-test-pages which writes raw .bin files.
 */
export function canvasToPlanes(canvas, opts = {}) {
  const { gamma = 1.8, dither = false } = opts;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const quantize = dither ? quantizeFloydSteinberg : quantizeGamma;
  const pixels = quantize(imageData.data, canvas.width, canvas.height, gamma);

  return pixelsToLandscapePlanes(pixels, canvas.width, canvas.height);
}

/**
 * Portrait canvas → portrait planes (no rotation, no KP header).
 * For dictionary bitmaps.
 */
export function canvasToPortraitPlanes(canvas, opts = {}) {
  const { gamma = 1.8 } = opts;
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const pixels = quantizeGamma(imageData.data, canvas.width, canvas.height, gamma);
  return pixelsToLandscapePlanes(pixels, canvas.width, canvas.height);
}
