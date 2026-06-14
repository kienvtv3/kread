#ifndef X4_POWER_H
#define X4_POWER_H

#include <stdbool.h>

typedef enum {
    X4_WAKEUP_POWER_BUTTON,
    X4_WAKEUP_RESET,
    X4_WAKEUP_OTHER,
} x4_wakeup_reason_t;

void x4_power_init(void);
int  x4_power_battery_percent(void);
bool x4_power_usb_connected(void);
x4_wakeup_reason_t x4_power_wakeup_reason(void);
void x4_power_deep_sleep(void);

#endif
