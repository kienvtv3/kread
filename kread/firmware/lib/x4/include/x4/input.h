#ifndef X4_INPUT_H
#define X4_INPUT_H

#include <stdint.h>
#include <stdbool.h>

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
    uint32_t long_press_ms;
    uint32_t repeat_start_ms;
    uint32_t repeat_interval_ms;
} x4_input_config_t;

#define X4_INPUT_CONFIG_DEFAULT { 700, 700, 350 }

void x4_input_init(const x4_input_config_t *config);
void x4_input_poll(void);
bool x4_input_next_event(x4_input_event_t *event);

#endif
