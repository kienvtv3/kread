# x4 SDK & Display Driver Design

Date: 2026-03-15

## Overview

General-purpose hardware abstraction SDK for the Xteink X4 e-reader (ESP32-C3, SSD1677 800x480 E Ink). The SDK provides a clean C API for display, input, SD card, and power management — independent of any specific application.

The primary consumer is kread, a custom e-reader firmware that displays pre-rendered 2-bit grayscale pages from `.kb` files. Grayscale is the primary display mode, not a secondary feature.

## Architecture

```
kread app (serial, kb_reader, ui)
         │
         ▼
    x4 SDK (lib/x4/)          ← this spec
         │
         ▼
    ESP-IDF (SPI, GPIO, ADC, FreeRTOS, VFS)
```

Dependencies flow one direction: app → SDK → ESP-IDF. SDK has no knowledge of kread, `.kb` format, or application logic.

## Directory Structure

```
kread/firmware/lib/x4/
├── include/x4/
│   ├── x4.h              # Top-level init, convenience include-all
│   ├── display.h          # SSD1677 driver API
│   ├── input.h            # ADC button API
│   ├── sd.h               # SD card mount/unmount
│   └── power.h            # Battery, sleep, USB detection
└── src/
    ├── x4.c               # SPI bus init, x4_init()
    ├── display.c           # Port from Papyrix EInkDisplay.cpp
    ├── input.c             # Port from Papyrix InputManager + Input
    ├── sd.c                # ESP-IDF VFS FAT32 mount
    └── power.c             # ADC battery, deep sleep
```

## Initialization

Single entry point initializes SPI bus and all modules in correct order.

```c
typedef struct {
    x4_display_config_t display;
    x4_input_config_t   input;
    x4_sd_config_t      sd;
} x4_config_t;

// Aborts on critical failure (ESP_ERROR_CHECK).
// Display and input always succeed or abort.
// SD card failure is non-fatal (x4_sd_mounted() returns false).
void x4_init(const x4_config_t *config);
```

Internal init order:
1. SPI bus (`spi_bus_initialize`, 40MHz, SPI2_HOST)
2. GPIO (output: CS=21, DC=4, RST=5; input: BUSY=6)
3. Display (add SPI device, hardware reset, controller init)
4. Input (ADC config for channels 1 & 2, power button GPIO3)
5. SD card (add SPI device CS=12, mount FAT32 via VFS)
6. Power (battery ADC on GPIO0, USB detect on GPIO20)

SPI bus ownership: `x4_init()` owns the bus. Individual modules register devices on it. This matches the CrossPoint/Papyrix pattern where SPI is initialized once before any device uses it.

### Pin Assignments

| Function | GPIO | Notes |
|----------|------|-------|
| SPI SCLK | 8 | Shared display + SD |
| SPI MOSI | 10 | Shared display + SD |
| SPI MISO | 7 | SD card only |
| Display CS | 21 | |
| Display DC | 4 | |
| Display RST | 5 | |
| Display BUSY | 6 | HIGH = busy |
| SD CS | 12 | |
| Power button | 3 | GPIO, active low |
| Battery ADC | 0 | Polynomial → percentage |
| USB detect | 20 | UART0_RXD, HIGH = connected |
| ADC1 buttons | 1 | BACK, CONFIRM, LEFT, RIGHT |
| ADC2 buttons | 2 | UP, DOWN |

## Display Module

### Source

Line-by-line port of Papyrix `EInkDisplay.cpp` (703 LOC, proven on device running v1.18.0) to pure C / ESP-IDF.

### Key Mappings (Arduino → ESP-IDF)

