<script>
  import { connection } from '../../stores/connection.svelte.js'

  let files = $state([])
  let freeSpace = $state(0)
  let loading = $state(false)

  async function loadFiles() {
    loading = true
    try {
      const result = await connection.listFiles()
      files = result.files || []
      freeSpace = result.free || 0
    } finally {
      loading = false
    }
  }

  async function deleteFile(name) {
    await connection.deleteFile(name)
    await loadFiles()
  }

  $effect(() => {
    if (connection.connected) loadFiles()
  })
</script>

<div class="books-device">
  {#if loading}
    <p class="muted">Loading...</p>
  {:else if files.length === 0}
    <p class="muted">No books on device</p>
  {:else}
    {#each files as file}
      <div class="file-card">
        <div class="file-info">
          <span class="file-name">📖 {file.name}</span>
          <span class="file-size">{(file.size / 1e6).toFixed(1)} MB</span>
        </div>
        <div class="file-actions">
          <button class="text-btn">Preview</button>
          <button class="text-btn danger" onclick={() => deleteFile(file.name)}>Delete</button>
        </div>
      </div>
    {/each}
  {/if}

  {#if freeSpace > 0}
    <p class="space-info">SD Card: {(freeSpace / 1e9).toFixed(1)} GB free</p>
  {/if}
</div>

<style>
  .books-device {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }
  .muted {
    color: var(--color-text-secondary);
    font-size: 14px;
  }
  .file-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-md);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .file-info {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .file-name { font-weight: 500; }
  .file-size { font-size: 12px; color: var(--color-text-secondary); }
  .file-actions { display: flex; gap: var(--space-md); }
  .text-btn { font-size: 13px; color: var(--color-accent); }
  .text-btn.danger { color: var(--color-error); }
  .space-info {
    font-size: 13px;
    color: var(--color-text-secondary);
    margin-top: var(--space-md);
  }
</style>
