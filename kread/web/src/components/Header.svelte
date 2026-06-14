<script>
  let { connected = false, deviceInfo = null, error = null, onConnect, activeTab = 'library', onTabChange } = $props()

  const tabs = [
    { id: 'library', label: 'Library' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'device', label: 'Device' },
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
  <div class="status">
    {#if error}
      <span class="dot error"></span>
      <span class="error-text">{error}</span>
    {:else if connected && deviceInfo}
      <span class="dot connected"></span>
      <span>{deviceInfo.fw} · {deviceInfo.sd_free ? Math.round(deviceInfo.sd_free / 1e9) + 'GB' : 'connected'}</span>
    {:else}
      <span class="dot disconnected"></span>
      <span>disconnected</span>
    {/if}
    <button class="connect-btn" onclick={onConnect}>
      {connected ? 'disconnect' : 'connect'}
    </button>
  </div>
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
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .dot.connected { background: #6B8E6B; }
  .dot.disconnected { background: #666; }
  .dot.error { background: #B83232; }
  .error-text { color: #B83232; }
  .connect-btn {
    padding: var(--space-xs) var(--space-md);
    border: 1px solid #555;
    border-radius: var(--radius-sm);
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--header-text);
    transition: border-color 0.15s;
  }
  .connect-btn:hover {
    border-color: var(--header-text);
  }
</style>
