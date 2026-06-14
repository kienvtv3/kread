<script>
  import EmulatorCanvas from './EmulatorCanvas.svelte'

  let { scale = 0.5, screen, version = 0, buttons, overlays = [] } = $props()

  let screenW = $derived(Math.round(480 * scale))
  let padSide = $derived(Math.round(screenW * 6 / 55))
  let padTop = $derived(Math.round(screenW * 6 / 55))
  let padBottom = $derived(Math.round(screenW * 17 / 55))
  let cornerR = $derived(Math.max(6, Math.round(screenW * 2.5 / 55)))
</script>

<div class="device-body" style="padding: {padTop}px {padSide}px {padBottom}px {padSide}px; border-radius: {cornerR}px; --pad-bottom: {padBottom}px">
  <div class="screen-well">
    <EmulatorCanvas {screen} {version} {scale} />
    {#each overlays as rect}
      <div class="bbox-overlay" style="
        left: {rect.x * scale}px;
        top: {rect.y * scale}px;
        width: {rect.w * scale}px;
        height: {rect.h * scale}px;
      "></div>
    {/each}
    <div class="bezel-overlay bezel-top" style="height: {Math.round(6 * scale)}px"></div>
    <div class="bezel-overlay bezel-bottom" style="height: {Math.round(6 * scale)}px"></div>
    <div class="bezel-overlay bezel-left" style="width: {Math.round(7 * scale)}px"></div>
    <div class="bezel-overlay bezel-right" style="width: {Math.round(7 * scale)}px"></div>
  </div>
  {#if buttons}
    <div class="bezel-buttons">
      {@render buttons()}
    </div>
  {/if}
</div>

<style>
  .device-body {
    position: relative;
    background: #363636;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    line-height: 0;
  }
  .screen-well {
    position: relative;
    border-radius: 6px;
    overflow: hidden;
    line-height: 0;
  }
  .bezel-overlay {
    position: absolute;
    background: rgba(54, 54, 54, 0.85);
    pointer-events: none;
  }
  .bbox-overlay {
    position: absolute;
    border: 2px solid rgba(255, 0, 0, 0.7);
    background: rgba(255, 0, 0, 0.08);
    pointer-events: none;
    z-index: 1;
  }
  .bezel-top { top: 0; left: 0; right: 0; }
  .bezel-bottom { bottom: 0; left: 0; right: 0; }
  .bezel-left { top: 0; bottom: 0; left: 0; }
  .bezel-right { top: 0; bottom: 0; right: 0; }
  .bezel-buttons {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: var(--pad-bottom, 74px);
    padding: 0 8px;
  }
</style>
