/**
 * Browser-side .kb v2 parser — mirrors firmware's kb_reader.
 *
 * Parses .kb binary, decodes KP v2 pages/assets (1/2/3-bit depth),
 * decompresses LZ4, and produces canvas-blittable ImageData.
 */

const KB_MAGIC = [0x4B, 0x42, 0x00, 0x02]
const KP_MAGIC = [0x4B, 0x50, 0x00, 0x02]
const HEADER_SIZE = 32
const PAGE_ENTRY_SIZE = 8
const ASSET_ENTRY_SIZE = 12

// Asset types
export const ASSET_FONT_NAME = 0x00
export const ASSET_BOOK_TITLE = 0x01
export const ASSET_BOOK_AUTHOR = 0x02
export const ASSET_COVER = 0x03
export const ASSET_CHAPTER_NAME = 0x04
export const ASSET_COVER_THUMB = 0x05

// Lazy-loaded LZ4
let _lz4 = null
async function getLz4() {
  if (!_lz4) _lz4 = (await import('lz4js')).default
  return _lz4
}

/**
 * Convert decoded pixel levels (0-3) to canvas ImageData.
 *
 * @param {Uint8Array} pixels - pixel levels (0-3 for 2/4-level, 0-1 for 1-bit)
 * @param {number} w - width
 * @param {number} h - height
 * @param {number} [levels=4] - number of gray levels (2 or 4)
 * @returns {ImageData}
 */
function pixelsToImageData(pixels, w, h, levels = 4) {
  const GRAY4 = [0, 85, 170, 255]
  const GRAY2 = [0, 255]
  const lut = levels === 2 ? GRAY2 : GRAY4
  const rgba = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    const g = lut[pixels[i]]
    rgba[i * 4] = g
    rgba[i * 4 + 1] = g
    rgba[i * 4 + 2] = g
    rgba[i * 4 + 3] = 255
  }
  return new ImageData(rgba, w, h)
}

/**
 * Unpack a 1-bit packed plane into pixel array.
 *
 * @param {Uint8Array} plane - packed bits (MSB first per byte)
 * @param {number} w - width in pixels
 * @param {number} h - height in pixels
 * @returns {Uint8Array} - pixel values (0 or 1)
 */
function unpackPlane(plane, w, h) {
  const rowBytes = Math.ceil(w / 8)
  const pixels = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const byteIdx = y * rowBytes + (x >> 3)
      const bitMask = 1 << (7 - (x & 7))
      if (plane[byteIdx] & bitMask) pixels[y * w + x] = 1
    }
  }
  return pixels
}

/**
 * Read a size-prefixed LZ4 block from a DataView.
 *
 * @param {DataView} view
 * @param {number} offset - position of the uint32 compressed size
 * @param {Uint8Array} fileBytes - raw file bytes for slicing
 * @param {object} lz4 - lz4js module
 * @param {number} uncompressedSize - expected output size
 * @returns {{ data: Uint8Array, bytesConsumed: number }}
 */
function decompressBlock(view, offset, fileBytes, lz4, uncompressedSize) {
  const compSize = view.getUint32(offset, true)
  const compData = fileBytes.subarray(offset + 4, offset + 4 + compSize)
  const out = new Uint8Array(uncompressedSize)
  lz4.decompressBlock(compData, out, 0, compSize, 0)
  return { data: out, bytesConsumed: 4 + compSize }
}

/**
 * Read a size-prefixed raw (uncompressed) block.
 */
function readRawBlock(offset, fileBytes, size) {
  const data = fileBytes.slice(offset, offset + size)
  return { data, bytesConsumed: size }
}

/**
 * Decode a KP v2 blob into pixel data.
 *
 * @param {Uint8Array} kpBytes - complete KP v2 blob
 * @param {object} lz4 - lz4js module
 * @returns {{ w: number, h: number, pixels: Uint8Array, bitDepth: number, contentFlags: number }}
 */
