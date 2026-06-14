import { W, H, SAFE_X, SAFE_W, SAFE_Y, SAFE } from '../layout.js'

export function renderReader(ctx, data) {
  const { currentPage = 0, totalPages = 4, pageBuffer = null, book = null, pageImageData = null } = data
  const assets = []

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, W, H)

  // If we have a pre-decoded page from .kb, blit it directly
  if (pageImageData) {
    ctx.putImageData(pageImageData, 0, 0)
    return [{ name: 'page_buffer', type: 'prerendered', bounds: { x: 0, y: 0, w: W, h: H } }]
  }

  // Fallback: render placeholder text
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'black'

  const mx = SAFE_X + 22, mw = SAFE_W - 44
  const topY = SAFE_Y + 20
  const bottomY = H - SAFE.bottom - 10
  const lineH = 26
  const maxTextY = bottomY - 34

  function renderPara(text, startY, font) {
    ctx.font = font
    const words = text.split(' ')
    let line = '', y = startY
    for (const word of words) {
      const test = line + (line ? ' ' : '') + word
      if (ctx.measureText(test).width > mw && line) {
        if (y > maxTextY) return y
        ctx.fillText(line, mx, y); y += lineH; line = word
      } else line = test
    }
    if (line && y <= maxTextY) { ctx.fillText(line, mx, y); y += lineH }
    return y
  }

  let y = topY
  y = renderPara('What is Lorem Ipsum?', y, 'bold 17px serif'); y += 2
  y = renderPara(
    'Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry\u2019s standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged.',
    y, '17px serif')
  y += 6
  y = renderPara('Why do we use it?', y, 'bold 17px serif'); y += 2
  y = renderPara(
    'It is a long established fact that a reader will be distracted by the readable content of a page when looking at its layout. The point of using Lorem Ipsum is that it has a more-or-less normal distribution of letters, as opposed to using \u2018Content here, content here\u2019, making it look like readable English.',
    y, '17px serif')

  assets.push({ name: 'reader_body', type: 'text', bounds: { x: mx, y: topY, w: mw, h: y - topY } })

  ctx.font = '11px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(`CHAPTER 1: INTRODUCTION  \u2022  ${currentPage + 1} OF ${Math.max(totalPages, 4)}`, W / 2, bottomY - 16)
  ctx.textAlign = 'left'
  assets.push({ name: 'reader_footer', type: 'text', bounds: { x: SAFE_X, y: bottomY - 16, w: SAFE_W, h: 16 } })

  return assets
}