| Arduino | ESP-IDF |
|---------|---------|
| `SPI.beginTransaction()` / `endTransaction()` | Not needed (ESP-IDF handles) |
| `SPI.transfer(byte)` | `spi_device_transmit()` with manual CS |
| `SPI.writeBytes(data, len)` | `spi_device_transmit()` in chunks (max 4096, ESP-IDF SPI DMA limit) |
| `digitalWrite(pin, val)` | `gpio_set_level(pin, val)` |
| `digitalRead(pin)` | `gpio_get_level(pin)` |
| `delay(ms)` | `vTaskDelay(pdMS_TO_TICKS(ms))` |
| `millis()` | `xTaskGetTickCount() * portTICK_PERIOD_MS` |
| `pgm_read_byte()` | Direct array access (ESP32 flash-maps const) |
| `PROGMEM` | Not needed |
| `std::vector` | `malloc` / `free` |

Implementation notes:
- Internal `send_data(const uint8_t *data, size_t len)` uses `size_t` for length (Papyrix uses `uint16_t` which fits but `size_t` is idiomatic C)
- `wait_busy()` timeout: 10 seconds (matching Papyrix), logs error on timeout

### Constants

```c
#define X4_DISPLAY_WIDTH       800   // native landscape
#define X4_DISPLAY_HEIGHT      480
#define X4_DISPLAY_FB_SIZE     48000  // 800 * 480 / 8
```

### Configuration

```c
typedef enum {
    X4_DISPLAY_SINGLE_BUFFER,   // 48KB RAM, post-refresh RED sync
    X4_DISPLAY_DUAL_BUFFER,     // 96KB RAM, always-correct RED
} x4_display_buffer_mode_t;

typedef struct {
    x4_display_buffer_mode_t buffer_mode;
} x4_display_config_t;

#define X4_DISPLAY_CONFIG_DEFAULT { X4_DISPLAY_DUAL_BUFFER }
```

**Single buffer**: One 48KB framebuffer. After each refresh, RED RAM must be synced with BW RAM (extra 48KB SPI write ~10ms). If power lost between refresh and sync, RED RAM stale → ghost on next fast refresh.

**Dual buffer**: Two 48KB framebuffers (current + previous). RED RAM always written with correct previous frame before refresh. No post-sync needed. Higher RAM cost but best refresh quality.

Recommended: dual buffer for kread (UX priority, 154KB remaining RAM sufficient).

### Refresh Modes

```c
typedef enum {
    X4_REFRESH_FULL,    // ~1600ms, built-in LUT, clears all ghosting
    X4_REFRESH_HALF,    // ~1720ms, high temp register trick, good ghost clearing
    X4_REFRESH_FAST,    // ~600ms, differential BW vs RED comparison
} x4_display_refresh_t;
```

Source: Papyrix `refreshDisplay()` method. Display mode bits:

| Bit | Hex | Name | Effect |
|-----|-----|------|--------|
| 7 | 0x80 | CLOCK_ON | Start internal oscillator |
| 6 | 0x40 | ANALOG_ON | Enable analog power rails |
| 5 | 0x20 | TEMP_LOAD | Load temperature value |
| 4 | 0x10 | LUT_LOAD | Load waveform LUT |
| 3 | 0x08 | MODE_SELECT | Mode 1/2 |
| 2 | 0x04 | DISPLAY_START | Run display |
| 1 | 0x02 | ANALOG_OFF | Shutdown analog rails |
| 0 | 0x01 | CLOCK_OFF | Disable oscillator |

Display mode **base** values per refresh type (before power state bits):
- FULL: `0x34` (TEMP_LOAD + LUT_LOAD + DISPLAY_START)
- HALF: `0xD4` (CLOCK_ON + ANALOG_ON + LUT_LOAD + DISPLAY_START) + write temp register `0x5A`
- FAST: `0x1C` (TEMP_LOAD + MODE_SELECT + DISPLAY_START) or `0x0C` if custom LUT active

Power state bits are OR'd into the base value dynamically:
- `0xC0` (CLOCK_ON + ANALOG_ON) added when `is_screen_on == false` — except HALF which already includes these unconditionally (because it overrides temperature)
- `0x03` (ANALOG_OFF + CLOCK_OFF) added when `turn_off == true`

