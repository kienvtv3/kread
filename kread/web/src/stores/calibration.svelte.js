const STORAGE_KEY = 'kread-screen-ppi'

let ppi = $state(parseFloat(localStorage.getItem(STORAGE_KEY)) || 0)

// Device screen: 480px at 217 PPI = physical width
// Scale = (physical width in monitor pixels) / 480
let scale = $derived(ppi > 0 ? (480 / 217 * ppi) / 480 : 0.5)

function setPpi(value) {
  ppi = Math.round(value * 10) / 10
  localStorage.setItem(STORAGE_KEY, String(ppi))
}

function reset() {
  ppi = 0
  localStorage.removeItem(STORAGE_KEY)
}

export const calibration = {
  get ppi() { return ppi },
  get scale() { return scale },
  setPpi,
  reset,
}
