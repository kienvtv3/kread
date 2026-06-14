<script>
  let { progress = 0, label = '' } = $props()
</script>

<div class="progress-container">
  <div class="progress-bar">
    <div class="progress-fill" style="width: {progress}%"></div>
  </div>
  {#if label}
    <span class="progress-label">{label}</span>
  {/if}
</div>

<style>
  .progress-container {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }
  .progress-bar {
    flex: 1;
    height: 4px;
    background: var(--color-border);
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--color-text);
    transition: width 0.2s;
  }
  .progress-label {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-secondary);
    min-width: 40px;
    text-align: right;
  }
</style>
