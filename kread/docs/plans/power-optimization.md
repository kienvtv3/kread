# Power Optimization Plan

## Problem
kread firmware runs CPU at 160MHz constantly, draining battery ~5x faster than necessary.

## Solutions (ordered by impact)

### 1. CPU Frequency Scaling (biggest win)
Drop from 160MHz → 10MHz after 3s idle (like Papyrix).

```c
#include "esp_pm.h"

// After 3s no input → throttle
if (idle_ms > 3000 && !cpu_throttled) {
    setCpuFrequencyMhz(10);
    cpu_throttled = true;
}
// On any button press → restore
if (button_pressed && cpu_throttled) {
    setCpuFrequencyMhz(160);
    cpu_throttled = false;
}
```

Expected: ~5x power reduction in idle (50mA → 10mA).

### 2. Deep Sleep + GPIO Wakeup
After configurable timeout (e.g. 10s no input) → enter deep sleep.
Power button (GPIO3) configured as wakeup source.

```c
esp_sleep_enable_gpio_wakeup();
gpio_wakeup_enable(GPIO_NUM_3, GPIO_INTR_LOW_LEVEL);
esp_deep_sleep_start();
```

Expected: <1mA in sleep.

### 3. Adaptive Tick Rate
Currently fixed 50ms (20Hz). Change to:
- 10ms (100Hz) when active (responsive buttons)
- 50ms (20Hz) when idle (save power)

```c
int tick_ms = (idle_ms > 1000) ? 50 : 10;
vTaskDelay(pdMS_TO_TICKS(tick_ms));
```

### 4. Display Sleep
After rendering, put SSD1677 into deep sleep mode (already supported in x4 driver).
Wake on next render request.

## Implementation Order
1. CPU throttle (quick, biggest impact)
2. Deep sleep (medium effort)
3. Adaptive tick (trivial)
4. Display sleep (already have API)

## Status
- [ ] CPU frequency scaling
- [ ] Deep sleep
- [ ] Adaptive tick
- [ ] Display sleep
