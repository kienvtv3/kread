<script>
  import { onMount } from 'svelte'
  import Header from './components/Header.svelte'
  import DeviceFrame from './emulator/DeviceFrame.svelte'
  import Emulator from './emulator/Emulator.svelte'
  import { BUTTONS } from './emulator/state-machine.js'
  import { createScreen } from './emulator/screen.js'
  import BooksTab from './tabs/books/BooksTab.svelte'
  import GalleryTab from './tabs/gallery/GalleryTab.svelte'
  import DeviceTab from './tabs/device/DeviceTab.svelte'
  import { connection } from './stores/connection.svelte.js'
  import { calibration } from './stores/calibration.svelte.js'

  let activeTab = $state('device')
  let emulatorAreaEl
  let fitScale = $state(0.5)
  let emulatorRef
  let bboxOverlays = $state([])

  // Each tab owns its own screen buffer
  const deviceScreen = createScreen()
  const libraryScreen = createScreen()
  const galleryScreen = createScreen()

  let deviceVersion = $state(0)
  let galleryVersion = $state(0)

  function handleConnect() {
    if (connection.connected) connection.disconnect()
    else connection.connect()
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
    window.addEventListener('resize', updateFitScale)
    return () => window.removeEventListener('resize', updateFitScale)
  })

  let emulatorScale = $derived(calibration.ppi > 0 ? calibration.scale : fitScale)
</script>

<div class="app">
  <Header
    connected={connection.connected}
    deviceInfo={connection.deviceInfo}
    error={connection.error}
    onConnect={handleConnect}
    {activeTab}
    onTabChange={(tab) => activeTab = tab}
  />
  <div class="main">
    <div class="emulator-area" bind:this={emulatorAreaEl}>
      <!-- Device tab emulator -->
      <div class="emu-slot" class:hidden={activeTab !== 'device'}>
        <DeviceFrame scale={emulatorScale} screen={deviceScreen} version={deviceVersion} overlays={bboxOverlays}>
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

      <!-- Library tab emulator (placeholder) -->
      <div class="emu-slot" class:hidden={activeTab !== 'library'}>
        <DeviceFrame scale={emulatorScale} screen={libraryScreen} version={0} />
      </div>

      <!-- Gallery tab emulator (placeholder) -->
      <div class="emu-slot" class:hidden={activeTab !== 'gallery'}>
        <DeviceFrame scale={emulatorScale} screen={galleryScreen} version={galleryVersion} />
      </div>

      <Emulator bind:this={emulatorRef} active={activeTab === 'device'}
        screen={deviceScreen} onVersionBump={() => deviceVersion++} />
    </div>
    <div class="controls-area">
      <div class="tab-panel" class:hidden={activeTab !== 'library'}>
        <BooksTab />
      </div>
      <div class="tab-panel" class:hidden={activeTab !== 'gallery'}>
        <GalleryTab screen={galleryScreen} onVersionBump={() => galleryVersion++} />
      </div>
      <div class="tab-panel" class:hidden={activeTab !== 'device'}>
        <DeviceTab {emulatorRef} version={deviceVersion} onOverlayChange={(rects) => bboxOverlays = rects} />
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