CTRL1 register (CMD 0x21):
- `0x00` (CTRL1_NORMAL) for FAST refresh — compare BW vs RED
- `0x40` (CTRL1_BYPASS_RED) for FULL/HALF — ignore RED RAM

IMPORTANT: Current kread display.c uses `0x80` for CTRL1 bypass, which is incorrect. Papyrix uses `0x40`. This must be fixed in the port.

### Power State Tracking

Internal `is_screen_on` flag tracks whether analog rails are active.

- `turn_off=true`: After refresh, set ANALOG_OFF + CLOCK_OFF bits. Prevents sunlight UV fading on GDEQ0426T82 (no resin protection). Saves battery.
- If screen is off and FAST refresh requested: auto-upgrade to HALF (RED RAM may be stale after power-off, differential comparison unreliable).
- Power-up adds CLOCK_ON + ANALOG_ON bits (~50-100ms overhead).

### API

```c
// Lifecycle
void x4_display_init(const x4_display_config_t *config);  // called by x4_init()
void x4_display_sleep(void);  // power down analog rails if on, then deep sleep cmd. Needs x4_init() to wake.

// Framebuffer (native landscape 800x480, 1-bit)
uint8_t *x4_display_framebuffer(void);
void     x4_display_clear(uint8_t color);  // 0xFF=white, 0x00=black

// B&W display
void x4_display_update(x4_display_refresh_t mode, bool turn_off);
void x4_display_update_window(uint16_t x, uint16_t y,
                              uint16_t w, uint16_t h, bool turn_off);

// Grayscale (2-bit, 4 levels via custom LUT)
void x4_display_grayscale(const uint8_t *lsb, const uint8_t *msb,
                          bool turn_off);
void x4_display_grayscale_lsb(const uint8_t *lsb);
void x4_display_grayscale_msb(const uint8_t *msb);
void x4_display_grayscale_refresh(bool turn_off);
void x4_display_grayscale_revert(void);
```

### Grayscale Details

SSD1677 achieves 4 grayscale levels by encoding 2-bit pixel data across BW RAM (LSB) and RED RAM (MSB):

| MSB (RED) | LSB (BW) | Level |
|-----------|----------|-------|
| 0 | 0 | Black |
| 0 | 1 | Dark gray |
| 1 | 0 | Light gray |
| 1 | 1 | White |

Custom LUT (`lut_grayscale`, 112 bytes) defines waveform for each transition. Port from Papyrix — these values are tuned for GDEQ0426T82.

**Grayscale flow:**
1. `x4_display_grayscale_lsb(lsb)` → set RAM area, write LSB to BW RAM
2. `x4_display_grayscale_msb(msb)` → write MSB to RED RAM
3. `x4_display_grayscale_refresh(turn_off)` → load grayscale LUT, refresh, unload LUT
4. Internal `in_grayscale_mode` flag set to true

**Revert flow (before any B&W operation):**
1. `x4_display_grayscale_revert()` → load revert LUT, FAST refresh (auto-upgraded to HALF if screen off), clear flag
2. Called automatically by `x4_display_update()` if `in_grayscale_mode` is true
3. After revert, screen is left in powered-on state (`is_screen_on = true`). The subsequent `x4_display_update()` call controls the final power state via its own `turn_off` parameter.

**`x4_display_grayscale()` convenience function:** Calls `grayscale_lsb()` + `grayscale_msb()` + `grayscale_refresh()` internally. Use when both planes are in RAM simultaneously.

**3-step API rationale:** Allows streaming from SD card. Read LSB plane → send to display → free buffer → read MSB plane → send → free → refresh. Only 48KB needed at a time instead of 96KB.

### Windowed Update

`x4_display_update_window(x, y, w, h, turn_off)` — fast-refresh a rectangular subregion.

Constraints:
- `x` and `w` must be multiples of 8 (byte-aligned)
- Always uses FAST refresh mode
- Allocates temporary window buffer via `malloc` (windowWidthBytes * h), frees after use
- Automatically reverts grayscale if active

