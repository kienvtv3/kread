<script>
  import { onMount } from 'svelte'

  let { screen, version = 0, scale = 0.5, pixelInspect = false } = $props()
  let canvas
  let ctx

  onMount(() => {
    ctx = canvas.getContext('2d')
    renderFrame()
  })

  export function renderFrame() {
    if (!ctx || !screen) return
    const imageData = screen.toImageData()
    ctx.putImageData(imageData, 0, 0)
  }

  $effect(() => {
    if (version >= 0 && ctx) renderFrame()
  })
</script>

<canvas
  bind:this={canvas}
  width={480}
  height={800}
  class="emulator-screen"
  class:pixel-inspect={pixelInspect}
  style="width: {480 * scale}px; height: {800 * scale}px"
></canvas>

<style>
  .emulator-screen {
    display: block;
    image-rendering: auto;
    background: #FFFFFF;
  }
  .emulator-screen.pixel-inspect {
    image-rendering: pixelated;
  }
</style>
