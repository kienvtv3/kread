export function createBuffer(w, h, fillValue = 255) {
  const buf = new Uint8Array(w * h)
  buf.fill(fillValue)
  return buf
}

export function fillRect(buf, bufW, x, y, w, h, value) {
  const bufH = buf.length / bufW
  for (let row = y; row < y + h; row++) {
    if (row < 0 || row >= bufH) continue
    for (let col = x; col < x + w; col++) {
      if (col < 0 || col >= bufW) continue
      buf[row * bufW + col] = value
    }
  }
}

export function hline(buf, bufW, x, y, w, value) {
  if (y < 0 || y >= buf.length / bufW) return
  for (let col = x; col < x + w; col++) {
    if (col < 0 || col >= bufW) continue
    buf[y * bufW + col] = value
  }
}

export function strokeRect(buf, bufW, x, y, w, h, value, lineWidth = 1) {
  for (let i = 0; i < lineWidth; i++) {
    hline(buf, bufW, x, y + i, w, value)
    hline(buf, bufW, x, y + h - 1 - i, w, value)
    const bufH = buf.length / bufW
    for (let row = y + i; row < y + h - i; row++) {
      if (row < 0 || row >= bufH) continue
      for (let lw = 0; lw < lineWidth; lw++) {
        const cl = x + lw, cr = x + w - 1 - lw
        if (cl >= 0 && cl < bufW) buf[row * bufW + cl] = value
        if (cr >= 0 && cr < bufW) buf[row * bufW + cr] = value
      }
    }
  }
}

export function fillTriangle(buf, bufW, bufH, x0, y0, x1, y1, x2, y2, value) {
  const minY = Math.max(0, Math.min(y0, y1, y2))
  const maxY = Math.min(bufH - 1, Math.max(y0, y1, y2))
  const edges = [[x0,y0,x1,y1], [x1,y1,x2,y2], [x2,y2,x0,y0]]
  for (let y = minY; y <= maxY; y++) {
    let minX = bufW, maxX = 0
    for (const [ax,ay,bx,by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        const t = (y - ay) / (by - ay)
        const ix = Math.round(ax + t * (bx - ax))
        minX = Math.min(minX, ix)
        maxX = Math.max(maxX, ix)
      }
    }
    for (let x = Math.max(0, minX); x <= Math.min(bufW - 1, maxX); x++) {
      buf[y * bufW + x] = value
    }
  }
}

export function compositeGlyph(buf, bufW, bufH, glyph, x, y) {
  for (let gy = 0; gy < glyph.height; gy++) {
    const py = y + gy
    if (py < 0 || py >= bufH) continue
    for (let gx = 0; gx < glyph.width; gx++) {
      const px = x + gx
      if (px < 0 || px >= bufW) continue
      const coverage = glyph.pixels[gy * glyph.width + gx]
      buf[py * bufW + px] = Math.min(buf[py * bufW + px], 255 - coverage)
    }
  }
}

export function compositeMonoGlyph(buf, bufW, bufH, glyph, x, y) {
  const pitch = Math.ceil(glyph.width / 8)
  for (let gy = 0; gy < glyph.height; gy++) {
    const py = y + gy
    if (py < 0 || py >= bufH) continue
    for (let gx = 0; gx < glyph.width; gx++) {
      const px = x + gx
      if (px < 0 || px >= bufW) continue
      const byteIdx = gy * pitch + (gx >> 3)
      const bitMask = 0x80 >> (gx & 7)
      if (glyph.pixels[byteIdx] & bitMask) {
        buf[py * bufW + px] = 0
      }
    }
  }
}
