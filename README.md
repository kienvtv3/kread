# kread

E-ink reader firmware for the **Xteink X4** device (ESP32-C3, 480×800 2-bit SSD1677 display).

## What's in this repo

```
kread_web/      Web converter (EPUB → kbook/kpage) + emulator
kread_firmware/ ESP32 firmware source (PlatformIO + ESP-IDF)
design/         UI mockups (PNG + layout spec)
docs/           Architecture specs, rendering plans
images/    Device photos and render tests
```

## Reference repos NOT in this git

These were studied for design decisions but not included (binary size / license):

| Repo | What it is | Why relevant |
|------|-----------|--------------|
| **CrossPoint** | Original C++ Arduino-ESP32 reader | Activity lifecycle, HAL pattern, ESP32-C3 pitfalls, 380KB RAM resource protocol |
| **TernOS** | Rust platform abstraction + Palm OS emulator | Binary framed serial protocol (MAGIC+CRC32), platform traits, USB mode UI flow |

Papyrix is a fork of CrossPoint and adds: state machine with pre-allocated states, dual-boot (UI/Reader mode), PageCache, streaming fonts, Knuth-Plass line breaking.

## Hardware

- **MCU**: ESP32-C3
- **Display**: SSD1677, 480×800, 2-bit (4 grayscale levels)
- **Buttons**: 4 physical — BACK | CONFIRM | LEFT | RIGHT
- **RAM**: ~380KB usable heap
- **Device**: Xteink X4, COM7 @ 115200 baud

Safe margin: 8px all sides (bezel covers ~6px edges).

## Book format

Books are stored as `.kb` files (or `.xtc` — same format, different extension). Pages are pre-rendered as `.kp` bitmaps with optional delta encoding for dual B&W + grayscale modes.

```
.kp page (2-bit with delta):
  [header]
  [B&W plane — LZ4]     native B&W rendering (aggressive hinting)
  [AA edge mask — LZ4]  1-bit: which pixels differ in grayscale mode
  [AA values — LZ4]     2-bit values for masked pixels only
```

EPUB → `kbook`/`kpage` conversion happens on the web side, not on device.

## Repo layout note (path trên máy)

- Workspace hiện tại (và Git root): `D:\Projects\kread-master`
- Source chính nằm trong:
  - `D:\Projects\kread-master\kread_web` (web converter)
  - `D:\Projects\kread-master\kread_firmware` (firmware ESP32)
- Docs chính nằm trong:
  - `D:\Projects\kread-master\docs`
  - `D:\Projects\kread-master\kread_web\docs` (nếu có)
- Các thư mục root:
  - `design`, `docs`, `images`

Chạy web converter:
```powershell
cd D:\Projects\kread-master\kread_web
npm install
npm run dev
```

## Environment

```
PlatformIO:   PLATFORMIO_CORE_DIR=C:\pio   (avoids spaces in user path)
pio CLI:      C:\Users\Kien Vu\.platformio\penv\Scripts\pio.exe
Device:       Xteink X4 on COM7 @ 115200 baud
```

## UI structure

Five screens: **Home → Reader → Library → Passes → Settings**

Layout engine uses stacked containers with fixed height + padding. Full spec in [`design/layout.md`](design/layout.md). UI font is Atkinson Hyperlegible. All text pre-rendered to bitmaps — no runtime font shaping on device.