function decodeKp(kpBytes, lz4) {
  const view = new DataView(kpBytes.buffer, kpBytes.byteOffset, kpBytes.byteLength)

  // Validate magic
  if (kpBytes[0] !== KP_MAGIC[0] || kpBytes[1] !== KP_MAGIC[1] ||
      kpBytes[2] !== KP_MAGIC[2] || kpBytes[3] !== KP_MAGIC[3]) {
    throw new Error('Invalid KP magic')
  }

  const w = view.getUint16(4, true)
  const h = view.getUint16(6, true)
  const bitDepth = kpBytes[8]
  const compression = kpBytes[9]
  const contentFlags = kpBytes[14]

  const rowBytes = Math.ceil(w / 8)
  const planeSize = rowBytes * h

  let off = 16

  // Always bit_depth=2: [lsb_size:4][lsb_data][msb_size:4][msb_data]
  let lsbPlane, msbPlane
  if (compression) {
    const lsbResult = decompressBlock(view, off, kpBytes, lz4, planeSize)
    off += lsbResult.bytesConsumed
    const msbResult = decompressBlock(view, off, kpBytes, lz4, planeSize)
    lsbPlane = lsbResult.data
    msbPlane = msbResult.data
  } else {
    const lsbSize = view.getUint32(off, true); off += 4
    lsbPlane = kpBytes.slice(off, off + lsbSize); off += lsbSize
    const msbSize = view.getUint32(off, true); off += 4
    msbPlane = kpBytes.slice(off, off + msbSize)
  }

  // [gs (LSB) first][bw (MSB) second]
  const gsBits = unpackPlane(lsbPlane, w, h)
  const bwBits = unpackPlane(msbPlane, w, h)

  const isLandscape = (contentFlags & 0x04) !== 0

  if (isLandscape) {
    // Landscape pages: rotate to portrait
    const pw = h, ph = w
    const pixels = new Uint8Array(pw * ph)
    for (let ly = 0; ly < h; ly++) {
      for (let lx = 0; lx < w; lx++) {
        const level = (bwBits[ly * w + lx] << 1) | gsBits[ly * w + lx]
        pixels[lx * pw + (h - 1 - ly)] = level
      }
    }
    return { w: pw, h: ph, pixels, bitDepth, contentFlags }
  } else {
    // Portrait assets: no rotation
    const pixels = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) {
      pixels[i] = (bwBits[i] << 1) | gsBits[i]
    }
    return { w, h, pixels, bitDepth, contentFlags }
  }
}

export class KbReader {
  /**
   * @param {ArrayBuffer} buffer - complete .kb file
   */
  constructor(buffer) {
    this._buf = new Uint8Array(buffer)
    this._view = new DataView(buffer)
    this._lz4 = null

    // Validate magic
    for (let i = 0; i < 4; i++) {
      if (this._buf[i] !== KB_MAGIC[i]) {
        throw new Error('Invalid .kb magic — expected KB\\x00\\x02')
      }
    }

    // Parse header
    this._pageCount = this._view.getUint16(0x04, true)
    this._chapterCount = this._view.getUint8(0x06)
    this._renditionCount = this._view.getUint8(0x07)
    this._fontSizeIdx = this._view.getUint8(0x08)
    this._orientation = this._view.getUint8(0x09)
    this._mode = this._view.getUint8(0x0A)
    this._flags = this._view.getUint8(0x0B)
    this._pageTableOffset = this._view.getUint32(0x0C, true)
    this._chapterOffset = this._view.getUint32(0x10, true)
    this._assetOffset = this._view.getUint32(0x14, true)
    this._assetCount = this._view.getUint16(0x18, true)
    this._metaOffset = this._view.getUint32(0x1A, true)
    this._metaSize = this._view.getUint16(0x1E, true)
  }

  /**
   * Async init — lazy-loads LZ4 decompressor.
   * Must be called before getPage/getAsset.
   */
  async init() {
    this._lz4 = await getLz4()
    return this
  }

  get pageCount() {
    return this._pageCount
  }

  get chapterCount() {
    return this._chapterCount
  }

  /**
   * Parsed JSON metadata from the metadata section.
   * @returns {object}
   */
  get metadata() {
    if (this._metaSize === 0) return {}
    const bytes = this._buf.subarray(this._metaOffset, this._metaOffset + this._metaSize)
    return JSON.parse(new TextDecoder().decode(bytes))
  }

