# kread

Custom e-reader system for Xteink X4 (ESP32-C3, 480x800 E Ink). Two parts: **web** (static web app) and **firmware** (ESP32-C3).

## Architecture

Khác biệt cốt lõi so với CrossPoint/Papyrix: **không render text trên device**. Browser render trước bằng Harfbuzz WASM thành bitmap, firmware chỉ đọc bitmap và blast pixels.

```
web (browser)                           firmware (ESP32-C3)
EPUB → Harfbuzz WASM → bitmap → .kb  →  SD card → LZ4 decompress → E Ink
     full OpenType shaping                no typography, ~7ms page turn
```

- **web** — Svelte 5 + Vite, hosted GitHub Pages. Convert EPUB → `.kb`, manage passes/covers, push via Web Serial, flash via ESP Web Tools.
- **firmware** — C, PlatformIO, ESP-IDF. Read `.kb` bitmaps, drive display. ~2,500–3,500 LOC target. No WiFi stack.
- **No server required** — everything client-side or on-device.

## Hardware

| Spec | Value |
|------|-------|
| MCU | ESP32-C3 (single-core RISC-V @ 160MHz) |
| RAM | ~380KB usable, **no PSRAM** |
| Flash | 16MB (must set `board_build.flash_size = 16MB`) |
| Display | GDEQ0426T82, 4.26" E Ink, SSD1677 controller |
| Resolution | 800×480 native (portrait: 480×800) |
| Grayscale | **4 levels (2-bit)**, not 16 |
| PPI | ~222 (measured) |
| Framebuffer | 48KB (800×480/8, 1-bit) or 96KB dual buffer |
| Device size | 68mm × 114mm |
| Screen size | 55mm × 91mm |
| Bezel | top 6mm, left 6mm, right 6mm, bottom 17mm |
| Buttons | 7: BACK, CONFIRM, LEFT, RIGHT (ADC1), UP, DOWN (ADC2), POWER (GPIO3) |
| USB | USB-C (charge + USB Serial/JTAG) |
| Storage | microSD FAT32 via SPI |
| Display SPI | 40MHz, GPIO8 SCLK, GPIO10 MOSI, GPIO21 CS, GPIO4 DC, GPIO5 RST, GPIO6 BUSY |
| SD SPI | GPIO8 SCLK (shared), GPIO10 MOSI (shared), GPIO7 MISO, GPIO12 CS |

## Font & Text Rendering

### Core Philosophy
Pre-rendering on browser is the key advantage. ESP32-C3 only dumps pixels.

### EPUB Content (highest quality)
- Harfbuzz WASM → FreeType-level vector rendering → 8-bit AA
- Light hinting (`FT_LOAD_TARGET_LIGHT`) — 220ppi is above aggressive hinting threshold
- Gamma correction (γ ≈ 1.8 for e-ink) → quantize to 4 levels (2-bit)
- Baked into `.kb` pages — device has zero font rendering logic

### UI Text (pragmatic)
- Dynamic strings (title, author): pre-rendered at convert time in `.kb` header
- Numeric/status (page, %): digits-only bitmap font, 11 glyphs, baked in firmware
- System strings (menu labels): ~50 pre-rendered strings baked at build time

### What We Do NOT Do
- No runtime font rendering on device
- No bitmap font files for body text
- No threshold-only quantization (loses AA benefit)

## Firmware Architecture

Pure C, ESP-IDF. No Arduino, no C++ abstractions.

### Modules
| Module | Purpose |
|--------|---------|
| `display.c` | SSD1677 SPI driver, framebuffer management, refresh modes |
| `input.c` | ADC button reading, debounce, press/release/long-press events |
| `kb_reader.c` | Parse `.kb` header, page index, LZ4 decompress |
| `serial.c` | KREAD protocol handler (already implemented) |
| `sd.c` | SD card SPI init, FAT32 file operations |
| `ui.c` | State machine, screen composition from pre-rendered bitmaps |

### Display Driver (SSD1677)
- SPI @ 40MHz, DIO mode
- Dual RAM: BW (0x24) = current frame, RED (0x26) = previous frame
- Refresh modes: FULL (~1600ms), HALF (~1720ms), FAST (~600ms), PARTIAL (~50-100ms)
- LUT: 111-byte waveform table for custom refresh

### Firmware Resource Rules
- **Stack**: local variables < 256 bytes
- **Heap**: always check malloc for NULL, free immediately
- **Alignment**: RISC-V faults on unaligned access, use `memcpy`
- **ISR**: `IRAM_ATTR` handlers, `DRAM_ATTR` data
- **Watchdog**: `vTaskDelay(1)` in tight loops

## Partition Layout (OTA, 16MB)

```
nvs      data nvs     0x9000   0x5000
otadata  data ota     0xe000   0x2000
app0     app  ota_0   0x10000  0x640000
app1     app  ota_1   0x650000 0x640000
spiffs   data spiffs  0xc90000 0x360000
coredump data coredump 0xFF0000 0x10000
```

Compatible with CrossPoint/official firmware partition layout.

## KREAD Serial Protocol

Text-based over USB Serial/JTAG @ 115200 baud. See `docs/protocol.md`.

## Commands

```bash
# web
cd web && npm install && npm run dev

# firmware
cd firmware && pio run              # build
pio run -t upload                   # flash via USB
pio device monitor                  # serial monitor

# flash with esptool (full flash)
esptool --chip esp32c3 --port COM7 write-flash \
  0x0 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin 0x10000 firmware.bin
```

## Development Guidelines

### firmware
- Pure C, ESP-IDF. No C++, no Arduino.
- Device only dumps pre-rendered bitmaps — no font rendering.
- OTA partition layout — compatible with CrossPoint/official for recovery.
- Flash firmware via kread web only. Other firmware → xteink.dve.al

### web
- Browser-only, no server-side code
- Chrome/Edge required (Web Serial API)
- Rendering in Web Workers

### General
- Commits: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`
- No over-engineering. MVP first.
