<script>
  import { onMount } from 'svelte'
  import Header from './components/Header.svelte'
  import DeviceFrame from './emulator/DeviceFrame.svelte'
  import Emulator from './emulator/Emulator.svelte'
  import { BUTTONS } from './emulator/state-machine.js'
  import { createScreen } from './emulator/screen.js'
  import BooksTab from './tabs/books/BooksTab.svelte'
  import GalleryTab from './tabs/gallery/GalleryTab.svelte'
  import EmulatorTab from './tabs/device/EmulatorTab.svelte'
  import FirmwareTab from './tabs/device/FirmwareTab.svelte'
  import { calibration } from './stores/calibration.svelte.js'

  const ROUTES = ['book', 'image', 'design', 'firmware']

  let activeTab = $state('book')
  let emulatorAreaEl
  let fitScale = $state(0.5)
  let emulatorRef = $state(null)
  let bboxOverlays = $state([])

  const previewScreen = createScreen()
  const emulatorScreen = createScreen()

  let previewVersion = $state(0)
  let emulatorVersion = $state(0)

  function pathToTab(pathname = '') {
    const cleaned = (pathname || window.location.pathname).replace(/\/+$/g, '')
    if (!cleaned) return 'book'
    const parts = cleaned.split('/').filter(Boolean)
    const last = parts[parts.length - 1]
    if (ROUTES.includes(last)) return last
    if (last === 'kread') return 'book'
    return 'book'
  }

  function syncRoute() {
    const nextTab = pathToTab()
    if (ROUTES.includes(nextTab) && nextTab !== activeTab) {
      activeTab = nextTab
    }
  }

  function navigateTab(tab) {
    if (!ROUTES.includes(tab) || activeTab === tab) return
    activeTab = tab
    history.pushState({ tab }, '', `/${tab}`)
  }

  function ensureRoute() {
    const tab = pathToTab()
    if (!ROUTES.includes(tab) || window.location.pathname === '/' || window.location.pathname === '/kread') {
      history.replaceState({ tab: 'book' }, '', '/book')
      activeTab = 'book'
      return
    }
    activeTab = tab
  }

  function updateFitScale() {
    if (!emulatorAreaEl) return
    const h = emulatorAreaEl.clientHeight - 100
    const w = emulatorAreaEl.clientWidth - 48
    const autoScale = Math.min(h / 900, w / 560)
    fitScale = Math.max(0.35, Math.min(1, autoScale))
  }

  onMount(() => {
    updateFitScale()
    ensureRoute()
    window.addEventListener('popstate', syncRoute)
    window.addEventListener('resize', updateFitScale)
    return () => {
      window.removeEventListener('popstate', syncRoute)
      window.removeEventListener('resize', updateFitScale)
    }
  })

  let emulatorScale = $derived(calibration.ppi > 0 ? calibration.scale : fitScale)
</script>

<div class="app">
  <Header {activeTab} onTabChange={navigateTab} />
  <div class="main">
    <div class="emulator-area" bind:this={emulatorAreaEl}>
      <!-- Book tab emulator -->
      <div class="emu-slot" class:hidden={activeTab !== 'book'}>
        <DeviceFrame scale={emulatorScale} screen={previewScreen} version={previewVersion} overlays={bboxOverlays}>
          {#snippet buttons()}
            {#if emulatorRef}
              <button class="hw-btn" onclick={() => emulatorRef.handleButton(BUTTONS.BACK)}>back</button>
              <button class="hw-btn" onclick={() => emulatorRef.handleButton(BUTTONS.CONFIRM)}>ok</button>
              <span class="btn-sep"></span>
              <button class="hw-btn" onclick={() => emulatorRef.handleButton(BUTTONS.LEFT)}>left</button>
              <button class="hw-btn" onclick={() => emulatorRef.handleButton(BUTTONS.RIGHT)}>right</button>
              <span class="btn-sep"></span>
              <div class="btn-col">
                <button class="hw-btn" onclick={() => emulatorRef.handleButton(BUTTONS.UP)}>up</button>
                <button class="hw-btn" onclick={() => emulatorRef.handleButton(BUTTONS.DOWN)}>down</button>
              </div>
            {/if}
          {/snippet}
        </DeviceFrame>
      </div>

      <!-- Image tab emulator -->
      <div class="emu-slot" class:hidden={activeTab !== 'image'}>
        <DeviceFrame scale={emulatorScale} screen={previewScreen} version={previewVersion} />
      </div>

      <!-- Design tab for UI simulation + calibration -->
      <div class="emu-slot" class:hidden={activeTab !== 'design'}>
        <DeviceFrame scale={emulatorScale} screen={emulatorScreen} version={emulatorVersion} />
      </div>

      <Emulator bind:this={emulatorRef} active={activeTab === 'design'}
        screen={emulatorScreen} onVersionBump={() => emulatorVersion++} />
    </div>
    <div class="controls-area">
      <div class="tab-panel" class:hidden={activeTab !== 'book'}>
        <BooksTab screen={previewScreen} onVersionBump={() => previewVersion++} />
      </div>
      <div class="tab-panel" class:hidden={activeTab !== 'image'}>
        <GalleryTab screen={previewScreen} onVersionBump={() => previewVersion++} />
      </div>
      <div class="tab-panel" class:hidden={activeTab !== 'design'}>
        <EmulatorTab {emulatorRef} version={emulatorVersion} onOverlayChange={(rects) => bboxOverlays = rects} />
      </div>
      <div class="tab-panel" class:hidden={activeTab !== 'firmware'}>
        <FirmwareTab />
      </div>
    </div>
  </div>
</div>

<style>
  .app {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }
  .emulator-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-lg);
    border-right: 1px solid var(--color-border);
    min-width: 33vw;
    gap: var(--space-md);
  }
  .emu-slot.hidden {
    display: none;
  }
  .controls-area {
    flex: 1;
    padding: var(--space-lg);
    overflow-y: auto;
  }
  .tab-panel {
    height: 100%;
  }
  .tab-panel.hidden {
    display: none;
  }

  :global(.hw-btn) {
    width: 44px;
    height: 26px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.08);
    font-family: var(--font-mono);
    font-size: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(255, 255, 255, 0.5);
    cursor: pointer;
    transition: all 0.1s;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
  }
  :global(.hw-btn:hover) {
    background: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.8);
  }
  :global(.hw-btn:active) {
    background: rgba(255, 255, 255, 0.25);
    color: white;
  }
  :global(.btn-sep) { width: 8px; }
  :global(.btn-col) { display: flex; flex-direction: column; gap: 3px; }

</style>
