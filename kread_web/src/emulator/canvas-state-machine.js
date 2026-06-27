// Canvas-first emulator renderer for the Design route.
// This is intentionally independent from the firmware/UI asset pipeline.

export const STATES = {
  HOME: 'HOME',
  READER: 'READER',
  LIBRARY: 'LIBRARY',
  GALLERY: 'GALLERY',
  SETTINGS: 'SETTINGS',
}

export const BUTTONS = {
  BACK: 'BACK',
  CONFIRM: 'CONFIRM',
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  UP: 'UP',
  DOWN: 'DOWN',
  POWER: 'POWER',
}

const W = 480
const H = 800
const SAFE = 8
const HELP_Y = 752

const books = [
  { title: "Chip War: Fight for the World's Most Critical Technology", author: 'Chris Miller', progress: 42 },
  { title: 'The Pragmatic Programmer', author: 'David Thomas, Andrew Hunt', progress: 0 },
  { title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', progress: 15 },
  { title: 'Clean Code', author: 'Robert C. Martin', progress: 100 },
  { title: 'The Art of Electronics', author: 'Paul Horowitz', progress: 0 },
]

const images = [
  'Boarding pass',
  'Concert ticket',
  'Transit card',
  'Sleep screen',
  'Museum pass',
]

function makeCanvas() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  return canvas
}

function clear(ctx) {
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.strokeStyle = '#000'
  ctx.lineWidth = 1
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
}

function setFont(ctx, size, weight = 400, family = 'Verdana') {
  ctx.font = `${weight} ${size}px ${family}, sans-serif`
}

function truncate(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text
  let out = text
  while (out.length > 1 && ctx.measureText(`${out}...`).width > width) {
    out = out.slice(0, -1)
  }
  return `${out.trimEnd()}...`
}

function wrapText(ctx, text, x, y, width, lineHeight, maxLines = 2) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''

  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > width && line) {
      lines.push(line)
      line = word
      if (lines.length >= maxLines) break
    } else {
      line = next
    }
  }

  if (lines.length < maxLines && line) lines.push(line)
  for (let i = 0; i < lines.length; i++) {
    const isLast = i === maxLines - 1 && words.join(' ').length > lines.join(' ').length
    ctx.fillText(isLast ? truncate(ctx, lines[i], width) : lines[i], x, y + i * lineHeight)
  }
}

function helpBar(ctx, items) {
  ctx.fillRect(SAFE, HELP_Y - 5, W - SAFE * 2, 2)
  setFont(ctx, 20, 700)
  ctx.textAlign = 'center'
  const slotW = (W - SAFE * 2) / 4
  items.forEach((item, i) => {
    const x = SAFE + slotW * i + slotW / 2
    ctx.fillText(item, x, HELP_Y + 28)
  })
  ctx.textAlign = 'left'
}

function drawBattery(ctx, pct) {
  const x = 436
  const y = 18
  ctx.strokeRect(x, y, 23, 12)
  ctx.fillRect(x + 24, y + 4, 3, 4)
  ctx.fillRect(x + 2, y + 2, Math.max(1, Math.round(19 * pct / 100)), 8)
}

function drawCover(ctx, book) {
  const x = 96
  const y = 54
  const w = 288
  const h = 384
  ctx.strokeRect(x, y, w, h)
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4)

  setFont(ctx, 6)
  ctx.textAlign = 'center'
  ctx.fillText('Kerslick. An xga pgjwycxo xng cxxxpdpv r xxvxxx', x + w / 2, y + 23)
  ctx.fillText('nul cxxxx rschjkvxx – fabricated cover line', x + w / 2, y + 36)

  ctx.save()
  ctx.globalAlpha = 0.55
  ctx.fillStyle = '#777'
  setFont(ctx, 68, 700, 'Verdana')
  ctx.fillText('CHIP', x + w / 2, y + 106)
  ctx.fillText('WAR', x + w / 2, y + 173)
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.rect(x + 92, y + 194, 104, 66)
  ctx.clip()
  ctx.lineWidth = 1
  for (let yy = y + 194; yy < y + 260; yy += 4) {
    ctx.beginPath()
    ctx.moveTo(x + 92, yy)
    ctx.lineTo(x + 196, yy + 18)
    ctx.stroke()
  }
  ctx.strokeRect(x + 92, y + 194, 42, 42)
  for (let i = 0; i < 5; i++) {
    ctx.strokeRect(x + 132, y + 198 + i * 12, 78, 4)
  }
  ctx.restore()

  setFont(ctx, 13, 700)
  ctx.letterSpacing = '3px'
  ctx.fillText("THE FIGHT FOR THE WORLD'S", x + w / 2, y + 286)
  ctx.fillText('MOST CRITICAL TECHNOLOGY', x + w / 2, y + 309)
  ctx.letterSpacing = '0px'

  ctx.save()
  ctx.globalAlpha = 0.55
  setFont(ctx, 16)
  ctx.fillText('CHRIS MILLER', x + w / 2, y + 354)
  ctx.restore()

  ctx.textAlign = 'left'
}

