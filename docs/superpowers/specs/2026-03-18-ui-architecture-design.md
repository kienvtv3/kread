# kread Web App — Device Tab Redesign

## Overview

Restructure Device tab into FIRMWARE + EMULATOR sub-tabs. Integrate asset inspector into emulator. Remove Dictionary tab.

## Sidebar

```
BOOKS | DEVICE | GALLERY
```

Dictionary tab removed — replaced by asset inspector in EMULATOR sub-tab.

## Device Page — Sub-tabs

### FIRMWARE sub-tab

Device connection, firmware info. No calibration.

```
DEVICE
──────────────
• disconnected  [connect]

FIRMWARE
──────────────
no releases
```

### EMULATOR sub-tab

Left: device frame + buttons. Right: calibration + asset inspector.

Asset inspector:
- Toggle via dev mode (`npm run dev` = on, production build = hidden)
- "Show bounding boxes" checkbox → overlays borders on emulator
- Asset list auto-populated from current screen's render manifest
- Click asset → shows Source | Grayscale | B&W side-by-side
- Each asset: name, type badge (dynamic/dict/kp/kb), visibility toggle

### Screen renderers return asset manifests

```js
export function renderHome(ctx, data) {
  // draw...
  return {
    assets: [
      { name: 'battery', type: 'dynamic', bounds: { x, y, w, h } },
      { name: 'nav.read', type: 'dict', bounds: { x, y, w, h } },
    ]
  }
}
```

### Dev mode

```js
// vite.config.js
define: { __DEV_MODE__: mode === 'development' }
```

Asset inspector section only renders when `__DEV_MODE__` is true.

## File Changes

| Action | File |
|--------|------|
| Split | `DeviceTab.svelte` → sub-tab container |
| New | `FirmwareTab.svelte` — device + firmware info |
| New | `EmulatorTab.svelte` — emulator + calibration + inspector |
| New | `AssetInspector.svelte` — asset list + inspection panel |
| Delete | `tabs/dictionary/DictionaryTab.svelte` |
| Modify | `Sidebar.svelte` — remove DICTIONARY |