Source: Papyrix `displayWindow()`. Uses `setRamArea()` to configure partial RAM region.

### setRamArea() — Critical Implementation Detail

Source: Papyrix, verified on device.

```
setRamArea(x, y, w, h):
  y = DISPLAY_HEIGHT - y - h          // reverse Y (gates reversed on GDEQ0426T82)
  data_entry_mode = 0x01              // X increment, Y decrement
  RAM X range = pixel coordinates     // 4 bytes: startLo, startHi, endLo, endHi
  RAM Y range = pixel coordinates     // 4 bytes: (y+h-1)Lo, Hi, yLo, yHi
  RAM X counter = x (pixel)           // 2 bytes: lo, hi
  RAM Y counter = (y+h-1) (pixel)     // 2 bytes: lo, hi
```

IMPORTANT: RAM X range uses **pixel** coordinates with 4 bytes (startLo, startHi, endLo, endHi). Current kread display.c has two bugs: (1) sends byte addresses (`x/8`) instead of pixel, and (2) sends only 2 bytes instead of 4 for X range. Both in `set_ram_area()` and in `display_init()`. The x4 SDK `initDisplayController()` calls `setRamArea(0, 0, WIDTH, HEIGHT)` during init (matching Papyrix), so the init sequence inherits the correct 4-byte pixel-coordinate format.

### LUT Data

Two LUTs ported from Papyrix (const arrays in flash):

- `lut_grayscale` (112 bytes): VS patterns for 4-level rendering
- `lut_grayscale_revert` (112 bytes): VS patterns to revert grayscale back to B&W

LUT structure: 50 bytes VS + 50 bytes TP/RP + 5 bytes frame rate + 5 bytes voltages + 2 bytes reserved = 112 bytes.

Loading: `CMD_WRITE_LUT` (first 105 bytes), then separate voltage commands for VGH, VSH1/VSH2/VSL, VCOM (bytes 105-109).

### What Is NOT Ported

- `saveFrameBufferAsPBM()` — desktop-only debug function
- Dual-buffer `swapBuffers()` is internal, not exposed in API
- `drawImage()` with PROGMEM — app blits directly to framebuffer
- Portrait coordinate mapping — app responsibility, not SDK

## Input Module

### Source

Port from Papyrix InputManager (ADC reading, debounce) + Input driver (event generation).

### API

```c
typedef enum {
    X4_BTN_BACK,
    X4_BTN_CONFIRM,
    X4_BTN_LEFT,
    X4_BTN_RIGHT,
    X4_BTN_UP,
    X4_BTN_DOWN,
    X4_BTN_POWER,
    X4_BTN_COUNT,
    X4_BTN_NONE = -1,
} x4_button_t;

typedef enum {
    X4_EVT_PRESS,
    X4_EVT_LONG_PRESS,
    X4_EVT_REPEAT,
    X4_EVT_RELEASE,
} x4_event_type_t;

typedef struct {
    x4_button_t     button;
    x4_event_type_t type;
} x4_input_event_t;

typedef struct {
    uint32_t long_press_ms;       // default 700
    uint32_t repeat_start_ms;     // default 700
    uint32_t repeat_interval_ms;  // default 350
} x4_input_config_t;

#define X4_INPUT_CONFIG_DEFAULT { 700, 700, 350 }

void x4_input_init(const x4_input_config_t *config);
void x4_input_poll(void);
bool x4_input_next_event(x4_input_event_t *event);
```

### ADC Thresholds

From Papyrix (proven on device):

```
ADC1 (GPIO1): BACK, CONFIRM, LEFT, RIGHT
  Thresholds: {3800, 3100, 2090, 750}
  Reading > 3800 = no button
  3100-3800 = BACK
  2090-3100 = CONFIRM
  750-2090  = LEFT
  < 750     = RIGHT

ADC2 (GPIO2): UP, DOWN
  Thresholds: {3800, 1120}
  Reading > 3800 = no button
  1120-3800 = UP
  < 1120    = DOWN

Power button: GPIO3, active low, read via gpio_get_level()
```

