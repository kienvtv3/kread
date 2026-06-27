<script>
  import { onMount } from 'svelte'
  import { createCanvasStateMachine, BUTTONS } from './canvas-state-machine.js'

  let { active = true, screen, onVersionBump } = $props()

  let machine = $state(null)

  function getMachine() {
    if (!machine && screen) {
      machine = createCanvasStateMachine(screen, () => onVersionBump?.())
    }
    return machine
  }

  export function handleButton(button) {
    getMachine()?.handleButton(button)
    onVersionBump?.()
  }

  export function setDebugBorders(on) {
    getMachine()?.setDebugBorders(on)
    onVersionBump?.()
  }

  export function getAssets() { return getMachine()?.assets || [] }
  export function getGlobals() { return getMachine()?.globals || {} }

  function handleKeydown(e) {
    if (!active) return
    const keyMap = {
      ArrowLeft: BUTTONS.LEFT,
      ArrowRight: BUTTONS.RIGHT,
      ArrowUp: BUTTONS.UP,
      ArrowDown: BUTTONS.DOWN,
      Escape: BUTTONS.BACK,
      Backspace: BUTTONS.BACK,
      Enter: BUTTONS.CONFIRM,
    }
    const button = keyMap[e.key]
    if (button) {
      e.preventDefault()
      handleButton(button)
    }
  }

  onMount(() => {
    getMachine()?.render()
    onVersionBump?.()
  })

  export { BUTTONS }
</script>

<svelte:window onkeydown={handleKeydown} />
