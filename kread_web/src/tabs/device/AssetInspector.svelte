<script>
  let { emulatorRef = null, onHighlight = null } = $props()

  let assets = $state([])
  let globals = $state({})
  let selectedAsset = $state(null)
  let highlightedAssets = $state(new Set())

  // Update assets when emulator state changes
  export function refresh() {
    if (!emulatorRef) return
    assets = emulatorRef.getAssets() || []
    globals = emulatorRef.getGlobals() || {}
  }

  function toggleHighlight(name) {
    const next = new Set(highlightedAssets)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    highlightedAssets = next
    onHighlight?.(highlightedAssets, assets)
  }

  function selectAsset(asset) {
    selectedAsset = selectedAsset?.name === asset.name ? null : asset
  }

  function typeLabel(type) {
    switch (type) {
      case 'prerendered': return 'KP'
      case 'dynamic': return 'DYN'
      case 'canvas': return 'CVS'
      default: return type?.toUpperCase() || '?'
    }
  }
</script>

{#if import.meta.env.DEV}
<div class="inspector">
  <!-- Global state — single compact row -->
  <div class="globals-row">
    <span class="g-item"><b>State</b> {globals.state || '?'}</span>
    <span class="g-sep">|</span>
    <span class="g-item"><b>Lang</b> {globals.language || '?'}</span>
    <span class="g-sep">|</span>
    <span class="g-item"><b>Bat</b> {globals.batteryPercent ?? '?'}%</span>
  </div>

  <!-- Asset list -->
  <div class="asset-header">
    <span class="ah-title">Assets ({assets.length})</span>
  </div>

  <div class="asset-list">
    {#each assets as asset}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="asset-row"
        class:selected={selectedAsset?.name === asset.name}
        onclick={() => selectAsset(asset)}
      >
        <span class="asset-type" class:type-kp={asset.type === 'prerendered'} class:type-dyn={asset.type === 'dynamic'} class:type-canvas={asset.type === 'canvas'}>{typeLabel(asset.type)}</span>
        <span class="asset-name">{asset.name}</span>
        <span class="asset-bounds">{asset.bounds.w}×{asset.bounds.h}</span>
        <button
          class="bbox-btn"
          class:active={highlightedAssets.has(asset.name)}
          onclick={(e) => { e.stopPropagation(); toggleHighlight(asset.name) }}
          title="Toggle bounding box"
        >□</button>
      </div>
    {/each}
    {#if assets.length === 0}
      <div class="empty">No assets on current screen</div>
    {/if}
  </div>

  <!-- Selected asset detail -->
  {#if selectedAsset}
    <div class="detail">
      <div class="detail-header">
        <span>{selectedAsset.name}</span>
        <span class="detail-pos">({selectedAsset.bounds.x}, {selectedAsset.bounds.y}) {selectedAsset.bounds.w}×{selectedAsset.bounds.h}</span>
      </div>
    </div>
  {/if}
</div>
{/if}

<style>
  .inspector {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    font-family: var(--font-mono);
    font-size: 11px;
  }

  /* Global state row */
  .globals-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 6px;
    background: var(--color-bg-card);
    border: 1px solid var(--color-border-heavy);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    white-space: nowrap;
    flex-wrap: wrap;
  }
  .g-item { color: var(--color-text); }
  .g-item b { color: var(--color-text-secondary); font-weight: 500; margin-right: 2px; }
  .g-sep { color: var(--color-border-heavy); }

  /* Asset header */
  .asset-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 2px 0;
  }
  .ah-title {
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Asset list */
  .asset-list {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--color-border-heavy);
    border-radius: var(--radius-sm);
    max-height: 240px;
    overflow-y: auto;
  }
  .asset-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 6px;
    cursor: pointer;
    transition: background 0.1s;
    border-bottom: 1px solid var(--color-border);
  }
  .asset-row:last-child { border-bottom: none; }
  .asset-row:hover { background: var(--color-bg-card); }
  .asset-row.selected { background: var(--color-text); color: var(--color-bg); }

  .asset-type {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 3px;
    border-radius: 2px;
    letter-spacing: 0.3px;
    flex-shrink: 0;
  }
  .type-kp { background: #d0ffd0; color: #333; }
  .type-dyn { background: #ffd0d0; color: #333; }
  .type-canvas { background: #ffe0b0; color: #333; }
  .asset-row.selected .type-kp,
  .asset-row.selected .type-dyn,
  .asset-row.selected .type-canvas { background: rgba(255,255,255,0.2); color: inherit; }

  .asset-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .asset-bounds { color: var(--color-text-secondary); flex-shrink: 0; font-size: 10px; }
  .asset-row.selected .asset-bounds { color: rgba(255,255,255,0.6); }

  .bbox-btn {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid var(--color-border-heavy);
    border-radius: 2px;
    background: transparent;
    font-size: 10px;
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s;
  }
  .bbox-btn:hover { border-color: var(--color-text); }
  .bbox-btn.active { background: var(--color-text); color: var(--color-bg); border-color: var(--color-text); }

  .empty { padding: 8px; color: var(--color-text-secondary); text-align: center; }

  /* Detail panel */
  .detail {
    border: 1px solid var(--color-border-heavy);
    border-radius: var(--radius-sm);
    padding: 6px;
    background: var(--color-bg-card);
  }
  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
  }
  .detail-pos { font-weight: 400; color: var(--color-text-secondary); font-size: 10px; }
</style>