### Debounce

5ms debounce delay (from Papyrix). State must be stable for 5ms before registering change.

### Event Generation

- **PRESS**: On button-down transition after debounce
- **LONG_PRESS**: After `long_press_ms` (700ms). Only for non-directional buttons (BACK, CONFIRM, POWER)
- **REPEAT**: After `repeat_start_ms` (700ms), then every `repeat_interval_ms` (350ms). Only for directional buttons (UP, DOWN, LEFT, RIGHT)
- **RELEASE**: On button-up transition

Internal ring buffer: 16 events capacity. On overflow, oldest events are dropped (newest preserved).

### No Button Remapping

SDK exposes hardware buttons as-is. App layer handles remapping if needed (e.g., swap LEFT/RIGHT for different reading modes).

## SD Card Module

### API

```c
typedef struct {
    const char *mount_point;  // default "/sd"
} x4_sd_config_t;

#define X4_SD_CONFIG_DEFAULT { "/sd" }

bool x4_sd_init(const x4_sd_config_t *config);
void x4_sd_deinit(void);
bool x4_sd_mounted(void);
```

No file operation wrappers. After `x4_sd_init()`, app uses standard C stdio:
```c
FILE *f = fopen("/sd/books/book.kb", "rb");
fread(buf, 1, size, f);
fclose(f);
```

ESP-IDF VFS handles the filesystem layer. SDK only manages mount/unmount and SPI device registration (CS=12, 40MHz).

## Power Module

### API

```c
typedef enum {
    X4_WAKEUP_POWER_BUTTON,
    X4_WAKEUP_RESET,
    X4_WAKEUP_OTHER,
} x4_wakeup_reason_t;

void x4_power_init(void);   // called by x4_init(), no config needed
int  x4_power_battery_percent(void);
bool x4_power_usb_connected(void);
x4_wakeup_reason_t x4_power_wakeup_reason(void);
void x4_power_deep_sleep(void);
```

### Battery

ADC on GPIO0. Polynomial conversion from voltage to percentage (port from CrossPoint/Papyrix).

### Deep Sleep

App is responsible for calling cleanup before deep sleep:
```c
x4_display_sleep();   // display deep sleep mode
x4_sd_deinit();       // unmount SD
x4_power_deep_sleep();  // configure GPIO3 wakeup, esp_deep_sleep_start()
```

### USB Detection

GPIO20 (UART0_RXD) reads HIGH when USB cable connected. Used by app to:
- Enable serial protocol
- Inhibit deep sleep while charging

## kread App Changes

Current `src/display.c` and `src/display.h` are replaced by x4 SDK. App code changes:

```c
// Before:
#include "display.h"
display_init();
display_update(REFRESH_FULL);

// After:
#include <x4/x4.h>
x4_init(&cfg);
x4_display_update(X4_REFRESH_FULL, true);
```

`src/input.c` also replaced by SDK. `src/serial.c` and `src/main.c` stay in app, updated to use x4 API.

## Adaptive Refresh Strategy (App Level, Not SDK)

SDK provides all three refresh modes. App implements the strategy:

- Default: FAST refresh with `turn_off=true`
- Every N pages (tunable, start with 10): FULL refresh to clear ghost accumulation
- If screen was off and FAST requested: SDK auto-upgrades to HALF
- User setting (future): Fast / Balanced / Quality presets

## RAM Budget (Dual Buffer Mode)

```
Framebuffers (2x 48KB)       96KB
ESP-IDF + FreeRTOS           ~80KB
Stack + heap misc            ~50KB
────────────────────────────────
Fixed overhead               ~226KB
Available for app            ~154KB

App concurrent needs:
  SD read buffer              4KB
  LZ4 decompress (temp)     ~60KB    (malloc/free)
  UI state, strings          ~10KB
────────────────────────────────
Remaining                    ~80KB
```

With SD card cache (pre-decompress pages to SD), LZ4 buffers are only needed during background pre-caching, not during page turns.
