<script>
  import DropZone from '../../components/DropZone.svelte'
  import ProgressBar from '../../components/ProgressBar.svelte'
  import { booksStore } from '../../stores/books.svelte.js'
  import { fontsStore } from '../../stores/fonts.svelte.js'

  const sizes = [12, 14, 16, 18, 20]
  const orientations = [
    { id: 'portrait', label: 'Portrait' },
    { id: 'landscape', label: 'Landscape' },
  ]

  let newFontUrl = $state('')
  let downloadUrl = $state(null)
  let downloadName = $state('book.kbook')

  function handleEpub(file) {
    booksStore.setEpub(file)
  }

  function toggleFont(url) {
    const current = [...booksStore.selectedFonts]
    const idx = current.indexOf(url)
    if (idx >= 0) current.splice(idx, 1)
    else current.push(url)
    booksStore.setSelectedFonts(current)
  }

  function toggleSize(size) {
    const current = [...booksStore.selectedSizes]
    const idx = current.indexOf(size)
    if (idx >= 0 && current.length > 1) current.splice(idx, 1)
    else if (idx < 0) current.push(size)
    booksStore.setSelectedSizes(current)
  }

  function toggleOrientation(id) {
    const current = [...booksStore.selectedOrientations]
    const idx = current.indexOf(id)
    if (idx >= 0 && current.length > 1) current.splice(idx, 1)
    else if (idx < 0) current.push(id)
    booksStore.setSelectedOrientations(current)
  }

  function addFont() {
    if (!newFontUrl) return
    const match = newFontUrl.match(/family=([^&:]+)/)
    const name = match ? decodeURIComponent(match[1]).replace(/\+/g, ' ') : 'Custom Font'
    fontsStore.addFont(name, newFontUrl)
    newFontUrl = ''
  }

  let { screen, onVersionBump = null } = $props()

  function cleanupDownload() {
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl)
      downloadUrl = null
    }
  }

  function showResult(result) {
    // Write quantized pixels to preview screen
    if (screen) {
      screen.clear(3)
      for (let y = 0; y < result.pageHeight && y < screen.height; y++) {
        for (let x = 0; x < result.pageWidth && x < screen.width; x++) {
          screen.setPixel(x, y, result.quantized[y * result.pageWidth + x])
        }
      }
      if (onVersionBump) onVersionBump()
    }

    // Create download link
    cleanupDownload()
    const blob = new Blob([result.kpFile], { type: 'application/octet-stream' })
    downloadUrl = URL.createObjectURL(blob)
  }

  async function handleTestPage() {
    try {
      const result = await booksStore.convertFirstPage(null, {
        fontFamily: 'Literata',
        fontSize: 24,
        orientation: 'portrait',
      })
      downloadName = 'test.kbook'
      showResult(result)
    } catch (err) {
      console.error('Test page failed:', err)
    }
  }

  async function handleConvert() {
    if (!booksStore.epub || booksStore.variants.length === 0) return
    const variant = booksStore.variants[booksStore.activeVariant] || booksStore.variants[0]
    try {
      const result = await booksStore.convertFirstPage(booksStore.epub, {
        fontFamily: fontLabel(variant.font),
        fontSize: variant.size,
        orientation: variant.orientation,
      })
      downloadName = (booksStore.epubName || 'book') + '.kbook'
      showResult(result)
    } catch (err) {
      console.error('Convert failed:', err)
    }
  }

  function fontLabel(url) {
    const f = fontsStore.fonts.find(f => f.url === url)
    return f ? f.name : url
  }
</script>

