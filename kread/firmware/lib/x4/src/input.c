#include <x4/input.h>
#include <string.h>
#include "esp_adc/adc_oneshot.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "x4.input";

// Pins
#define ADC_CH1         ADC_CHANNEL_1  // GPIO1: BACK, CONFIRM, LEFT, RIGHT
#define ADC_CH2         ADC_CHANNEL_2  // GPIO2: UP, DOWN
#define POWER_GPIO      3

// ADC thresholds (from Papyrix, proven on device)
#define ADC_NO_BUTTON   3800
static const int ADC1_THRESHOLDS[] = { 3800, 3100, 2090, 750 };
static const x4_button_t ADC1_BUTTONS[] = { X4_BTN_BACK, X4_BTN_CONFIRM, X4_BTN_LEFT, X4_BTN_RIGHT };
static const int ADC2_THRESHOLDS[] = { 3800, 1120 };
static const x4_button_t ADC2_BUTTONS[] = { X4_BTN_UP, X4_BTN_DOWN };

// Debounce
#define DEBOUNCE_MS     5

// Directional buttons get repeat; non-directional get long-press
static inline bool is_directional(x4_button_t btn) {
    return btn == X4_BTN_LEFT || btn == X4_BTN_RIGHT
        || btn == X4_BTN_UP   || btn == X4_BTN_DOWN;
}

// Event ring buffer
#define EVT_QUEUE_SIZE  16
static x4_input_event_t evt_queue[EVT_QUEUE_SIZE];
static int evt_head = 0;
static int evt_tail = 0;
static int evt_count = 0;

// Config
static x4_input_config_t cfg;

// Per-button state
static bool btn_down[X4_BTN_COUNT];
static uint32_t btn_down_time[X4_BTN_COUNT];
static uint32_t btn_debounce_time[X4_BTN_COUNT];
static bool btn_last_raw[X4_BTN_COUNT];
static bool btn_long_fired[X4_BTN_COUNT];
static uint32_t btn_last_repeat[X4_BTN_COUNT];

// Per-ADC-channel: must see "no button" before accepting new press.
// Prevents ghost presses from voltage passing through other button zones during release.
static bool adc1_saw_idle = true;
static bool adc2_saw_idle = true;

static adc_oneshot_unit_handle_t adc_handle;

// Exported for power.c to share ADC unit (ESP-IDF only allows one handle per unit)
adc_oneshot_unit_handle_t x4_adc_handle = NULL;

static void push_event(x4_button_t btn, x4_event_type_t type)
{
    if (evt_count >= EVT_QUEUE_SIZE) {
        // Drop oldest
        evt_tail = (evt_tail + 1) % EVT_QUEUE_SIZE;
        evt_count--;
    }
    evt_queue[evt_head].button = btn;
    evt_queue[evt_head].type = type;
    evt_head = (evt_head + 1) % EVT_QUEUE_SIZE;
    evt_count++;
}

void x4_input_init(const x4_input_config_t *config)
{
    cfg = config ? *config : (x4_input_config_t)X4_INPUT_CONFIG_DEFAULT;

    memset(btn_down, 0, sizeof(btn_down));
    memset(btn_last_raw, 0, sizeof(btn_last_raw));
    memset(btn_long_fired, 0, sizeof(btn_long_fired));
    evt_head = evt_tail = evt_count = 0;

    // ADC init
    adc_oneshot_unit_init_cfg_t adc_cfg = { .unit_id = ADC_UNIT_1 };
    ESP_ERROR_CHECK(adc_oneshot_new_unit(&adc_cfg, &adc_handle));

    adc_oneshot_chan_cfg_t chan_cfg = {
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_12,
    };
    ESP_ERROR_CHECK(adc_oneshot_config_channel(adc_handle, ADC_CH1, &chan_cfg));
    ESP_ERROR_CHECK(adc_oneshot_config_channel(adc_handle, ADC_CH2, &chan_cfg));
    // Also configure battery channel (GPIO0 = ADC_CHANNEL_0) for power.c
    ESP_ERROR_CHECK(adc_oneshot_config_channel(adc_handle, ADC_CHANNEL_0, &chan_cfg));
    x4_adc_handle = adc_handle;

    // Power button GPIO
    gpio_config_t pwr_cfg = {
        .pin_bit_mask = (1ULL << POWER_GPIO),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
    };
    gpio_config(&pwr_cfg);

    ESP_LOGI(TAG, "Input initialized (7 buttons)");
}