function drawHome(ctx, d) {
  clear(ctx)
  const book = books[d.bookIndex]
  drawBattery(ctx, d.batteryPercent)
  drawCover(ctx, book)

  setFont(ctx, 34)
  ctx.textAlign = 'left'
  ctx.fillText('◁', 40, 252)
  ctx.textAlign = 'right'
  ctx.fillText('▷', 440, 252)
  ctx.textAlign = 'left'

  setFont(ctx, 18)
  ctx.fillText(book.progress >= 100 ? 'FINISHED' : book.progress > 0 ? `${book.progress}% READ` : 'UNREAD', 28, 492)
  setFont(ctx, 29, 700)
  wrapText(ctx, book.title, 28, 535, 424, 38, 3)
  setFont(ctx, 19)
  ctx.fillText(book.author.toUpperCase(), 28, 646)
  helpBar(ctx, ['◂ Read', '▾ Library', '▵ Gallery', '▿ Settings'])
}

function drawReader(ctx, d) {
  clear(ctx)
  setFont(ctx, 30, 700, 'Georgia')
  ctx.fillText('Chapter 1', 28, 58)
  setFont(ctx, 24, 400, 'Georgia')
  const sample = [
    'The modern world runs on chips. From smartphones to satellites, semiconductors are the foundation of nearly every technology we depend on.',
    'This canvas renderer is intentionally plain and direct. It gives us a trustworthy design surface before firmware and bitmap asset generation catch up.',
    'Page turns, menus, and layout experiments can now move quickly without rebuilding generated resources.',
  ]
  let y = 112
  for (const paragraph of sample) {
    wrapText(ctx, paragraph, 28, y, 424, 36, 4)
    y += 168
  }
  setFont(ctx, 16, 700)
  ctx.textAlign = 'center'
  ctx.fillText(`${d.page + 1} / 4`, W / 2, 730)
  ctx.textAlign = 'left'
  helpBar(ctx, ['Home', 'Menu', 'Prev', 'Next'])
}

function drawList(ctx, title, items, selectedIndex, formatter, helpItems) {
  clear(ctx)
  setFont(ctx, 32, 700)
  ctx.fillText(title, 24, 52)
  ctx.fillRect(8, 68, 464, 1)
  setFont(ctx, 21)
  items.forEach((item, i) => {
    const y = 108 + i * 68
    if (i === selectedIndex) {
      ctx.fillRect(16, y - 34, 5, 48)
    }
    formatter(item, i, y)
  })
  helpBar(ctx, helpItems)
}

function drawLibrary(ctx, d) {
  drawList(ctx, 'Library', books, d.libraryIndex, (book, i, y) => {
    setFont(ctx, 21, i === d.libraryIndex ? 700 : 400)
    ctx.fillText(truncate(ctx, book.title, 330), 28, y)
    setFont(ctx, 16)
    ctx.fillText(truncate(ctx, book.author, 300), 28, y + 27)
    ctx.textAlign = 'right'
    setFont(ctx, 16, 700)
    ctx.fillText(book.progress >= 100 ? 'DONE' : `${book.progress}%`, 450, y + 12)
    ctx.textAlign = 'left'
  }, ['Home', 'Read', 'Page', 'Select'])
}

function drawGallery(ctx, d) {
  drawList(ctx, 'Image', images, d.galleryIndex, (name, i, y) => {
    setFont(ctx, 22, i === d.galleryIndex ? 700 : 400)
    ctx.fillText(name, 28, y)
    ctx.strokeRect(384, y - 38, 58, 44)
    ctx.moveTo(384, y + 6)
    ctx.lineTo(442, y - 38)
    ctx.stroke()
  }, ['Home', 'View', 'Page', 'Select'])
}

