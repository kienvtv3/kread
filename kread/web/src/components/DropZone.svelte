<script>
  let { accept = '*', label = 'Drop file here', onFile } = $props()
  let dragging = $state(false)
  let inputEl

  function handleDrop(e) {
    e.preventDefault()
    dragging = false
    const file = e.dataTransfer?.files[0]
    if (file) onFile(file)
  }

  function handleInput(e) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="dropzone"
  class:dragging
  ondragover={(e) => { e.preventDefault(); dragging = true }}
  ondragleave={() => dragging = false}
  ondrop={handleDrop}
  onclick={() => inputEl.click()}
  role="button"
  tabindex="0"
>
  <p class="label">{label}</p>
  <p class="hint">or click to browse</p>
  <input
    bind:this={inputEl}
    type="file"
    accept={accept}
    onchange={handleInput}
    hidden
  />
</div>

<style>
  .dropzone {
    border: 2px dashed var(--color-border-heavy);
    border-radius: var(--radius-sm);
    padding: var(--space-xl);
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  .dropzone:hover, .dropzone.dragging {
    border-color: var(--color-text);
    background: var(--color-highlight);
  }
  .label {
    font-family: var(--font-mono);
    font-size: 14px;
  }
  .hint {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-secondary);
    margin-top: var(--space-xs);
  }
</style>
