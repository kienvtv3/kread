<script>
  let { activeTab = 'book', onTabChange } = $props()

  const tabs = [
    { id: 'book', label: 'Book' },
    { id: 'image', label: 'Image' },
    { id: 'design', label: 'Design' },
    { id: 'firmware', label: 'Firmware' },
  ]
</script>

<header class="header">
  <h1 class="logo">kread</h1>
  <nav class="tabs">
    {#each tabs as tab}
      <button
        class="tab-btn"
        class:active={activeTab === tab.id}
        onclick={() => onTabChange(tab.id)}
      >
        {tab.label}
      </button>
    {/each}
  </nav>
</header>

<style>
  .header {
    height: var(--header-height);
    display: flex;
    align-items: center;
    padding: 0 var(--space-lg);
    background: var(--header-bg);
    color: var(--header-text);
    border-bottom: 3px solid var(--color-text);
    gap: var(--space-lg);
  }
  .logo {
    font-family: var(--font-heading);
    font-size: 22px;
    letter-spacing: 2px;
    text-transform: lowercase;
  }
  .tabs {
    display: flex;
    gap: 2px;
    margin-left: var(--space-md);
  }
  .tab-btn {
    padding: var(--space-xs) var(--space-md);
    font-family: var(--font-mono);
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #999;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .tab-btn:hover {
    color: var(--header-text);
  }
  .tab-btn.active {
    color: var(--header-text);
    border-bottom-color: var(--header-text);
  }
  .status {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-family: var(--font-mono);
    font-size: 12px;
    color: #999;
  }
</style>
