// Emulator state machine — state logic + button handlers
// All drawing delegated to shared ui/ engine

import { beginFrame, flushToScreen } from './text.js'
import { renderHome } from '../lib/ui/screens/home.js'
import { renderLibrary } from '../lib/ui/screens/library.js'
import { renderSettings, renderSettingsDevice } from '../lib/ui/screens/settings.js'
import { renderGalleryList, renderGalleryThumb, renderGalleryFull } from '../lib/ui/screens/gallery.js'
import { renderReader } from '../lib/ui/screens/reader.js'
import { renderBookMenu, renderBookChapters } from '../lib/ui/screens/book-menu.js'
import { setDebugBorders, getDebugBorders } from '../lib/ui/draw.js'
import { clearCache, setLang } from '../lib/ui/asset-loader.js'

export const STATES = {
  HOME: 'HOME',
  READER: 'READER',
  BOOK_MENU: 'BOOK_MENU',
  BOOK_CHAPTERS: 'BOOK_CHAPTERS',
  LIBRARY: 'LIBRARY',
  GALLERY_LIST: 'GALLERY_LIST',
  GALLERY_THUMB: 'GALLERY_THUMB',
  GALLERY_FULL: 'GALLERY_FULL',
  SETTINGS: 'SETTINGS',
  SETTINGS_DEVICE: 'SETTINGS_DEVICE',
  SLEEP: 'SLEEP',
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

export function createStateMachine(screen, onChange) {
  // ---- State data ----
  const d = {
    state: STATES.HOME,
    batteryPercent: 85,
    // Home
    hasBook: false,
    bookTitle: '',
    bookAuthor: '',
    readProgress: 0,
    coverImage: null,
    // Library
    libraryIndex: 0,
    libraryPage: 0,
    // Settings
    settingsIndex: 0,
    // Gallery
    galleryIndex: 0,
    galleryPage: 0,
    // Reader
    currentPage: 0,
    totalPages: 0,
    pages: [],
    // Book menu
    bookMenuIndex: 0,
    chapterIndex: 0,
  }

  const ITEMS_PER_PAGE = 8

  // Demo data
  const library = [
    { title: "Chip War: Fight for the World's Most Critical Technology", author: 'Chris Miller', progress: 5 },
    { title: 'The Pragmatic Programmer', author: 'David Thomas, Andrew Hunt', progress: 42 },
    { title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', progress: 0 },
    { title: 'Structure and Interpretation of Computer Programs', author: 'Harold Abelson', progress: 78 },
    { title: 'The Art of Electronics', author: 'Paul Horowitz', progress: 0 },
    { title: 'Code: The Hidden Language', author: 'Charles Petzold', progress: 100 },
    { title: 'Clean Code', author: 'Robert C. Martin', progress: 15 },
    { title: 'Refactoring', author: 'Martin Fowler', progress: 0 },
    { title: 'The C Programming Language', author: 'Brian Kernighan', progress: 90 },
    { title: 'Computer Networking: A Top-Down Approach', author: 'James Kurose', progress: 0 },
    { title: 'Operating Systems: Three Easy Pieces', author: 'Remzi Arpaci-Dusseau', progress: 33 },
    { title: 'Introduction to Algorithms', author: 'Thomas Cormen', progress: 0 },
    { title: 'Digital Design and Computer Architecture', author: 'David Harris', progress: 12 },
    { title: 'The Mythical Man-Month', author: 'Frederick Brooks', progress: 100 },
    { title: 'Eloquent JavaScript', author: 'Marijn Haverbeke', progress: 0 },
    { title: "You Don't Know JS", author: 'Kyle Simpson', progress: 55 },
    { title: 'Rust Programming Language', author: 'Steve Klabnik', progress: 0 },
    { title: 'Database Internals', author: 'Alex Petrov', progress: 28 },
  ]

  const galleryItems = [
    { name: 'Mountain Sunset', isStarred: false },
    { name: 'Transit Pass - Line 1', isStarred: false },
    { name: 'Ocean Waves', isStarred: true },
    { name: 'Concert Ticket 2026', isStarred: false },
    { name: 'Forest Path', isStarred: false },
    { name: 'City Skyline', isStarred: false },
    { name: 'Museum Pass', isStarred: false },
    { name: 'Starry Night', isStarred: false },
    { name: 'Boarding Pass', isStarred: false },
    { name: 'Abstract Art', isStarred: false },
  ]

  const bookMenuItems = [
    { type: 'action', label: 'Chapters' },
    { type: 'info', label: 'Font', value: 'Literata' },
    { type: 'value', label: 'Font size', options: ['8pt', '10pt', '11pt', '12pt', '14pt'], index: 2, circular: true },
    { type: 'value', label: 'Refresh every', options: ['1 page', '5 pages', '10 pages', '15 pages', '30 pages'], index: 2, circular: true },
    { type: 'value', label: 'Up/Down buttons', options: ['Default', 'Inverted'], index: 0, circular: true },
  ]

  const chapters = [
    'Chapter 1: Introduction', 'Chapter 2: The Transistor',
    'Chapter 3: Silicon Valley', 'Chapter 4: The Cold War',
    'Chapter 5: Japan Rising', 'Chapter 6: The Fabless Revolution',
    'Chapter 7: TSMC', 'Chapter 8: The GPU Era',
  ]

  const settingsItems = [
    { type: 'value', label: 'Sleep timeout', options: ['1 min', '3 min', '5 min', '10 min', 'Never'], index: 2, circular: true },
    { type: 'value', label: 'Sleep image', options: ['Starred', 'Book Cover'], index: 1, circular: true },
    { type: 'value', label: 'Language', options: ['English', 'Tiếng Việt'], index: 0, circular: true },
    { type: 'action', label: 'Device info' },
    { type: 'info', label: 'Firmware', value: 'v0.1.0' },
  ]

  const deviceItems = [
    ['Storage', '28.5 GB free'], ['Temperature', '34°C'],
    ['Battery', '85%'], ['Hardware', 'ESP32-C3 RISC-V'],
    ['Display', '4.26" E-Ink 480×800'], ['Grayscale', '4 levels (2-bit)'],
  ]

  let _lastAssets = []
  let _onLanguageChange = null

  function notify() { if (onChange) onChange({ state: d.state, currentPage: d.currentPage, totalPages: d.totalPages }) }

  function transition(newState) {
    d.state = newState
    render()
    notify()
  }

  // ---- Render dispatch (delegates to ui/ engine) ----

  function render() {
    const ctx = beginFrame()
    let assets = null
    switch (d.state) {
      case STATES.HOME:
        assets = renderHome(ctx, {
          hasBook: d.hasBook, title: d.bookTitle, author: d.bookAuthor,
          progress: d.readProgress, coverImage: d.coverImage, batteryPercent: d.batteryPercent,
          coverImageData: d.coverImageData, coverThumbData: d.coverThumbData,
          titleAsset: d.titleAsset, authorAsset: d.authorAsset,
        }); break
      case STATES.READER:
        if (d.pages.length > 0 && d.pages[d.currentPage]) {
          screen.buffer.set(d.pages[d.currentPage]); screen._version++
          _lastAssets = [{ name: 'page-buffer', type: 'kp', bounds: { x: 0, y: 0, w: 480, h: 800 } }]
          return
        }
        assets = renderReader(ctx, {
          currentPage: d.currentPage, totalPages: d.totalPages,
          book: d.book, pageImageData: d.pageImageData,
        }); break
      case STATES.BOOK_MENU:
        assets = renderBookMenu(ctx, { items: bookMenuItems, selectedIndex: d.bookMenuIndex }); break
      case STATES.BOOK_CHAPTERS:
        assets = renderBookChapters(ctx, {
          chapters, selectedIndex: d.chapterIndex,
          page: Math.floor(d.chapterIndex / 12), perPage: 12,
        }); break
      case STATES.LIBRARY:
        assets = renderLibrary(ctx, {
          books: library, selectedIndex: d.libraryIndex,
          page: d.libraryPage, perPage: ITEMS_PER_PAGE,
        }); break
      case STATES.GALLERY_LIST:
        assets = renderGalleryList(ctx, {
          items: galleryItems, selectedIndex: d.galleryIndex,
          page: d.galleryPage, perPage: 12,
        }); break
      case STATES.GALLERY_THUMB:
        assets = renderGalleryThumb(ctx, {
          item: galleryItems[d.currentPage], currentPage: d.currentPage, totalItems: galleryItems.length,
        }); break
      case STATES.GALLERY_FULL:
        assets = renderGalleryFull(ctx, { item: galleryItems[d.currentPage] }); break
      case STATES.SETTINGS:
        assets = renderSettings(ctx, { items: settingsItems, selectedIndex: d.settingsIndex }); break
      case STATES.SETTINGS_DEVICE:
        assets = renderSettingsDevice(ctx, { items: deviceItems }); break
      case STATES.SLEEP:
        if (d.coverImage) { ctx.drawImage(d.coverImage, 0, 0, 480, 800) }
        else { ctx.fillStyle = 'black'; ctx.fillRect(0, 0, 480, 800) }
        assets = [{ name: 'sleep-screen', type: 'component', bounds: { x: 0, y: 0, w: 480, h: 800 } }]
        break
    }
    _lastAssets = assets || []
    flushToScreen(screen)
  }

  // ---- Button handlers ----

  function handleButton(button) {
    switch (d.state) {
      case STATES.HOME: handleHome(button); break
      case STATES.READER: handleReader(button); break
      case STATES.BOOK_MENU: handleBookMenu(button); break
      case STATES.BOOK_CHAPTERS: handleBookChapters(button); break
      case STATES.LIBRARY: handleLibrary(button); break
      case STATES.GALLERY_LIST: handleGalleryList(button); break
      case STATES.GALLERY_THUMB: handleGalleryThumb(button); break
      case STATES.GALLERY_FULL: handleGalleryFull(button); break
      case STATES.SETTINGS: handleSettings(button); break
      case STATES.SETTINGS_DEVICE: handleSettingsDevice(button); break
    }
  }

  function selectBook(idx) {
    const book = library[idx]
    d.bookTitle = book.title; d.bookAuthor = book.author
    d.readProgress = book.progress; d.hasBook = true
    render(); notify()
  }

  function handleHome(button) {
    if (button === BUTTONS.BACK && d.hasBook) transition(STATES.READER)
    if (button === BUTTONS.CONFIRM) transition(STATES.LIBRARY)
    if (button === BUTTONS.UP) { d.galleryIndex = 0; d.galleryPage = 0; transition(STATES.GALLERY_THUMB) }
    if (button === BUTTONS.DOWN) transition(STATES.SETTINGS)
    if (button === BUTTONS.LEFT) {
      const idx = library.findIndex(b => b.title === d.bookTitle)
      selectBook(idx <= 0 ? library.length - 1 : idx - 1)
    }
    if (button === BUTTONS.RIGHT) {
      const idx = library.findIndex(b => b.title === d.bookTitle)
      selectBook(idx >= library.length - 1 ? 0 : idx + 1)
    }
  }

  async function preloadCurrentPage() {
    if (d.book) {
      const page = await d.book.getPage(d.currentPage)
      if (page) {
        d.pageImageData = page.imageData
      }
      render()
    }
  }

  function handleReader(button) {
    if (button === BUTTONS.RIGHT || button === BUTTONS.DOWN) {
      if (d.currentPage < d.totalPages - 1) { d.currentPage++; preloadCurrentPage(); notify() }
    }
    if (button === BUTTONS.LEFT || button === BUTTONS.UP) {
      if (d.currentPage > 0) { d.currentPage--; preloadCurrentPage(); notify() }
    }
    if (button === BUTTONS.CONFIRM) { d.bookMenuIndex = 0; transition(STATES.BOOK_MENU) }
    if (button === BUTTONS.BACK) transition(STATES.HOME)
  }

  function handleBookMenu(button) {
    if (button === BUTTONS.BACK) { transition(STATES.READER); return }
    if (button === BUTTONS.UP) { d.bookMenuIndex = Math.max(0, d.bookMenuIndex - 1); render(); notify() }
    if (button === BUTTONS.DOWN) { d.bookMenuIndex = Math.min(bookMenuItems.length - 1, d.bookMenuIndex + 1); render(); notify() }
    const item = bookMenuItems[d.bookMenuIndex]
    if (button === BUTTONS.LEFT && item.type === 'value') {
      item.index = item.circular ? (item.index - 1 + item.options.length) % item.options.length : Math.max(0, item.index - 1)
      render(); notify()
    }
    if (button === BUTTONS.RIGHT && item.type === 'value') {
      item.index = item.circular ? (item.index + 1) % item.options.length : Math.min(item.options.length - 1, item.index + 1)
      render(); notify()
    }
    if (button === BUTTONS.CONFIRM && item.type === 'action') { d.chapterIndex = 0; transition(STATES.BOOK_CHAPTERS) }
  }

  function handleBookChapters(button) {
    if (button === BUTTONS.BACK) { transition(STATES.BOOK_MENU); return }
    if (button === BUTTONS.UP) { d.chapterIndex = Math.max(0, d.chapterIndex - 1); render(); notify() }
    if (button === BUTTONS.DOWN) { d.chapterIndex = Math.min(chapters.length - 1, d.chapterIndex + 1); render(); notify() }
    if (button === BUTTONS.CONFIRM) transition(STATES.READER)
  }

  function handleLibrary(button) {
    if (button === BUTTONS.BACK) transition(STATES.HOME)
    if (button === BUTTONS.CONFIRM) {
      const idx = d.libraryPage * ITEMS_PER_PAGE + d.libraryIndex
      if (idx < library.length) {
        selectBook(idx); d.coverImage = null; transition(STATES.READER); return
      }
    }
    if (button === BUTTONS.UP) {
      if (d.libraryIndex > 0) { d.libraryIndex-- }
      else if (d.libraryPage > 0) { d.libraryPage--; d.libraryIndex = ITEMS_PER_PAGE - 1 }
      render(); notify()
    }
    if (button === BUTTONS.DOWN) {
      const pageCount = Math.min(ITEMS_PER_PAGE, library.length - d.libraryPage * ITEMS_PER_PAGE)
      if (d.libraryIndex < pageCount - 1) { d.libraryIndex++ }
      else if ((d.libraryPage + 1) * ITEMS_PER_PAGE < library.length) { d.libraryPage++; d.libraryIndex = 0 }
      render(); notify()
    }
    if (button === BUTTONS.LEFT && d.libraryPage > 0) { d.libraryPage--; d.libraryIndex = 0; render(); notify() }
    if (button === BUTTONS.RIGHT && (d.libraryPage + 1) * ITEMS_PER_PAGE < library.length) { d.libraryPage++; d.libraryIndex = 0; render(); notify() }
  }

  function handleGalleryList(button) {
    const GPP = 12
    if (button === BUTTONS.BACK) transition(STATES.HOME)
    if (button === BUTTONS.UP) {
      if (d.galleryIndex > 0) d.galleryIndex--
      else if (d.galleryPage > 0) { d.galleryPage--; d.galleryIndex = GPP - 1 }
      render(); notify()
    }
    if (button === BUTTONS.DOWN) {
      const pageCount = Math.min(GPP, galleryItems.length - d.galleryPage * GPP)
      if (d.galleryIndex < pageCount - 1) d.galleryIndex++
      else if ((d.galleryPage + 1) * GPP < galleryItems.length) { d.galleryPage++; d.galleryIndex = 0 }
      render(); notify()
    }
    if (button === BUTTONS.LEFT && d.galleryPage > 0) { d.galleryPage--; d.galleryIndex = 0; render(); notify() }
    if (button === BUTTONS.RIGHT && (d.galleryPage + 1) * GPP < galleryItems.length) { d.galleryPage++; d.galleryIndex = 0; render(); notify() }
    if (button === BUTTONS.CONFIRM) { d.currentPage = d.galleryPage * GPP + d.galleryIndex; transition(STATES.GALLERY_VIEW) }
  }

  function handleGalleryThumb(button) {
    if (button === BUTTONS.BACK) transition(STATES.HOME)
    if (button === BUTTONS.LEFT) { d.currentPage = d.currentPage <= 0 ? galleryItems.length - 1 : d.currentPage - 1; render(); notify() }
    if (button === BUTTONS.RIGHT) { d.currentPage = d.currentPage >= galleryItems.length - 1 ? 0 : d.currentPage + 1; render(); notify() }
    if (button === BUTTONS.DOWN) { galleryItems.forEach(g => g.isStarred = false); galleryItems[d.currentPage].isStarred = true; render(); notify() }
    if (button === BUTTONS.CONFIRM) { d.galleryIndex = d.currentPage % 12; d.galleryPage = Math.floor(d.currentPage / 12); transition(STATES.GALLERY_LIST) }
    if (button === BUTTONS.UP) transition(STATES.GALLERY_FULL)
  }

  function handleGalleryFull(button) {
    if (button === BUTTONS.BACK) transition(STATES.GALLERY_THUMB)
    if (button === BUTTONS.CONFIRM) transition(STATES.GALLERY_THUMB)
    if (button === BUTTONS.LEFT) { d.currentPage = d.currentPage <= 0 ? galleryItems.length - 1 : d.currentPage - 1; render(); notify() }
    if (button === BUTTONS.RIGHT) { d.currentPage = d.currentPage >= galleryItems.length - 1 ? 0 : d.currentPage + 1; render(); notify() }
  }

  function getLangCode() {
    return settingsItems[2].index === 0 ? 'en' : 'vi'
  }

  function handleSettings(button) {
    if (button === BUTTONS.BACK) transition(STATES.HOME)
    if (button === BUTTONS.UP) { d.settingsIndex = Math.max(0, d.settingsIndex - 1); render(); notify() }
    if (button === BUTTONS.DOWN) { d.settingsIndex = Math.min(settingsItems.length - 1, d.settingsIndex + 1); render(); notify() }
    const item = settingsItems[d.settingsIndex]
    if ((button === BUTTONS.LEFT || button === BUTTONS.RIGHT) && item.type === 'value') {
      const prevLang = getLangCode()
      if (button === BUTTONS.LEFT) {
        item.index = item.circular ? (item.index - 1 + item.options.length) % item.options.length : Math.max(0, item.index - 1)
      } else {
        item.index = item.circular ? (item.index + 1) % item.options.length : Math.min(item.options.length - 1, item.index + 1)
      }
      // Reload assets if language changed
      const newLang = getLangCode()
      if (item === settingsItems[2] && newLang !== prevLang) {
        setLang(newLang)
        clearCache()
        if (_onLanguageChange) _onLanguageChange(newLang)
      }
      render(); notify()
    }
    if (button === BUTTONS.CONFIRM && item.type === 'action') transition(STATES.SETTINGS_DEVICE)
  }

  function handleSettingsDevice(button) {
    if (button === BUTTONS.BACK) transition(STATES.SETTINGS)
  }

  // ---- Public API ----

  return {
    get state() { return d.state },
    get data() { return d },
    get assets() { return _lastAssets },
    get globals() {
      return {
        state: d.state,
        batteryPercent: d.batteryPercent,
        hasBook: d.hasBook,
        bookTitle: d.bookTitle,
        sleepTimeout: settingsItems[0]?.options[settingsItems[0].index] || '5 min',
        language: settingsItems[2]?.options[settingsItems[2].index] || 'English',
        langCode: getLangCode(),
      }
    },
    handleButton,
    render,
    transition,
    setPages(pageBuffers) { d.pages = pageBuffers; d.totalPages = pageBuffers.length; d.currentPage = 0 },
    setCoverImage(img) { d.coverImage = img },
    setBookInfo(title, author, progress) {
      d.bookTitle = title || ''; d.bookAuthor = author || ''
      d.readProgress = progress || 0; d.hasBook = !!(title && title !== '')
    },
    async loadBook(kbReader) {
      d.book = kbReader
      d.hasBook = true
      d.bookTitle = kbReader.metadata?.title || ''
      d.bookAuthor = kbReader.metadata?.author || ''
      d.totalPages = kbReader.pageCount
      d.currentPage = 0
      d.readProgress = 0

      // Pre-decode cover thumbnail for home screen (240×400)
      const thumb = await kbReader.getCoverThumb()
      if (thumb) d.coverThumbData = thumb
      // Full cover as fallback
      const cover = await kbReader.getCover()
      if (cover) d.coverImageData = cover

      // Pre-decode title/author assets
      const title = await kbReader.getTitle()
      if (title) d.titleAsset = title
      const author = await kbReader.getAuthor()
      if (author) d.authorAsset = author

      // Pre-decode first page
      const page = await kbReader.getPage(0)
      if (page) {
        d.pageImageData = page.imageData
      }

      render()
    },
    setScreenBuffer(buf) { screen.buffer.set(buf); screen._version++ },
    setDebugBorders(on) { setDebugBorders(on); render() },
    get debugBorders() { return getDebugBorders() },
    set onLanguageChange(fn) { _onLanguageChange = fn },
  }
}