function drawSettings(ctx, d) {
  const settings = [
    ['Sleep timeout', '5 min'],
    ['Sleep image', 'Book cover'],
    ['Language', 'English'],
    ['Display', '4 gray'],
    ['Firmware', 'v0.1.0'],
  ]
  drawList(ctx, 'Settings', settings, d.settingsIndex, (row, i, y) => {
    setFont(ctx, 22, i === d.settingsIndex ? 700 : 400)
    ctx.fillText(row[0], 28, y)
    ctx.textAlign = 'right'
    ctx.fillText(row[1], 452, y)
    ctx.textAlign = 'left'
  }, ['Home', 'Enter', 'Change', 'Select'])
}

function quantizeToScreen(ctx, screen) {
  const imageData = ctx.getImageData(0, 0, W, H)
  const pixels = imageData.data
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const gray = pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114
      const level = gray < 64 ? 0 : gray < 140 ? 1 : gray < 200 ? 2 : 3
      screen.setPixel(x, y, level)
    }
  }
  screen._version++
}

export function createCanvasStateMachine(screen, onChange) {
  const canvas = makeCanvas()
  const ctx = canvas.getContext('2d')
  const d = {
    state: STATES.HOME,
    batteryPercent: 85,
    bookIndex: 0,
    libraryIndex: 0,
    galleryIndex: 0,
    settingsIndex: 0,
    page: 0,
  }

  function notify() {
    onChange?.({ state: d.state, currentPage: d.page, totalPages: 4 })
  }

  function render() {
    if (d.state === STATES.HOME) drawHome(ctx, d)
    else if (d.state === STATES.READER) drawReader(ctx, d)
    else if (d.state === STATES.LIBRARY) drawLibrary(ctx, d)
    else if (d.state === STATES.GALLERY) drawGallery(ctx, d)
    else if (d.state === STATES.SETTINGS) drawSettings(ctx, d)
    quantizeToScreen(ctx, screen)
  }

  function transition(state) {
    d.state = state
    render()
    notify()
  }

  function moveSelected(key, max, delta) {
    d[key] = Math.max(0, Math.min(max - 1, d[key] + delta))
    render()
    notify()
  }

  function handleButton(button) {
    if (d.state === STATES.HOME) {
      if (button === BUTTONS.BACK) transition(STATES.READER)
      if (button === BUTTONS.CONFIRM) transition(STATES.LIBRARY)
      if (button === BUTTONS.UP) transition(STATES.GALLERY)
      if (button === BUTTONS.DOWN) transition(STATES.SETTINGS)
      if (button === BUTTONS.LEFT) { d.bookIndex = (d.bookIndex + books.length - 1) % books.length; render(); notify() }
      if (button === BUTTONS.RIGHT) { d.bookIndex = (d.bookIndex + 1) % books.length; render(); notify() }
      return
    }

    if (button === BUTTONS.BACK) {
      transition(STATES.HOME)
      return
    }

    if (d.state === STATES.READER) {
      if (button === BUTTONS.LEFT || button === BUTTONS.UP) { d.page = Math.max(0, d.page - 1); render(); notify() }
      if (button === BUTTONS.RIGHT || button === BUTTONS.DOWN) { d.page = Math.min(3, d.page + 1); render(); notify() }
      if (button === BUTTONS.CONFIRM) transition(STATES.HOME)
    } else if (d.state === STATES.LIBRARY) {
      if (button === BUTTONS.UP) moveSelected('libraryIndex', books.length, -1)
      if (button === BUTTONS.DOWN) moveSelected('libraryIndex', books.length, 1)
      if (button === BUTTONS.CONFIRM) { d.bookIndex = d.libraryIndex; transition(STATES.READER) }
    } else if (d.state === STATES.GALLERY) {
      if (button === BUTTONS.UP) moveSelected('galleryIndex', images.length, -1)
      if (button === BUTTONS.DOWN) moveSelected('galleryIndex', images.length, 1)
      if (button === BUTTONS.CONFIRM) transition(STATES.HOME)
    } else if (d.state === STATES.SETTINGS) {
      if (button === BUTTONS.UP) moveSelected('settingsIndex', 5, -1)
      if (button === BUTTONS.DOWN) moveSelected('settingsIndex', 5, 1)
    }
  }

  return {
    get state() { return d.state },
    get data() { return d },
    get assets() { return [] },
    get globals() {
      return {
        state: d.state,
        batteryPercent: d.batteryPercent,
        bookTitle: books[d.bookIndex].title,
      }
    },
    handleButton,
    render,
    transition,
    setDebugBorders() {},
  }
}