<div class="books-create">
  {#if !booksStore.epub}
    <DropZone accept=".epub" label="Drop EPUB here" onFile={handleEpub} />
  {:else}
    <div class="epub-loaded">
      <span>{booksStore.epubName}</span>
      <button class="text-btn" onclick={() => booksStore.setEpub(null)}>Change</button>
    </div>
  {/if}

  {#if booksStore.epub}
    <section>
      <h3>Font</h3>
      <div class="checkbox-group">
        {#each fontsStore.fonts as font}
          <label class="checkbox">
            <input
              type="checkbox"
              checked={booksStore.selectedFonts.includes(font.url)}
              onchange={() => toggleFont(font.url)}
            />
            {font.name}
          </label>
        {/each}
      </div>
      <div class="add-font">
        <input
          type="text"
          placeholder="Paste Google Fonts URL"
          bind:value={newFontUrl}
          onkeydown={(e) => e.key === 'Enter' && addFont()}
        />
        <button class="small-btn" onclick={addFont}>Add</button>
      </div>
    </section>

    <section>
      <h3>Size</h3>
      <div class="checkbox-group inline">
        {#each sizes as size}
          <label class="checkbox">
            <input
              type="checkbox"
              checked={booksStore.selectedSizes.includes(size)}
              onchange={() => toggleSize(size)}
            />
            {size}pt
          </label>
        {/each}
      </div>
    </section>

    <section>
      <h3>Orientation</h3>
      <div class="checkbox-group inline">
        {#each orientations as orient}
          <label class="checkbox">
            <input
              type="checkbox"
              checked={booksStore.selectedOrientations.includes(orient.id)}
              onchange={() => toggleOrientation(orient.id)}
            />
            {orient.label}
          </label>
        {/each}
      </div>
    </section>

    {#if booksStore.variants.length > 0}
      <section>
        <h3>Preview on Design</h3>
        <div class="variant-list">
          {#each booksStore.variants as variant, i}
            <label class="radio">
              <input
                type="radio"
                name="variant"
                checked={booksStore.activeVariant === i}
                onchange={() => booksStore.activeVariant = i}
              />
              {fontLabel(variant.font)} · {variant.size}pt · {variant.orientation}
            </label>
          {/each}
        </div>
      </section>
    {/if}
  {/if}

  <div class="actions">
    {#if booksStore.converting}
      <ProgressBar progress={booksStore.convertProgress} label="{booksStore.convertProgress}%" />
    {:else}
      <button class="secondary-btn" onclick={handleTestPage}>
        Test Page
      </button>
      {#if booksStore.epub}
        <button class="primary-btn" onclick={handleConvert}
          disabled={booksStore.variants.length === 0}
        >
          Convert {booksStore.variants.length > 1 ? `(${booksStore.variants.length} variants)` : ''}
        </button>
      {/if}
    {/if}

    {#if booksStore.convertError}
      <div class="error-msg">{booksStore.convertError}</div>
    {/if}

    {#if downloadUrl}
      <a class="download-link" href={downloadUrl} download={downloadName}>
        Download {downloadName}
      </a>
    {/if}
  </div>
</div>

<style>
  .books-create {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }
  section {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  h3 {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
  }
  .epub-loaded {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-md);
    background: var(--color-bg-card);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .checkbox-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }
  .checkbox-group.inline {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-md);
  }
  .checkbox, .radio {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    font-size: 14px;
    cursor: pointer;
  }
  .variant-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    padding: var(--space-sm);
    background: var(--sidebar-bg);
    border-radius: var(--radius-sm);
    max-height: 150px;
    overflow-y: auto;
  }
  .add-font {
    display: flex;
    gap: var(--space-sm);
  }
  .add-font input {
    flex: 1;
    font-size: 13px;
  }
  .small-btn {
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 13px;
    background: var(--color-bg-card);
  }
  .small-btn:hover { border-color: var(--color-accent); }
  .text-btn {
    font-size: 13px;
    color: var(--color-accent);
    text-decoration: underline;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }
  .primary-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-accent);
    color: white;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    transition: background 0.15s;
  }
  .primary-btn:hover:not(:disabled) { background: var(--color-accent-hover); }
  .primary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .secondary-btn {
    padding: var(--space-sm) var(--space-lg);
    background: var(--color-bg-card);
    color: var(--color-text);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    transition: border-color 0.15s;
  }
  .secondary-btn:hover { border-color: var(--color-accent); }
  .error-msg {
    color: #e53e3e;
    font-size: 13px;
    padding: var(--space-sm);
    background: rgba(229, 62, 62, 0.08);
    border-radius: var(--radius-sm);
  }
  .download-link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-lg);
    background: #2d6a4f;
    color: white;
    border-radius: var(--radius-sm);
    font-size: 14px;
    font-weight: 500;
    text-decoration: none;
    text-align: center;
    justify-content: center;
    transition: background 0.15s;
  }
  .download-link:hover { background: #1b4332; }
</style>
