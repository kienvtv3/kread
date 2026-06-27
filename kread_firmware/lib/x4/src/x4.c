#include <x4/x4.h>
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "esp_log.h"

static const char *TAG = "x4";

// Pin assignments
#define PIN_SCLK  8
#define PIN_MOSI  10
#define PIN_MISO  7
#define PIN_CS    21   // display CS (manual control)

// SPI device handle — used by display.c
spi_device_handle_t x4_spi_display_dev;

void x4_init(const x4_config_t *config)
{
    ESP_LOGI(TAG, "Initializing x4 SDK...");

    // 1. Configure CS as output before deselecting
    gpio_config_t cs_conf = {
        .pin_bit_mask = (1ULL << PIN_CS),
        .mode = GPIO_MODE_OUTPUT,
    };
    gpio_config(&cs_conf);
    gpio_set_level(PIN_CS, 1);  // deselect display before bus init

    // 2. Initialize SPI bus (shared by display + SD)
    spi_bus_config_t bus_cfg = {
        .mosi_io_num = PIN_MOSI,
        .sclk_io_num = PIN_SCLK,
        .miso_io_num = PIN_MISO,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = X4_DISPLAY_FB_SIZE,
    };
    ESP_ERROR_CHECK(spi_bus_initialize(SPI2_HOST, &bus_cfg, SPI_DMA_CH_AUTO));

    // 3. Add display SPI device (manual CS)
    spi_device_interface_config_t dev_cfg = {
        .clock_speed_hz = 40 * 1000 * 1000,
        .mode = 0,
        .spics_io_num = -1,  // manual CS
        .queue_size = 1,
    };
    ESP_ERROR_CHECK(spi_bus_add_device(SPI2_HOST, &dev_cfg, &x4_spi_display_dev));

    // 4. Display init
    x4_display_init();

    // 5. Input init
    x4_input_init(&config->input);

    // 6. SD card init (non-fatal)
    if (!x4_sd_init(&config->sd)) {
        ESP_LOGW(TAG, "SD card not available");
    }

    // 7. Power init
    x4_power_init();

    ESP_LOGI(TAG, "x4 SDK initialized");
}
