/**
 * .kb v2 binary assembler.
 *
 * File layout:
 *   [header 32B] [page_table] [chapter_offsets] [asset_index + data] [page_data] [metadata]
 */

const KB_MAGIC = new Uint8Array([0x4B, 0x42, 0x00, 0x02])
const HEADER_SIZE = 32
const PAGE_ENTRY_SIZE = 8
const CHAPTER_ENTRY_SIZE = 2
const ASSET_ENTRY_SIZE = 12

/**
 * Build a .kb v2 binary.
 *
 * @param {object} opts
 * @param {Uint8Array[]} opts.pages — array of .kp page blobs
 * @param {number[]} opts.chapters — page indices for chapter starts
 * @param {Array<{type: number, index: number, kpData: Uint8Array, height: number}>} opts.assets
 * @param {object} opts.metadata — converter JSON (title, author, etc)
 * @param {number} [opts.fontSizeIdx=2] — 0-4
 * @param {number} [opts.orientation=0] — 0=portrait
 * @param {number} [opts.mode=0] — 0=light
 * @param {number} [opts.flags=0x01] — HAS_DUAL_MODE
 * @returns {Uint8Array} complete .kb file
 */
export function buildKb(opts) {
  const {
    pages, chapters, assets = [],
    metadata = {},
    fontSizeIdx = 2,
    orientation = 0,
    mode = 0,
    flags = 0x01,
  } = opts

  const pageCount = pages.length
  const chapterCount = chapters.length
  const assetCount = assets.length

  const metaBytes = new TextEncoder().encode(JSON.stringify(metadata))

  const totalAssetData = assets.reduce((sum, a) => sum + a.kpData.byteLength, 0)
  const totalPageData = pages.reduce((sum, p) => sum + p.byteLength, 0)

  // Section offsets
  const pageTableOffset = HEADER_SIZE
  const chapterOffset = pageTableOffset + pageCount * PAGE_ENTRY_SIZE
  const assetOffset = chapterOffset + chapterCount * CHAPTER_ENTRY_SIZE
  const assetDataStart = assetOffset + assetCount * ASSET_ENTRY_SIZE
  const pageDataStart = assetDataStart + totalAssetData
  const metaOffset = pageDataStart + totalPageData

  const totalSize = metaOffset + metaBytes.byteLength

  // Allocate
  const buf = new Uint8Array(totalSize)
  const view = new DataView(buf.buffer)

  // --- Header (32 bytes) ---
  buf.set(KB_MAGIC, 0x00)
  view.setUint16(0x04, pageCount, true)
  view.setUint8(0x06, chapterCount)
  view.setUint8(0x07, 1) // rendition_count
  view.setUint8(0x08, fontSizeIdx)
  view.setUint8(0x09, orientation)
  view.setUint8(0x0A, mode)
  view.setUint8(0x0B, flags)
  view.setUint32(0x0C, pageTableOffset, true)
  view.setUint32(0x10, chapterOffset, true)
  view.setUint32(0x14, assetOffset, true)
  view.setUint16(0x18, assetCount, true)
  view.setUint32(0x1A, metaOffset, true)
  view.setUint16(0x1E, metaBytes.byteLength, true)

  // --- Chapter offsets (uint16 LE) ---
  for (let i = 0; i < chapterCount; i++) {
    view.setUint16(chapterOffset + i * CHAPTER_ENTRY_SIZE, chapters[i], true)
  }

  // --- Asset index + data ---
  let assetDataOffset = assetDataStart
  for (let i = 0; i < assetCount; i++) {
    const a = assets[i]
    const entryPos = assetOffset + i * ASSET_ENTRY_SIZE
    view.setUint8(entryPos + 0x00, a.type)
    view.setUint8(entryPos + 0x01, a.index)
    view.setUint16(entryPos + 0x02, a.height, true)
    view.setUint32(entryPos + 0x04, assetDataOffset, true)
    view.setUint32(entryPos + 0x08, a.kpData.byteLength, true)
    buf.set(a.kpData, assetDataOffset)
    assetDataOffset += a.kpData.byteLength
  }

  // --- Page table + data ---
  let pageDataOffset = pageDataStart
  for (let i = 0; i < pageCount; i++) {
    const entryPos = pageTableOffset + i * PAGE_ENTRY_SIZE
    view.setUint32(entryPos + 0x00, pageDataOffset, true)
    view.setUint32(entryPos + 0x04, pages[i].byteLength, true)
    buf.set(pages[i], pageDataOffset)
    pageDataOffset += pages[i].byteLength
  }

  // --- Metadata JSON ---
  buf.set(metaBytes, metaOffset)

  return buf
}
