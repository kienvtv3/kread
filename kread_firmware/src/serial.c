/**
 * serial.c - KREAD serial protocol implementation
 *
 * Protocol commands:
 *   KREAD_LIST   - List files on SD card
 *   KREAD_INFO   - Get device info
 *   KREAD_START <filename> <size> - Start file transfer
 *   KREAD_END <crc32> - End file transfer
 *   KREAD_DELETE <filename> - Delete a file
 *   KREAD_EXISTS <filename> - Check if file exists
 */

#include "serial.h"
#include <stdio.h>
#include <string.h>
#include <dirent.h>
#include <sys/stat.h>
#include "esp_log.h"
#include "driver/usb_serial_jtag.h"
#include <x4/sd.h>
#include "driver/temperature_sensor.h"

static temperature_sensor_handle_t temp_handle = NULL;

static const char *TAG = "serial";

#define RX_BUF_SIZE 256
#define CMD_MAX_LEN 128

static char rx_buffer[RX_BUF_SIZE];
static int rx_pos = 0;

// File transfer state
static bool transfer_active = false;
static char transfer_filename[64];
static char transfer_path[80];
static uint32_t transfer_size = 0;
static uint32_t transfer_received = 0;
static FILE *transfer_file = NULL;

void serial_init(void)
{
    usb_serial_jtag_driver_config_t config = {
        .rx_buffer_size = 4096,
        .tx_buffer_size = 1024,
    };
    ESP_ERROR_CHECK(usb_serial_jtag_driver_install(&config));

    // Init internal temperature sensor
    temperature_sensor_config_t temp_cfg = TEMPERATURE_SENSOR_CONFIG_DEFAULT(10, 50);
    temperature_sensor_install(&temp_cfg, &temp_handle);
    temperature_sensor_enable(temp_handle);

    ESP_LOGI(TAG, "Serial initialized");
}

static void build_path(char *dest, size_t dest_size, const char *filename)
{
    // Prepend /sd/ if not already absolute
    if (filename[0] == '/') {
        snprintf(dest, dest_size, "%s", filename);
    } else {
        snprintf(dest, dest_size, "/sd/%s", filename);
    }
}

static void process_command(const char *cmd)
{
    ESP_LOGI(TAG, "CMD: %s", cmd);

    if (strcmp(cmd, "KREAD_LIST") == 0) {
        serial_send_files();
    }
    else if (strcmp(cmd, "KREAD_INFO") == 0) {
        serial_send_info();
    }
    else if (strncmp(cmd, "KREAD_START ", 12) == 0) {
        // Parse: KREAD_START <filename> <size>
        char filename[64];
        uint32_t size;
        if (sscanf(cmd + 12, "%63s %u", filename, (unsigned *)&size) == 2) {
            if (!x4_sd_mounted()) {
                serial_send_error("no_sd");
                return;
            }

            strcpy(transfer_filename, filename);
            build_path(transfer_path, sizeof(transfer_path), filename);
            transfer_size = size;
            transfer_received = 0;
            transfer_active = true;

            // Open file for writing
            transfer_file = fopen(transfer_path, "wb");
            if (!transfer_file) {
                ESP_LOGE(TAG, "Cannot open %s for writing", transfer_path);
                transfer_active = false;
                serial_send_error("open_fail");
                return;
            }

            ESP_LOGI(TAG, "Transfer start: %s (%u bytes)", transfer_path, (unsigned)size);
            serial_send_ready();
        } else {
            serial_send_error("invalid_args");
        }
    }
    else if (strncmp(cmd, "KREAD_END ", 10) == 0) {
        if (transfer_active && transfer_file) {
            fclose(transfer_file);
            transfer_file = NULL;
            transfer_active = false;
            ESP_LOGI(TAG, "Transfer complete: %s (%u bytes received)",
                     transfer_path, (unsigned)transfer_received);
            serial_send_ok();
        } else {
            serial_send_error("no_transfer");
        }
    }
    else if (strncmp(cmd, "KREAD_DELETE ", 13) == 0) {
        if (!x4_sd_mounted()) { serial_send_error("no_sd"); return; }
        char path[80];
        build_path(path, sizeof(path), cmd + 13);
        if (remove(path) == 0) {
            ESP_LOGI(TAG, "Deleted: %s", path);
            serial_send_ok();
        } else {
            serial_send_error("delete_fail");
        }
    }
    else if (strncmp(cmd, "KREAD_EXISTS ", 13) == 0) {
        if (!x4_sd_mounted()) { serial_send_error("no_sd"); return; }
        char path[80];
        build_path(path, sizeof(path), cmd + 13);
        struct stat st;
        if (stat(path, &st) == 0) {
            serial_send_ok();
        } else {
            serial_send_error("not_found");
        }
    }
    else {
        serial_send_error("invalid_cmd");
    }
}

