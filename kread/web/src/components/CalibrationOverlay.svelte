<script>
  let { visible = false, onConfirm, onCancel } = $props()

  const CARD_WIDTH_MM = 85.6
  const CARD_HEIGHT_MM = 53.98

  let cardWidthPx = $state(323)
  let isDragging = $state(false)
  let dragStartX = $state(0)
  let dragStartW = $state(0)

  let cardHeightPx = $derived(Math.round(cardWidthPx * CARD_HEIGHT_MM / CARD_WIDTH_MM))
  let currentPpi = $derived(Math.round(cardWidthPx / (CARD_WIDTH_MM / 25.4) * 10) / 10)

  function startDrag(e) {
    isDragging = true
    dragStartX = e.clientX
    dragStartW = cardWidthPx
    e.preventDefault()
  }

  function onDrag(e) {
    if (!isDragging) return
    const dx = e.clientX - dragStartX
    cardWidthPx = Math.max(150, dragStartW + dx)
  }

  function endDrag() { isDragging = false }

  function handleKeydown(e) {
    if (!visible) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      cardWidthPx = Math.max(150, cardWidthPx + (e.shiftKey ? 10 : 1))
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      cardWidthPx = Math.max(150, cardWidthPx - (e.shiftKey ? 10 : 1))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm(currentPpi)
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  function confirm() {
    onConfirm(currentPpi)
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onmousemove={onDrag} onmouseup={endDrag}>
    <div class="calibration-panel">
      <p class="title">Screen Calibration</p>
      <p class="instruction">Place a credit card on the rectangle. Drag the right edge to match.</p>

      <div class="card-area">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="card-outline"
          style="width: {cardWidthPx}px; height: {cardHeightPx}px"
        >
          <span class="card-label">CREDIT CARD</span>
          <span class="card-size">{CARD_WIDTH_MM} × {CARD_HEIGHT_MM} mm</span>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="drag-handle" onmousedown={startDrag}>⟺</div>
        </div>
      </div>

      <p class="ppi-display">{currentPpi} PPI</p>
      <p class="keys-hint">← → fine adjust · shift+← → coarse · enter confirm · esc cancel</p>

      <div class="btn-row">
        <button class="action-btn primary" onclick={confirm}>confirm</button>
        <button class="action-btn" onclick={onCancel}>cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }
  .calibration-panel {
    background: var(--color-bg);
    border: 2px solid var(--color-text);
    padding: var(--space-xl);
    min-width: 500px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
  }
  .title {
    font-family: var(--font-heading);
    font-size: 18px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .instruction {
    font-size: 13px;
    color: var(--color-text-secondary);
    text-align: center;
    max-width: 400px;
    line-height: 1.5;
  }
  .card-area {
    padding: var(--space-xl) var(--space-xl) var(--space-xl) 0;
    display: flex;
    justify-content: center;
  }
  .card-outline {
    border: 2px solid var(--color-text);
    border-radius: 12px;
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-xs);
    user-select: none;
    background: repeating-linear-gradient(
      45deg,
      transparent,
      transparent 10px,
      rgba(0,0,0,0.03) 10px,
      rgba(0,0,0,0.03) 20px
    );
  }
  .card-label {
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 2px;
    color: var(--color-text-secondary);
  }
  .card-size {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-disabled);
  }
  .drag-handle {
    position: absolute;
    right: -16px;
    top: 0;
    bottom: 0;
    width: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ew-resize;
    font-size: 18px;
    color: var(--color-text);
    user-select: none;
  }
  .drag-handle:hover { color: var(--color-accent-hover); }
  .ppi-display {
    font-family: var(--font-mono);
    font-size: 16px;
    font-weight: 600;
  }
  .keys-hint {
    font-family: var(--font-mono);
    font-size: 10px;
    color: var(--color-disabled);
    letter-spacing: 0.5px;
  }
  .btn-row {
    display: flex;
    gap: var(--space-sm);
  }
  .action-btn {
    padding: var(--space-sm) var(--space-lg);
    border: 1px solid var(--color-border-heavy);
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 12px;
    background: var(--color-bg-card);
    cursor: pointer;
  }
  .action-btn:hover { border-color: var(--color-text); }
  .action-btn.primary {
    background: var(--color-text);
    color: var(--color-bg);
    border-color: var(--color-text);
  }
</style>
