# Xteink X4 Device Specifications

Source: https://github.com/bigbag/papyrix-reader/blob/main/docs/device-specifications.md

## Overview

| Spec | Value |
|------|-------|
| Device | Xteink X4 E-Reader |
| MCU | ESP32-C3 (RISC-V RV32IMC @ 160MHz) |
| RAM | ~380 KB usable (400 KB total) |
| Flash | 16 MB (bootloader must be configured for 16MB, default detects 4MB) |
| Storage | SD Card (FAT32, max 32GB) |
| Battery | LiPo, ~50mA active, ~10uA deep sleep |
| WiFi | 802.11 b/g/n (2.4GHz) — kread không dùng |
| BLE | 5.0 — kread không dùng |

## Display

| Spec | Value |
|------|-------|
| Panel | GDEQ0426T82, 4.26" E-Ink |
| Controller | Solomon Systech SSD1677 |
| Resolution | 800×480 native (portrait: 480×800) |
| PPI | ~222 (measured) |
| Device size | 68mm × 114mm × 5.9mm |
| Screen size | 55mm × 91mm |
| Bezel | top 6mm, left 6mm, right 6mm, bottom 17mm |
| **Grayscale** | **4 levels (2-bit)** |
| Framebuffer | 48 KB single buffer (800×480/8) |
| Interface | 4-wire SPI @ 40MHz |

### Refresh Modes

| Mode | Time | Use |
|------|------|-----|
| Full | ~1600ms | Page turns, complete redraw, no ghosting |
| Half | ~1720ms | Reduced ghosting, no flash |
| Fast | ~600ms | Quick updates, some ghosting |
| Partial window | ~50-100ms | Status bar, small UI elements |

### LUT Waveform Modes (from firmware implementations)

- `GRAYSCALE` — Differential grayscale with transition optimization
- `GRAYSCALE_REVERT` — Cleanup after grayscale
- `XTH_STANDARD` — Absolute grayscale, standard quality
- `XTH_FAST` — Absolute grayscale, speed optimized

## Buttons (7 total)

| Button | Method | Pin |
|--------|--------|-----|
| BACK | ADC1 ~3512mV | GPIO 1 |
| CONFIRM | ADC1 ~2694mV | GPIO 1 |
| LEFT | ADC1 ~1493mV | GPIO 1 |
| RIGHT | ADC1 ~5mV | GPIO 1 |
| UP | ADC2 ~2242mV | GPIO 2 |
| DOWN | ADC2 ~5mV | GPIO 2 |
| POWER | Digital LOW | GPIO 3 |

Note: Resistor ladder ADC, debounce 5ms.

## Pin Map

| GPIO | Function |
|------|----------|
| 0 | Battery ADC |
| 1 | Button ADC 1 (BACK/CONFIRM/LEFT/RIGHT) |
| 2 | Button ADC 2 (UP/DOWN) |
| 3 | Power button (INPUT_PULLUP) |
| 4 | Display DC |
| 5 | Display RST |
| 6 | Display BUSY |
| 7 | SD MISO |
| 8 | SPI SCLK (shared display+SD) |
| 10 | SPI MOSI (shared display+SD) |
| 12 | SD CS |
| 21 | Display CS |

## Memory Layout

| Region | Address | Size | Purpose |
|--------|---------|------|---------|
| DROM | 0x3C140020 | ~5 MB | Data ROM (strings, constants) |
| DRAM | 0x3FC91C00 | ~14 KB | Initialized data |
| IROM | 0x42000020 | ~1.2 MB | Main executable code |
| IRAM | 0x40380000 | ~72 KB | Hot path code, ISRs |
| RTC | 0x50000000 | 56 bytes | RTC retention memory |

## Battery

- Full: ~4.2V, Empty: ~3.0V
- ADC on GPIO 0 with 2:1 voltage divider
- Polynomial: `percentage = -144.94*V³ + 1655.86*V² - 6158.85*V + 7501.32`

## Implications for kread

### Flash
- 16MB flash nhưng bootloader ESP-IDF mặc định detect 4MB → PHẢI set `board_build.flash_size = 16MB`
- Partition table phải dùng OTA layout (app0 + app1) để tương thích với CrossPoint/official firmware
- Bootloader header byte 3 bits[7:4] = flash size: 0x40 = 16MB

### Display (2-bit grayscale = 4 levels)
- Product brief nói 4-bit (16 levels) → **SAI**. Thực tế chỉ 4 levels.
- Text: 2bpp bitmap là đúng format. Pure B&W cho text sắc nét nhất.
- Images/Covers: cần dithering (Atkinson, Floyd-Steinberg, Blue Noise) để giả lập nhiều mức xám.
- `.kb` format: 2bpp là max hữu ích. 4bpp không cần thiết cho hardware này.

### Framebuffer
- 48KB single buffer. Firmware chỉ cần 1 buffer → tiết kiệm RAM.
- Page data trong `.kb`: 800×480/4 = 96KB raw (2bpp) → LZ4 compressed ~20-40KB.

### Buttons
- 7 buttons nhưng kread chỉ cần: UP, DOWN, BACK, CONFIRM (4 nút chính cho navigation).
- LEFT/RIGHT có thể dùng cho page turn.
- POWER cho sleep/wake + quick access passes.

### Firmware Flash
- kread web chỉ flash kread firmware (OTA) — không flash firmware custom
- Để flash CrossPoint/Papyrix/official firmware → dùng https://xteink.dve.al/
- OTA flash: chỉ ghi app partition, giữ bootloader + partition table
- Full flash: cần bootloader (16MB header) + OTA partition table + boot_app0 + firmware