void serial_poll(void)
{
    uint8_t data[512];
    int len = usb_serial_jtag_read_bytes(data, sizeof(data), 0);

    if (len > 0) {
        if (transfer_active && transfer_received < transfer_size) {
            // Binary transfer mode — write to SD card
            uint32_t remaining = transfer_size - transfer_received;
            uint32_t to_write = (uint32_t)len < remaining ? (uint32_t)len : remaining;

            if (transfer_file) {
                fwrite(data, 1, to_write, transfer_file);
                fflush(transfer_file);
            }
            transfer_received += to_write;

            // Log progress every 4KB
            if ((transfer_received % 4096) < (uint32_t)len || transfer_received >= transfer_size) {
                ESP_LOGI(TAG, "Transfer: %u / %u bytes",
                         (unsigned)transfer_received, (unsigned)transfer_size);
            }

            // If we received extra bytes after transfer complete, process as commands
            if (to_write < (uint32_t)len) {
                // Remaining bytes are command data
                uint32_t cmd_start = to_write;
                for (uint32_t i = cmd_start; i < (uint32_t)len; i++) {
                    char c = data[i];
                    if (c == '\n' || c == '\r') {
                        if (rx_pos > 0) {
                            rx_buffer[rx_pos] = '\0';
                            process_command(rx_buffer);
                            rx_pos = 0;
                        }
                    } else if (rx_pos < CMD_MAX_LEN - 1) {
                        rx_buffer[rx_pos++] = c;
                    }
                }
            }
        } else {
            // Command mode - accumulate until newline
            for (int i = 0; i < len; i++) {
                char c = data[i];
                if (c == '\n' || c == '\r') {
                    if (rx_pos > 0) {
                        rx_buffer[rx_pos] = '\0';
                        process_command(rx_buffer);
                        rx_pos = 0;
                    }
                } else if (rx_pos < CMD_MAX_LEN - 1) {
                    rx_buffer[rx_pos++] = c;
                }
            }
        }
    }
}

static void serial_write(const char *str)
{
    usb_serial_jtag_write_bytes((const uint8_t *)str, strlen(str), pdMS_TO_TICKS(100));
}

void serial_send_ok(void)
{
    serial_write("KREAD_OK\n");
}

void serial_send_ready(void)
{
    serial_write("KREAD_READY\n");
}

void serial_send_error(const char *reason)
{
    char buf[128];
    snprintf(buf, sizeof(buf), "KREAD_ERROR %s\n", reason);
    serial_write(buf);
}

void serial_send_info(void)
{
    float temp_c = 0;
    if (temp_handle) {
        temperature_sensor_get_celsius(temp_handle, &temp_c);
    }
    uint32_t free_heap = esp_get_free_heap_size();

    char buf[256];
    snprintf(buf, sizeof(buf),
        "KREAD_INFO {\"fw\":\"%s\",\"sd\":%s,\"temp\":%.1f,\"heap\":%u}\n",
        KREAD_VERSION,
        x4_sd_mounted() ? "true" : "false",
        temp_c,
        (unsigned)free_heap);
    serial_write(buf);
}

void serial_send_files(void)
{
    if (!x4_sd_mounted()) {
        serial_write("KREAD_FILES {\"files\":[]}\n");
        return;
    }

    serial_write("KREAD_FILES {\"files\":[");

    DIR *dir = opendir("/sd");
    if (dir) {
        struct dirent *entry;
        bool first = true;
        while ((entry = readdir(dir)) != NULL) {
            // Skip hidden files and directories
            if (entry->d_name[0] == '.') continue;
            if (entry->d_type == DT_DIR) continue;

            char path[280];
            snprintf(path, sizeof(path), "/sd/%.255s", entry->d_name);
            struct stat st;
            if (stat(path, &st) != 0) continue;

            char buf[256];
            snprintf(buf, sizeof(buf), "%s{\"name\":\"%.64s\",\"size\":%ld}",
                     first ? "" : ",", entry->d_name, st.st_size);
            serial_write(buf);
            first = false;
        }
        closedir(dir);
    }

    serial_write("]}\n");
}
