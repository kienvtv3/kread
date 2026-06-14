# kread

E-ink reader firmware for the **Xteink X4** device (ESP32-C3, 480×800 2-bit SSD1677 display).

## What's in this repo

```
kread/          Main project (C, PlatformIO)
papyrix/        Reference firmware — Papyrix Reader (C++, Arduino-ESP32)
refs/
  epub-to-xtc/  Reference tool — EPUB → XTC converter
  xtcjs/        Reference lib — XTC parser (JS)
  xtctool/      Reference CLI — XTC inspection tool
design/         UI mockups (PNG + layout spec)
docs/           Architecture specs, rendering plans
screenshots/    Device photos and render tests
test-firmware/  Flashable binaries for testing (CrossPoint 1.1.1, Papyrix 1.18.0)
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

EPUB → XTC conversion happens on the web side (`refs/epub-to-xtc`), not on device.

## Environment

```
PlatformIO:   PLATFORMIO_CORE_DIR=C:\pio   (avoids spaces in user path)
pio CLI:      C:\Users\Kien Vu\.platformio\penv\Scripts\pio.exe
Device:       Xteink X4 on COM7 @ 115200 baud
```

## UI structure

Five screens: **Home → Reader → Library → Passes → Settings**

Layout engine uses stacked containers with fixed height + padding. Full spec in [`design/layout.md`](design/layout.md). UI font is Atkinson Hyperlegible. All text pre-rendered to bitmaps — no runtime font shaping on device.
