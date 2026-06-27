const STORAGE_KEY = 'kread-saved-fonts'

const DEFAULT_FONTS = [
  { name: 'Zilla Slab', url: 'https://fonts.googleapis.com/css2?family=Zilla+Slab:ital,wght@0,400;0,700;1,400&display=swap' },
]

const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
let fonts = $state(saved || [...DEFAULT_FONTS])

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fonts))
}

function addFont(name, url) {
  if (fonts.some(f => f.url === url)) return
  fonts = [...fonts, { name, url }]
  save()
}

function removeFont(url) {
  fonts = fonts.filter(f => f.url !== url)
  save()
}

export const fontsStore = {
  get fonts() { return fonts },
  addFont,
  removeFont,
}
