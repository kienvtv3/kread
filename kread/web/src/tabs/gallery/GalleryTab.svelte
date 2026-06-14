<script>
  import SubViewToggle from '../../components/SubViewToggle.svelte'
  import DropZone from '../../components/DropZone.svelte'
  import { connection } from '../../stores/connection.svelte.js'
  import {
    quantizeGamma,
    quantizeAtkinson,
    quantizeFloydSteinberg,
    quantizeBayer8x8,
    quantizeStucki,
    quantizeJarvis,
    quantizeBlueNoise,
  } from '../../lib/eink/quantize.js'

  let { screen, onVersionBump } = $props()

  let subView = $state('create')

  const SCREEN_W = 480
  const SCREEN_H = 800

  const algorithms = [
    { id: 'gamma',           name: 'Gamma Threshold',     desc: 'Clean quantize, no dithering. Best for text & clean images.',  fn: quantizeGamma,          hasGamma: true },
    { id: 'atkinson',        name: 'Atkinson',            desc: 'Classic Mac. 75% diffusion, preserves highlights.',             fn: quantizeAtkinson,       hasGamma: true, hasStrength: true },
    { id: 'floyd-steinberg', name: 'Floyd-Steinberg',     desc: 'Classic 100% diffusion. Balanced detail & smoothness.',         fn: quantizeFloydSteinberg, hasGamma: true, hasStrength: true },
    { id: 'stucki',          name: 'Stucki',              desc: '12-neighbor diffusion. Smoothest gradients of all.',            fn: quantizeStucki,         hasGamma: true, hasStrength: true },
    { id: 'jarvis',          name: 'Jarvis-Judice-Ninke', desc: '12-neighbor, different weights. Very smooth, soft feel.',       fn: quantizeJarvis,         hasGamma: true, hasStrength: true },
    { id: 'bayer8',          name: 'Bayer 8×8',           desc: 'Ordered pattern. Regular dots, no error artifacts.',            fn: quantizeBayer8x8,       hasGamma: true, hasStrength: true },
    { id: 'blue-noise',      name: 'Blue Noise',          desc: 'Gradient noise. No repeating pattern. Natural organic feel.',   fn: quantizeBlueNoise,      hasGamma: true, hasStrength: true },
  ]

  let selectedAlgo = $state('atkinson')
  let gamma = $state(1.8)
  let strength = $state(0.5)
  let imageFile = $state(null)
  let imageName = $state('')
  let imageWidth = $state(0)
  let imageHeight = $state(0)
  let converting = $state(false)
  let loadedImg = $state(null)

  let currentAlgo = $derived(algorithms.find(a => a.id === selectedAlgo))

  function handleFile(file) {
    if (!file || !file.type.match(/^image\/(jpeg|png|webp|gif|bmp)$/)) return
    imageFile = file
    imageName = file.name

    const img = new Image()
    img.onload = () => {
      imageWidth = img.naturalWidth
      imageHeight = img.naturalHeight
      loadedImg = img
      convertAndDisplay(img)
    }
    img.src = URL.createObjectURL(file)
  }

  function convertAndDisplay(img) {
    if (!img || !screen) return
    converting = true

    // Use requestAnimationFrame to avoid blocking UI
    requestAnimationFrame(() => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = SCREEN_W
        canvas.height = SCREEN_H
        const ctx = canvas.getContext('2d')

        // White background
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, SCREEN_W, SCREEN_H)

        // Fit-contain: scale image to fit within screen bounds
        const scaleX = SCREEN_W / img.naturalWidth
        const scaleY = SCREEN_H / img.naturalHeight
        const scale = Math.min(scaleX, scaleY)
        const dw = Math.round(img.naturalWidth * scale)
        const dh = Math.round(img.naturalHeight * scale)
        const dx = Math.round((SCREEN_W - dw) / 2)
        const dy = Math.round((SCREEN_H - dh) / 2)

        ctx.drawImage(img, dx, dy, dw, dh)

        const imageData = ctx.getImageData(0, 0, SCREEN_W, SCREEN_H)

        // Run selected quantize algorithm
        const algo = algorithms.find(a => a.id === selectedAlgo)
        let pixels
        if (algo.hasStrength) {
          pixels = algo.fn(imageData.data, SCREEN_W, SCREEN_H, gamma, strength)
        } else if (algo.hasGamma) {
          pixels = algo.fn(imageData.data, SCREEN_W, SCREEN_H, gamma)
        } else {
          pixels = algo.fn(imageData.data, SCREEN_W, SCREEN_H)
        }

        // Write to screen buffer
        for (let y = 0; y < SCREEN_H; y++) {
          for (let x = 0; x < SCREEN_W; x++) {
            screen.setPixel(x, y, pixels[y * SCREEN_W + x])
          }
        }
        screen._version++
        if (onVersionBump) onVersionBump()
      } finally {
        converting = false
      }
    })
  }

  // Re-convert when algorithm or gamma changes
  $effect(() => {
    // Track reactive deps
    const _algo = selectedAlgo
    const _gamma = gamma
    const _strength = strength
    if (loadedImg) {
      convertAndDisplay(loadedImg)
    }
  })

  let outputBytes = $derived(SCREEN_W * SCREEN_H / 4) // 2bpp
