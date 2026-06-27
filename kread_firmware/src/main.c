#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

#include "serial.h"
#include "ui_assets.h"
#include "ui.h"
#include <x4/x4.h>

static const char *TAG = "kread";

void app_main(void)
{
    ESP_LOGI(TAG, "kread v" KREAD_VERSION);

    serial_init();

    x4_config_t cfg = {
        .input = X4_INPUT_CONFIG_DEFAULT,
        .sd    = X4_SD_CONFIG_DEFAULT,
    };
    x4_init(&cfg);

    ui_set_language(UI_ASSETS_EN);
    ui_init();

    while (1) {
        serial_poll();
        x4_input_poll();
        ui_update();
        vTaskDelay(pdMS_TO_TICKS(50));
    }
}
