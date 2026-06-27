<script>
  import FirmwareTab from './FirmwareTab.svelte'
  import EmulatorTab from './EmulatorTab.svelte'

  let { emulatorRef = null, version = 0, onOverlayChange = null } = $props()
  let activeSubTab = $state('emulator')
</script>

<div class="device-tab">
  <div class="toggle">
    <button class="toggle-btn" class:active={activeSubTab === 'firmware'}
      onclick={() => activeSubTab = 'firmware'}>Firmware</button>
    <button class="toggle-btn" class:active={activeSubTab === 'emulator'}
      onclick={() => activeSubTab = 'emulator'}>Emulator</button>
  </div>

  <div class="sub-content">
    {#if activeSubTab === 'firmware'}
      <FirmwareTab />
    {:else}
      <EmulatorTab {emulatorRef} {version} {onOverlayChange} />
    {/if}
  </div>
</div>

<style>
  .device-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
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
  .sub-content {
    flex: 1;
    overflow-y: auto;
  }
</style>