</script>

<div class="gallery-tab">
  <SubViewToggle
    active={subView}
    disabled={!connection.connected}
    onToggle={(v) => subView = v}
  />

  {#if subView === 'create'}
    <!-- Image upload -->
    {#if !imageFile}
      <DropZone
        accept="image/jpeg,image/png,image/webp,image/gif,image/bmp"
        label="Drop image here (JPG, PNG)"
        onFile={handleFile}
      />
    {:else}
      <div class="loaded-file">
        <span class="file-name">{imageName}</span>
        <button class="clear-btn" onclick={() => { imageFile = null; loadedImg = null; imageName = ''; screen.clear(); screen._version++; if (onVersionBump) onVersionBump() }}>Clear</button>
      </div>
    {/if}

    <!-- Algorithm selector -->
    <div class="section">
      <label class="section-label">Algorithm</label>
      <div class="algo-list">
        {#each algorithms as algo}
          <button
            class="algo-btn"
            class:active={selectedAlgo === algo.id}
            onclick={() => selectedAlgo = algo.id}
          >
            <span class="algo-name">{algo.name}</span>
            <span class="algo-desc">{algo.desc}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Gamma slider -->
    {#if currentAlgo?.hasGamma}
      <div class="section">
        <label class="section-label">
          Gamma <span class="value">{gamma.toFixed(1)}</span>
        </label>
        <input
          type="range"
          min="0.5"
          max="3.0"
          step="0.1"
          bind:value={gamma}
          class="slider"
        />
        <div class="slider-labels">
          <span>0.5</span>
          <span>1.8</span>
          <span>3.0</span>
        </div>
      </div>
    {/if}

    <!-- Strength slider (Atkinson only) -->
    {#if currentAlgo?.hasStrength}
      <div class="section">
        <label class="section-label">
          Strength <span class="value">{(strength * 100).toFixed(0)}%</span>
        </label>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          bind:value={strength}
          class="slider"
        />
        <div class="slider-labels">
          <span>0% (clean)</span>
          <span>50%</span>
          <span>100% (full)</span>
        </div>
      </div>
    {/if}

    <!-- Info -->
    {#if imageFile}
      <div class="section info">
        <div class="info-row">
          <span class="info-label">Source</span>
          <span class="info-value">{imageWidth} x {imageHeight}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Output</span>
          <span class="info-value">{SCREEN_W} x {SCREEN_H} @ 2bpp ({(outputBytes / 1024).toFixed(0)} KB)</span>
        </div>
        <div class="info-row">
          <span class="info-label">Method</span>
          <span class="info-value">{currentAlgo?.name}{currentAlgo?.hasGamma ? ` γ=${gamma.toFixed(1)}` : ''}{currentAlgo?.hasStrength ? ` str=${(strength*100).toFixed(0)}%` : ''}</span>
        </div>
        {#if converting}
          <div class="info-row">
            <span class="info-label">Status</span>
            <span class="info-value converting">Converting...</span>
          </div>
        {/if}
      </div>
    {/if}
  {:else}
    <p class="placeholder">Gallery — On Device (coming soon)</p>
  {/if}
</div>

<style>
  .gallery-tab {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .loaded-file {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--color-border-heavy);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .file-name {
    color: var(--color-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .clear-btn {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-secondary);
    padding: var(--space-xs) var(--space-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    flex-shrink: 0;
    margin-left: var(--space-sm);
  }
  .clear-btn:hover {
    color: var(--color-text);
    border-color: var(--color-text);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .section-label {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
  }
  .section-label .value {
    color: var(--color-text);
    font-weight: 400;
  }

  .algo-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    border: 1px solid var(--color-border-heavy);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .algo-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: var(--space-sm) var(--space-md);
    font-family: var(--font-mono);
    text-align: left;
    cursor: pointer;
    transition: all 0.1s;
    border-bottom: 1px solid var(--color-border);
  }
  .algo-btn:last-child {
    border-bottom: none;
  }
  .algo-btn:hover {
    background: var(--color-highlight);
  }
  .algo-btn.active {
    background: var(--color-text);
    color: var(--color-bg);
  }
  .algo-name {
    font-size: 12px;
    font-weight: 500;
  }
  .algo-desc {
    font-size: 10px;
    opacity: 0.6;
    margin-top: 1px;
  }
  .algo-btn.active .algo-desc {
    opacity: 0.7;
  }

  .slider {
    width: 100%;
    accent-color: var(--color-text);
    cursor: pointer;
  }
  .slider-labels {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 9px;
    color: var(--color-text-secondary);
  }

  .info {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    gap: var(--space-xs);
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-size: 11px;
  }
  .info-label {
    color: var(--color-text-secondary);
  }
  .info-value {
    color: var(--color-text);
  }
  .converting {
    animation: pulse 1s infinite;
  }

  .placeholder {
    color: var(--color-text-secondary);
    font-size: 14px;
    padding: var(--space-xl);
    text-align: center;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }
</style>
