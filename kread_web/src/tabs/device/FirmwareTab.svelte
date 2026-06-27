<script>
  import { onMount } from 'svelte'

  let releases = $state([])
  let loadingReleases = $state(false)
  let releaseError = $state(null)
  let selectedRelease = $state(null)
  let selectedAsset = $state(null)

  let serialState = $state('disconnected')
  let serialError = $state('')
  let flashProgress = $state(0)
  let flashing = $state(false)
  let flashLog = $state([])

  const firmwareRepo = 'kienvtv3/kread'

  function isFirmwareAsset(asset) {
    return /\.(bin|elf|hex|zip)$/i.test(asset.name)
  }

  const releaseAssets = $derived((selectedRelease?.assets || []).filter(isFirmwareAsset))

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  }

  function sizeText(size) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function fetchReleases() {
    loadingReleases = true
    releaseError = null
    try {
      const res = await fetch(`https://api.github.com/repos/${firmwareRepo}/releases`)
      if (!res.ok) throw new Error(`${res.status}`)
      releases = await res.json()
      if (releases.length > 0 && !selectedRelease) {
        selectedRelease = releases[0]
      }
    } catch (e) {
      releaseError = e.message
    } finally {
      loadingReleases = false
    }
  }

  function pickRelease(release) {
    selectedRelease = release
    selectedAsset = null
    flashLog = []
    flashProgress = 0
  }

  function pickAsset(asset) {
    selectedAsset = asset
    flashLog = []
    flashProgress = 0
  }

  function canRunSerialFlow() {
    return serialState === 'connected' && !!selectedAsset && !!selectedRelease
  }

  const canUseSerial = $derived(typeof navigator !== 'undefined' && 'serial' in navigator)

  async function connectSerial() {
    if (!canUseSerial) {
      serialError = 'Web Serial API is not available in this browser.'
      return
    }

    serialError = ''
    try {
      const port = await navigator.serial.requestPort()
      await port.open({ baudRate: 115200 })
      serialState = 'connected'
      flashLog = [{ time: Date.now(), text: `Connected to serial port: ${port.getInfo ? JSON.stringify(port.getInfo()) : 'ok'}` }]
    } catch (e) {
      serialState = 'disconnected'
      serialError = e.message
    }
  }

  async function disconnectSerial() {
    serialState = 'disconnected'
    flashLog = [...flashLog, { time: Date.now(), text: 'Disconnected from serial.' }]
  }

  function addLog(text) {
    flashLog = [...flashLog, { time: Date.now(), text }]
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async function simulateFlash() {
    if (!canRunSerialFlow() || flashing) return

    flashing = true
    flashProgress = 0
    addLog('Bootloader sync started')
    await delay(350)
    flashProgress = 15
    addLog('Serial protocol selected, ready to receive firmware payload')
    await delay(500)
    flashProgress = 40
    addLog(`Downloading ${selectedAsset.name} from GitHub (${formatBytes(selectedAsset.size)})`)
    await delay(600)
    flashProgress = 65
    addLog('Writing firmware to flash')
    await delay(650)
    flashProgress = 95
    addLog('Verifying checksum, rebooting')
    await delay(500)
    flashProgress = 100
    addLog('Done. Device should appear in firmware mode.')
    flashing = false
  }

  onMount(() => {
    fetchReleases()
  })
</script>

<div class="firmware-tab">
  <section>
    <h3>Firmware from GitHub releases</h3>
    {#if loadingReleases}
      <p class="muted-text">Loading releases...</p>
    {:else if releaseError}
      <p class="error-text">Cannot load releases: {releaseError}</p>
    {:else if releases.length === 0}
      <p class="muted-text">No release yet.</p>
    {:else}
      <p class="muted-text">Repo: <a href={`https://github.com/${firmwareRepo}/releases`} target="_blank" rel="noreferrer">github.com/{firmwareRepo}/releases</a></p>
      <div class="release-list">
        {#each releases as release, i}
          <button
            class="release-btn"
            class:active={selectedRelease && selectedRelease.id === release.id}
            onclick={() => pickRelease(release)}
          >
            <span class="release-tag">{release.tag_name}</span>
            {#if i === 0}<span class="badge">latest</span>{/if}
            <span class="release-date">{formatDate(release.published_at)}</span>
          </button>
        {/each}
      </div>

      {#if selectedRelease}
        <p class="release-notes">{selectedRelease.body ? selectedRelease.body.slice(0, 220) : 'No notes provided.'}</p>
      {/if}
    {/if}
  </section>

  <section>
    <h3>Step 1: connect through serial</h3>
    <div class="row">
      <button class="action-btn" onclick={connectSerial} disabled={serialState === 'connected' || !canUseSerial}>
        {serialState === 'connected' ? 'connected' : 'connect through serial'}
      </button>
      <button class="action-btn" onclick={disconnectSerial} disabled={serialState !== 'connected'}>
        disconnect
      </button>
    </div>
    <p class="status">Serial: <span>{serialState}</span></p>
    {#if serialError}
      <p class="error-text">{serialError}</p>
    {/if}
    {#if !canUseSerial}
      <p class="muted-text">Tip: use Chrome/Edge to enable Web Serial API.</p>
    {/if}
  </section>

  <section>
    <h3>Step 2: choose firmware asset</h3>
    {#if !selectedRelease}
      <p class="muted-text">Pick a release first.</p>
    {:else if releaseAssets.length === 0}
      <p class="muted-text">No firmware asset found in this release.</p>
    {:else}
      <div class="asset-list">
        {#each releaseAssets as asset}
          <button
            class="asset-btn"
            class:active={selectedAsset && selectedAsset.id === asset.id}
            onclick={() => pickAsset(asset)}
          >
            <span>{asset.name}</span>
            <span class="muted">{sizeText(asset.size)}</span>
          </button>
        {/each}
      </div>
    {/if}
  </section>

  <section>
    <h3>Step 3: flash on serial</h3>
    <div class="row">
      <button
        class="action-btn"
        disabled={!canRunSerialFlow() || flashing}
        onclick={simulateFlash}
      >
        {flashing ? 'Flashing...' : 'flash firmware (simulate)'}
      </button>
      <a class="small-link" href={selectedAsset?.browser_download_url || ''} target="_blank" rel="noreferrer" aria-disabled={!selectedAsset}>
        download firmware file
      </a>
    </div>

    <div class="progress-wrap">
      <progress max="100" value={flashProgress}></progress>
      <span>{flashProgress}%</span>
    </div>

    {#if flashLog.length > 0}
      <div class="log">
        {#each flashLog as item}
          <div class="log-row">
            <span class="time">{new Date(item.time).toLocaleTimeString('en-US', { hour12: false })}</span>
            <span>{item.text}</span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .firmware-tab { display: flex; flex-direction: column; gap: var(--space-lg); }
  section { display: flex; flex-direction: column; gap: var(--space-sm); }
  h3 { font-family: var(--font-heading); font-size: 14px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid var(--color-text); padding-bottom: var(--space-xs); margin-bottom: var(--space-sm); }
  .release-list, .asset-list, .row { display: flex; flex-wrap: wrap; gap: var(--space-sm); }
  .release-btn, .asset-btn, .action-btn {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--color-border-heavy);
    border-radius: var(--radius-sm);
    font-size: 13px;
    background: var(--color-bg-card);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .release-btn.active,
  .asset-btn.active,
  .action-btn:hover { border-color: var(--color-text); }
  .badge { font-size: 10px; padding: 1px 6px; border: 1px solid var(--color-success); color: var(--color-success); border-radius: 2px; text-transform: uppercase; }
  .release-date { color: var(--color-text-secondary); font-size: 12px; }
  .release-tag { font-weight: 600; }
  .release-notes { font-size: 12px; color: var(--color-text-secondary); line-height: 1.5; max-height: 72px; overflow: hidden; }
  .status { color: var(--color-text-secondary); font-size: 13px; }
  .muted-text { color: var(--color-text-secondary); font-size: 13px; }
  .error-text { color: var(--color-error); font-size: 13px; }
  .muted { font-size: 12px; color: var(--color-text-secondary); }
  .small-link {
    font-size: 12px;
    color: var(--color-accent);
    text-decoration: underline;
    align-self: center;
  }
  .progress-wrap {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-mono);
    font-size: 12px;
  }
  progress {
    width: 100%;
  }
  .log {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: var(--space-sm);
    font-size: 11px;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    max-height: 150px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.06);
  }
  .log-row { display: flex; align-items: baseline; gap: var(--space-sm); }
  .time { color: var(--color-text-secondary); }
  .asset-btn, .release-btn { min-width: 260px; justify-content: space-between; }

  .action-btn[disabled],
  .asset-btn[disabled],
  .release-btn[disabled],
  .small-link[aria-disabled='true'] {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .action-btn:disabled:hover { border-color: var(--color-border-heavy); }
</style>
