<script>
  import { onMount } from 'svelte'
  import { connection } from '../../stores/connection.svelte.js'

  let releases = $state([])
  let loadingReleases = $state(false)
  let releaseError = $state(null)

  async function fetchReleases() {
    loadingReleases = true
    releaseError = null
    try {
      const res = await fetch('https://api.github.com/repos/kienvtv3/kread/releases')
      if (!res.ok) throw new Error(`${res.status}`)
      releases = await res.json()
    } catch (e) {
      releaseError = e.message
    } finally {
      loadingReleases = false
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  }

  async function prepareFlash() {
    if (connection.connected) await connection.disconnect()
  }

  onMount(() => {
    fetchReleases()
    import('https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module').catch(() => {})
  })
</script>

<div class="firmware-tab">
  <section>
    <h3>Device</h3>
    {#if connection.connected && connection.deviceInfo}
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">firmware</span>
          <span class="info-value">{connection.deviceInfo.fw}</span>
        </div>
        <div class="info-row">
          <span class="info-label">storage</span>
          <span class="info-value">{connection.deviceInfo.sd_free ? Math.round(connection.deviceInfo.sd_free / 1e9) + ' GB free' : '—'}</span>
        </div>
        <div class="info-row">
          <span class="info-label">status</span>
          <span class="info-value connected">connected</span>
        </div>
      </div>
    {:else}
      <div class="info-card muted">no device connected</div>
    {/if}
  </section>

  <hr />

  <section>
    <h3>Firmware</h3>
    {#if loadingReleases}
      <p class="muted-text">loading...</p>
    {:else if releaseError}
      <p class="error-text">error: {releaseError}</p>
    {:else if releases.length === 0}
      <p class="muted-text">no releases yet</p>
    {:else}
      {#each releases as release, i}
        <div class="release-card">
          <div class="release-header">
            <span class="release-tag">{release.tag_name}</span>
            {#if i === 0}<span class="badge">latest</span>{/if}
            <span class="release-date">{formatDate(release.published_at)}</span>
          </div>
          {#if release.body}
            <p class="release-notes">{release.body.slice(0, 200)}{release.body.length > 200 ? '…' : ''}</p>
          {/if}
          <button class="action-btn" onclick={prepareFlash}>flash (OTA)</button>
        </div>
      {/each}
    {/if}
    <p class="source">kienvtv3/kread/releases</p>
    <div class="note">
      <p>For flashing other firmware, use <a href="https://xteink.dve.al/" target="_blank" rel="noopener">xteink.dve.al</a></p>
    </div>
  </section>
</div>

<style>
  .firmware-tab { display: flex; flex-direction: column; }
  section { display: flex; flex-direction: column; gap: var(--space-sm); }
  h3 { font-family: var(--font-heading); font-size: 14px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid var(--color-text); padding-bottom: var(--space-xs); margin-bottom: var(--space-sm); }
  .info-card { padding: var(--space-md); border: 1px solid var(--color-border-heavy); border-radius: var(--radius-sm); background: var(--color-bg-card); display: flex; flex-direction: column; gap: var(--space-xs); }
  .info-card.muted { color: var(--color-text-secondary); font-size: 13px; }
  .info-row { display: flex; justify-content: space-between; font-size: 13px; }
  .info-label { color: var(--color-text-secondary); }
  .info-value { font-weight: 500; }
  .info-value.connected { color: var(--color-success); }
  .action-btn { padding: var(--space-sm) var(--space-md); border: 1px solid var(--color-border-heavy); border-radius: var(--radius-sm); font-size: 13px; background: var(--color-bg-card); cursor: pointer; transition: all 0.15s; }
  .action-btn:hover { border-color: var(--color-text); }
  .release-card { padding: var(--space-md); border: 1px solid var(--color-border-heavy); border-radius: var(--radius-sm); background: var(--color-bg-card); display: flex; flex-direction: column; gap: var(--space-sm); }
  .release-header { display: flex; align-items: center; gap: var(--space-sm); font-size: 13px; }
  .release-tag { font-weight: 600; }
  .badge { font-size: 10px; padding: 1px 6px; border: 1px solid var(--color-success); color: var(--color-success); border-radius: 2px; text-transform: uppercase; }
  .release-date { font-size: 12px; color: var(--color-text-secondary); }
  .release-notes { font-size: 12px; color: var(--color-text-secondary); line-height: 1.5; }
  .source { font-size: 11px; color: var(--color-disabled); margin-top: var(--space-sm); }
  .muted-text { color: var(--color-text-secondary); font-size: 13px; }
  .error-text { color: var(--color-error); font-size: 13px; }
  .note { margin-top: var(--space-md); padding: var(--space-md); border: 1px dashed var(--color-border-heavy); border-radius: var(--radius-sm); font-size: 12px; color: var(--color-text-secondary); }
  .note a { color: var(--color-text); text-decoration: underline; }
</style>
