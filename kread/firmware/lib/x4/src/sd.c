#include <x4/sd.h>
#include <string.h>
#include "esp_log.h"
#include "esp_vfs_fat.h"
#include "driver/sdspi_host.h"
#include "sdmmc_cmd.h"

static const char *TAG = "x4.sd";

#define SD_CS_GPIO  12

static sdmmc_card_t *card = NULL;
static const char *mount_path = NULL;
static bool mounted = false;

bool x4_sd_init(const x4_sd_config_t *config)
{
    mount_path = config ? config->mount_point : "/sd";

    sdmmc_host_t host = SDSPI_HOST_DEFAULT();
    host.slot = SPI2_HOST;

    sdspi_device_config_t slot = SDSPI_DEVICE_CONFIG_DEFAULT();
    slot.gpio_cs = SD_CS_GPIO;
    slot.host_id = SPI2_HOST;

    esp_vfs_fat_sdmmc_mount_config_t mount_cfg = {
        .format_if_mount_failed = false,
        .max_files = 5,
        .allocation_unit_size = 0,
    };

    esp_err_t err = esp_vfs_fat_sdspi_mount(mount_path, &host, &slot, &mount_cfg, &card);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "SD mount failed: %s", esp_err_to_name(err));
        mounted = false;
        return false;
    }

    sdmmc_card_print_info(stdout, card);
    mounted = true;
    ESP_LOGI(TAG, "SD mounted at %s", mount_path);
    return true;
}

void x4_sd_deinit(void)
{
    if (mounted && mount_path) {
        esp_vfs_fat_sdcard_unmount(mount_path, card);
        mounted = false;
        card = NULL;
        ESP_LOGI(TAG, "SD unmounted");
    }
}

bool x4_sd_mounted(void)
{
    return mounted;
}
