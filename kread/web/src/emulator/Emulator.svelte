<script>
  import { onMount } from 'svelte'
  import { createStateMachine, BUTTONS } from './state-machine.js'
  import { preloadAssets } from '../lib/ui/asset-loader.js'
  import { assets as allAssetDefs } from '../lib/ui/defs.js'
  import { KbReader } from '../lib/kb/kb-reader.js'

  let { active = true, screen, onVersionBump } = $props()

  let machine = createStateMachine(screen, () => onVersionBump?.())

  export function handleButton(button) {
    machine.handleButton(button)
    onVersionBump?.()
  }

  export function setDebugBorders(on) {
    machine.setDebugBorders(on)
    onVersionBump?.()
  }

  export function getAssets() { return machine.assets }
  export function getGlobals() { return machine.globals }

  function handleKeydown(e) {
    if (!active) return
    const keyMap = {
      ArrowLeft: BUTTONS.LEFT,
      ArrowRight: BUTTONS.RIGHT,
      ArrowUp: BUTTONS.UP,
      ArrowDown: BUTTONS.DOWN,
      Escape: BUTTONS.BACK,
      Backspace: BUTTONS.BACK,
      Enter: BUTTONS.CONFIRM,
    }
    const button = keyMap[e.key]
    if (button) {
      e.preventDefault()
      handleButton(button)
    }
  }

  // Build asset key list once
  const assetKeys = [
    ...Object.keys(allAssetDefs),
    'battery.frame', 'progress.frame', 'arrow.left', 'arrow.right',
    ...Array.from({ length: 99 }, (_, i) => `progress.${i + 1}`),
  ]

  // Handle language switching: reload assets from new language folder
  machine.onLanguageChange = async (langCode) => {
    await preloadAssets(assetKeys, langCode)
    machine.render()
    onVersionBump?.()
  }

  onMount(async () => {
    // Preload all pre-rendered UI assets
    await preloadAssets(assetKeys, 'en')

    // Load demo book from .kb file
    try {
      const resp = await fetch(`${import.meta.env.BASE_URL}demo.kb`)
      if (resp.ok) {
        const buffer = await resp.arrayBuffer()
        const book = new KbReader(buffer)
        await book.init()
        await machine.loadBook(book)
      }
    } catch (e) {
      console.warn('Could not load demo.kb:', e)
    }

    machine.render()
    onVersionBump?.()
  })

  export { BUTTONS }
</script>

<svelte:window onkeydown={handleKeydown} />