// Thresholds are RAW ADC values (0-4095), matching Papyrix analogRead().
// Do NOT convert to mV before comparing — the thresholds are calibrated for raw values.
static x4_button_t decode_adc(int raw, const int *thresholds, const x4_button_t *buttons, int count)
{
    if (raw >= ADC_NO_BUTTON) return X4_BTN_NONE;
    for (int i = 0; i < count - 1; i++) {
        if (raw >= thresholds[i + 1]) return buttons[i];
    }
    return buttons[count - 1];
}

void x4_input_poll(void)
{
    uint32_t now = xTaskGetTickCount() * portTICK_PERIOD_MS;

    // Read raw button state
    bool raw[X4_BTN_COUNT];
    memset(raw, 0, sizeof(raw));

    // ADC1: require "no button" reading before accepting a new press.
    // This prevents ghost presses when releasing a button — the voltage
    // passes through other buttons' ranges on the resistor ladder.
    int adc1_raw = 0;
    adc_oneshot_read(adc_handle, ADC_CH1, &adc1_raw);
    // Compare raw ADC values directly (thresholds are raw, not mV)
    x4_button_t b1 = decode_adc(adc1_raw, ADC1_THRESHOLDS, ADC1_BUTTONS, 4);
    if (b1 == X4_BTN_NONE) {
        adc1_saw_idle = true;
    } else if (adc1_saw_idle) {
        raw[b1] = true;
    } else {
        // Different button without idle gap — only accept if same as currently held
        for (int i = X4_BTN_BACK; i <= X4_BTN_RIGHT; i++) {
            if (btn_down[i] && b1 == (x4_button_t)i) {
                raw[b1] = true;
                break;
            }
        }
    }

    // ADC2: same idle-gate logic
    int adc2_raw = 0;
    adc_oneshot_read(adc_handle, ADC_CH2, &adc2_raw);
    x4_button_t b2 = decode_adc(adc2_raw, ADC2_THRESHOLDS, ADC2_BUTTONS, 2);
    if (b2 == X4_BTN_NONE) {
        adc2_saw_idle = true;
    } else if (adc2_saw_idle) {
        raw[b2] = true;
    } else {
        for (int i = X4_BTN_UP; i <= X4_BTN_DOWN; i++) {
            if (btn_down[i] && b2 == (x4_button_t)i) {
                raw[b2] = true;
                break;
            }
        }
    }

    // Power button (active low)
    if (gpio_get_level(POWER_GPIO) == 0) raw[X4_BTN_POWER] = true;

    // Process each button
    for (int i = 0; i < X4_BTN_COUNT; i++) {
        // Debounce: only accept change after stable for DEBOUNCE_MS
        if (raw[i] != btn_last_raw[i]) {
            btn_debounce_time[i] = now;
            btn_last_raw[i] = raw[i];
        }

        bool stable = (now - btn_debounce_time[i]) >= DEBOUNCE_MS;
        if (!stable) continue;

        bool was_down = btn_down[i];
        bool is_down = raw[i];

        if (is_down && !was_down) {
            // Press — mark ADC channel as "button held" (no idle seen)
            if (i >= X4_BTN_BACK && i <= X4_BTN_RIGHT) adc1_saw_idle = false;
            if (i >= X4_BTN_UP && i <= X4_BTN_DOWN) adc2_saw_idle = false;
            btn_down[i] = true;
            btn_down_time[i] = now;
            btn_long_fired[i] = false;
            btn_last_repeat[i] = now;
            push_event((x4_button_t)i, X4_EVT_PRESS);
        } else if (!is_down && was_down) {
            // Release
            btn_down[i] = false;
            push_event((x4_button_t)i, X4_EVT_RELEASE);
        } else if (is_down) {
            // Held — check long press / repeat
            uint32_t held = now - btn_down_time[i];

            if (is_directional((x4_button_t)i)) {
                // Directional: repeat
                if (held >= cfg.repeat_start_ms) {
                    if (now - btn_last_repeat[i] >= cfg.repeat_interval_ms) {
                        btn_last_repeat[i] = now;
                        push_event((x4_button_t)i, X4_EVT_REPEAT);
                    }
                }
            } else {
                // Non-directional: long press (once)
                if (!btn_long_fired[i] && held >= cfg.long_press_ms) {
                    btn_long_fired[i] = true;
                    push_event((x4_button_t)i, X4_EVT_LONG_PRESS);
                }
            }
        }
    }
}

bool x4_input_next_event(x4_input_event_t *event)
{
    if (evt_count == 0) return false;
    *event = evt_queue[evt_tail];
    evt_tail = (evt_tail + 1) % EVT_QUEUE_SIZE;
    evt_count--;
    return true;
}