  /**
   * Get page table entry.
   * @param {number} pageNum - 0-based page index
   * @returns {{ offset: number, size: number }}
   */
  _getPageEntry(pageNum) {
    if (pageNum < 0 || pageNum >= this._pageCount) {
      throw new RangeError(`Page ${pageNum} out of range (0-${this._pageCount - 1})`)
    }
    const entryOff = this._pageTableOffset + pageNum * PAGE_ENTRY_SIZE
    return {
      offset: this._view.getUint32(entryOff, true),
      size: this._view.getUint32(entryOff + 4, true),
    }
  }

  /**
   * Find asset index entry by type and index.
   * @param {number} type - asset type (ASSET_*)
   * @param {number} index - sub-index (e.g., chapter number)
   * @returns {{ type: number, index: number, height: number, offset: number, size: number }|null}
   */
  _findAssetEntry(type, index) {
    for (let i = 0; i < this._assetCount; i++) {
      const entryOff = this._assetOffset + i * ASSET_ENTRY_SIZE
      const aType = this._view.getUint8(entryOff)
      const aIndex = this._view.getUint8(entryOff + 1)
      if (aType === type && aIndex === index) {
        return {
          type: aType,
          index: aIndex,
          height: this._view.getUint16(entryOff + 2, true),
          offset: this._view.getUint32(entryOff + 4, true),
          size: this._view.getUint32(entryOff + 8, true),
        }
      }
    }
    return null
  }

  /**
   * Decode a KP blob from the file.
   * @param {number} offset - byte offset in file
   * @param {number} size - byte length
   * @returns {{ w: number, h: number, pixels: Uint8Array, imageData: ImageData, bitDepth: number, contentFlags: number }}
   */
  _decodeBlob(offset, size) {
    if (!this._lz4) throw new Error('KbReader not initialized — call init() first')
    const kpBytes = this._buf.subarray(offset, offset + size)
    const decoded = decodeKp(kpBytes, this._lz4)
    const { w, h, pixels, bitDepth, contentFlags } = decoded
    const levels = bitDepth === 1 ? 2 : 4
    const imageData = pixelsToImageData(pixels, w, h, levels)
    return { w, h, pixels, bitDepth, contentFlags, imageData }
  }

  /**
   * Decode a page by number.
   *
   * @param {number} pageNum - 0-based page index
   * @returns {Promise<{ w: number, h: number, pixels: Uint8Array, imageData: ImageData, bitDepth: number, contentFlags: number }>}
   */
  async getPage(pageNum) {
    const entry = this._getPageEntry(pageNum)
    return this._decodeBlob(entry.offset, entry.size)
  }

  /**
   * Decode an asset by type and index.
   *
   * @param {number} type - asset type constant
   * @param {number} [index=0]
   * @returns {Promise<{ w: number, h: number, pixels: Uint8Array, imageData: ImageData, bitDepth: number, contentFlags: number }|null>}
   */
  async getAsset(type, index = 0) {
    const entry = this._findAssetEntry(type, index)
    if (!entry) return null
    return this._decodeBlob(entry.offset, entry.size)
  }

  /** Decode the book title asset. */
  async getTitle() {
    return this.getAsset(ASSET_BOOK_TITLE, 0)
  }

  /** Decode the book author asset. */
  async getAuthor() {
    return this.getAsset(ASSET_BOOK_AUTHOR, 0)
  }

  /** Decode the cover image asset (full page). */
  async getCover() {
    return this.getAsset(ASSET_COVER, 0)
  }

  /** Decode the cover thumbnail asset (240×400). */
  async getCoverThumb() {
    return this.getAsset(ASSET_COVER_THUMB, 0)
  }

  /** Decode a chapter name asset. */
  async getChapterName(i) {
    return this.getAsset(ASSET_CHAPTER_NAME, i)
  }

  /**
   * Get chapter start page indices.
   * @returns {number[]}
   */
  getChapters() {
    const chapters = []
    for (let i = 0; i < this._chapterCount; i++) {
      const off = this._chapterOffset + i * 2
      chapters.push(this._view.getUint16(off, true))
    }
    return chapters
  }
}
