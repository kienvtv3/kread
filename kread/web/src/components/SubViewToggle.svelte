<script>
  let { active = 'create', disabled = false, onToggle } = $props()
</script>

<div class="toggle">
  <button
    class="toggle-btn"
    class:active={active === 'create'}
    onclick={() => onToggle('create')}
  >Create</button>
  <button
    class="toggle-btn"
    class:active={active === 'device'}
    class:disabled
    onclick={() => !disabled && onToggle('device')}
    disabled={disabled}
  >
    On Device {disabled ? '🔒' : ''}
  </button>
</div>

<style>
  .toggle {
    display: flex;
    gap: 0;
    margin-bottom: var(--space-lg);
    border: 1px solid var(--color-border-heavy);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  .toggle-btn {
    flex: 1;
    padding: var(--space-sm) var(--space-md);
    font-family: var(--font-mono);
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-secondary);
    border-right: 1px solid var(--color-border-heavy);
    transition: all 0.15s;
  }
  .toggle-btn:last-child { border-right: none; }
  .toggle-btn.active {
    background: var(--color-text);
    color: var(--color-bg);
  }
  .toggle-btn.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
