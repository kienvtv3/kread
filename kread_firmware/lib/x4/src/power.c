#include <x4/power.h>
#include "esp_log.h"
#include "esp_sleep.h"
#include "esp_adc/adc_oneshot.h"
#include "esp_adc/adc_cali.h"
#include "esp_adc/adc_cali_scheme.h"
#include "driver/gpio.h"

static const char *TAG = "x4.power";

#define USB_GPIO        20  // UART0_RXD
#define POWER_GPIO      3

// Shared ADC handle from input.c (input owns ADC_UNIT_1, configures battery channel too)
extern adc_oneshot_unit_handle_t x4_adc_handle;

static adc_cali_handle_t adc_cali = NULL;

void x4_power_init(void)
{
    // USB detection GPIO
    gpio_config_t usb_cfg = {
        .pin_bit_mask = (1ULL << USB_GPIO),
        .mode = GPIO_MODE_INPUT,
    };
    gpio_config(&usb_cfg);

    // ADC calibration for accurate battery voltage reading
    // The polynomial was derived from calibrated mV readings (Papyrix uses analogReadMilliVolts)
    adc_cali_curve_fitting_config_t cali_cfg = {
        .unit_id = ADC_UNIT_1,
        .atten = ADC_ATTEN_DB_12,
        .bitwidth = ADC_BITWIDTH_12,
    };
    esp_err_t err = adc_cali_create_scheme_curve_fitting(&cali_cfg, &adc_cali);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "ADC calibration not available: %s", esp_err_to_name(err));
    }

    ESP_LOGI(TAG, "Power initialized");
}

int x4_power_battery_percent(void)
{
    if (!x4_adc_handle) return -1;

    int raw = 0;
    adc_oneshot_read(x4_adc_handle, ADC_CHANNEL_0, &raw);

    // Get calibrated millivolts (matches Papyrix analogReadMilliVolts behavior)
    int mv;
    if (adc_cali) {
        adc_cali_raw_to_voltage(adc_cali, raw, &mv);
    } else {
        mv = raw * 3300 / 4095;  // fallback, less accurate
    }

    // Voltage divider (2x)
    double volts = (mv * 2.0) / 1000.0;

    // Polynomial from CrossPoint/Papyrix BatteryMonitor
    double pct = -144.9390 * volts * volts * volts
               + 1655.8629 * volts * volts
               - 6158.8520 * volts
               + 7501.3202;

    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;
    return (int)(pct + 0.5);
}

bool x4_power_usb_connected(void)
{
    return gpio_get_level(USB_GPIO) == 1;
}

x4_wakeup_reason_t x4_power_wakeup_reason(void)
{
    esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
    switch (cause) {
        case ESP_SLEEP_WAKEUP_GPIO:
        case ESP_SLEEP_WAKEUP_EXT0:
            return X4_WAKEUP_POWER_BUTTON;
        default:
            if (cause == ESP_SLEEP_WAKEUP_UNDEFINED) return X4_WAKEUP_RESET;
            return X4_WAKEUP_OTHER;
    }
}

void x4_power_deep_sleep(void)
{
    ESP_LOGI(TAG, "Entering deep sleep...");
    // Wake on power button (GPIO3, active low = wake on low)
    esp_deep_sleep_enable_gpio_wakeup(1ULL << POWER_GPIO, ESP_GPIO_WAKEUP_GPIO_LOW);
    esp_deep_sleep_start();
}
