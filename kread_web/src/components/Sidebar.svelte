<script>
  let { activeTab = 'library', onTabChange } = $props()

  const tabs = [
    { id: 'library', label: 'Library' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'device', label: 'Device' },
  ]
</script>

<nav class="sidebar">
  {#each tabs as tab}
    <button
      class="tab-btn"
      class:active={activeTab === tab.id}
      onclick={() => onTabChange(tab.id)}
    >
      {tab.label}
    </button>
  {/each}
  <div class="spacer"></div>
</nav>

<style>
  .sidebar {
    width: 90px;
    background: var(--sidebar-bg);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding-top: var(--space-md);
    gap: 2px;
    border-right: 2px solid var(--color-border-heavy);
  }
  .tab-btn {
    padding: var(--space-sm) var(--space-sm);
    font-family: var(--font-mono);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    text-align: center;
    transition: all 0.15s;
    border-left: 3px solid transparent;
  }
  .tab-btn:hover {
    color: var(--color-text);
    background: rgba(0, 0, 0, 0.04);
  }
  .tab-btn.active {
    color: var(--color-text);
    background: var(--color-bg);
    border-left-color: var(--color-text);
    font-weight: 500;
  }
  .spacer { flex: 1; }
</style>
