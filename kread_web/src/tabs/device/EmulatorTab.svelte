<script>
  import CalibrationOverlay from '../../components/CalibrationOverlay.svelte'
  import AssetInspector from './AssetInspector.svelte'
  import { calibration } from '../../stores/calibration.svelte.js'
  import { BUTTONS } from '../../emulator/state-machine.js'

  let { emulatorRef = null, version = 0, onOverlayChange = null } = $props()
  let calibrating = $state(false)
  let inspectorRef

  function handleCalibrationConfirm(ppi) {
    calibration.setPpi(ppi)
    calibrating = false
  }

  function btn(b) {
    emulatorRef?.handleButton(b)
  }

  function handleHighlight(highlightedSet, assets) {
    const overlays = assets
      .filter(a => highlightedSet.has(a.name))
      .map(a => a.bounds)
    onOverlayChange?.(overlays)
  }

  // Refresh inspector reactively when emulator version changes
  $effect(() => {
    if (version >= 0 && emulatorRef && inspectorRef) {
      inspectorRef.refresh()
    }
  })
</script>

<CalibrationOverlay
  visible={calibrating}
  onConfirm={handleCalibrationConfirm}
  onCancel={() => calibrating = false}
/>

<div class="emulator-tab">
  <!-- Controls — single compact row, always visible -->
  <section>
    <div class="controls-row">
      <button class="emu-btn" onclick={() => btn(BUTTONS.BACK)}>Back</button>
      <button class="emu-btn" onclick={() => btn(BUTTONS.CONFIRM)}>OK</button>
      <button class="emu-btn" onclick={() => btn(BUTTONS.LEFT)}>Left</button>
      <button class="emu-btn" onclick={() => btn(BUTTONS.RIGHT)}>Right</button>
      <button class="emu-btn" onclick={() => btn(BUTTONS.UP)}>Up</button>
      <button class="emu-btn" onclick={() => btn(BUTTONS.DOWN)}>Down</button>
    </div>
  </section>

  <hr />

  <!-- Asset Inspector (dev only) -->
  <AssetInspector bind:this={inspectorRef} {emulatorRef} onHighlight={handleHighlight} />

  <hr />

  <!-- Calibration -->
  <section>
    <h3>Calibration</h3>
    {#if calibration.ppi > 0}
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">screen PPI</span>
          <span class="info-value">{calibration.ppi}</span>
        </div>
        <div class="info-row">
          <span class="info-label">emulator</span>
          <span class="info-value">{Math.round(calibration.scale * 100)}% (1:1)</span>
        </div>
      </div>
      <div class="btn-row">
        <button class="action-btn" onclick={() => calibrating = true}>recalibrate</button>
        <button class="action-btn danger" onclick={() => calibration.reset()}>reset</button>
      </div>
    {:else}
      <p class="muted-text">calibrate to show emulator at actual device size</p>
      <button class="action-btn" onclick={() => calibrating = true}>calibrate with credit card</button>
    {/if}
  </section>
</div>

<style>
  .emulator-tab { display: flex; flex-direction: column; gap: var(--space-sm); }
  section { display: flex; flex-direction: column; gap: var(--space-sm); }
  h3 { font-family: var(--font-heading); font-size: 14px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid var(--color-text); padding-bottom: var(--space-xs); margin-bottom: var(--space-sm); }

  .controls-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    align-items: center;
  }
  .emu-btn {
    padding: 3px 8px;
    border: 1px solid var(--color-border-heavy);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 11px;
    background: var(--color-bg-card);
    cursor: pointer;
    transition: all 0.15s;
  }
  .emu-btn:hover { border-color: var(--color-text); background: var(--color-bg); }
  .emu-btn:active { background: var(--color-text); color: var(--color-bg); }
  .btn-row { display: flex; gap: var(--space-sm); flex-wrap: wrap; align-items: center; }
  .info-card { padding: var(--space-md); border: 1px solid var(--color-border-heavy); border-radius: var(--radius-sm); background: var(--color-bg-card); display: flex; flex-direction: column; gap: var(--space-xs); }
  .info-row { display: flex; justify-content: space-between; font-size: 13px; }
  .info-label { color: var(--color-text-secondary); }
  .info-value { font-weight: 500; }
  .action-btn { padding: var(--space-sm) var(--space-md); border: 1px solid var(--color-border-heavy); border-radius: var(--radius-sm); font-size: 13px; background: var(--color-bg-card); cursor: pointer; transition: all 0.15s; }
  .action-btn:hover { border-color: var(--color-text); }
  .action-btn.danger { color: var(--color-error); }
  .muted-text { color: var(--color-text-secondary); font-size: 13px; }
</style>
