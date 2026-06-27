#include <x4/display.h>
#include <string.h>
#include <stdlib.h>
#include "driver/spi_master.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_memory_utils.h"

static const char *TAG = "x4.display";

// ================================================================
// Hardware constants
// ================================================================

#define PIN_CS    21
#define PIN_DC    4
#define PIN_RST   5
#define PIN_BUSY  6

#define CMD_SOFT_RESET          0x12
#define CMD_BOOSTER_SOFT_START  0x0C
#define CMD_DRIVER_OUTPUT       0x01
#define CMD_BORDER_WAVEFORM     0x3C
#define CMD_TEMP_SENSOR         0x18
#define CMD_DATA_ENTRY_MODE     0x11
#define CMD_SET_RAM_X_RANGE     0x44
#define CMD_SET_RAM_Y_RANGE     0x45
#define CMD_SET_RAM_X_COUNTER   0x4E
#define CMD_SET_RAM_Y_COUNTER   0x4F
#define CMD_WRITE_RAM_BW        0x24
#define CMD_WRITE_RAM_RED       0x26
#define CMD_AUTO_WRITE_BW_RAM   0x46
#define CMD_AUTO_WRITE_RED_RAM  0x47
#define CMD_UPDATE_CTRL1        0x21
#define CMD_UPDATE_CTRL2        0x22
#define CMD_MASTER_ACTIVATION   0x20
#define CMD_WRITE_LUT           0x32
#define CMD_GATE_VOLTAGE        0x03
#define CMD_SOURCE_VOLTAGE      0x04
#define CMD_WRITE_VCOM          0x2C
#define CMD_WRITE_TEMP          0x1A
#define CMD_DEEP_SLEEP          0x10

// CTRL1 register
#define CTRL1_NORMAL      0x00
#define CTRL1_BYPASS_RED  0x40

// CTRL2 register bits
#define CTRL2_CLOCK_ON      0x80
#define CTRL2_ANALOG_ON     0x40
#define CTRL2_TEMP_LOAD     0x10
#define CTRL2_MODE_SELECT   0x08
#define CTRL2_DISPLAY_START 0x04
#define CTRL2_ANALOG_OFF    0x02
#define CTRL2_CLOCK_OFF     0x01

// ================================================================
// Grayscale LUT
// ================================================================

// Custom LUT for grayscale overlay on B&W content.
// Gray pixels start WHITE, VSH1 darkens them.
//   L0 (BW=0, RED=0): no waveform → black stays black
//   SSD1677 LUT row = (RED << 1) | BW
//   L1 (BW=1, RED=0): VSH1 × 6  → less darkening → light gray
//   L2 (BW=0, RED=1): VSH1 × 12 → more darkening → dark gray
//   L3 (BW=1, RED=1): no waveform → white stays white
static const uint8_t lut_grayscale[] = {
    // VS patterns (5 groups × 10 bytes)
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // L0: black stays black
    0x55, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // L1: VSH1 × 6 → light gray
    0x55, 0x55, 0x55, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // L2: VSH1 × 12 → dark gray
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // L3
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // L4 VCOM
    // TP/RP (10 groups × 5 bytes)
    0x01, 0x01, 0x01, 0x01, 0x00,
    0x01, 0x01, 0x01, 0x01, 0x00,
    0x01, 0x01, 0x01, 0x01, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00,
    // Frame rate + Voltages (VGH, VSH1, VSH2, VSL, VCOM) + Reserved
    0x8F, 0x8F, 0x8F, 0x8F, 0x8F,
    0x17, 0x41, 0xA8, 0x32, 0x30,
    0x00, 0x00
};

_Static_assert(sizeof(lut_grayscale) >= 110, "LUT must be at least 110 bytes");

// ================================================================
// Internal state
// ================================================================

extern spi_device_handle_t x4_spi_display_dev;

// Single shared framebuffer — screens render into this, reused for each plane.
// Must be in DRAM for SPI DMA.
uint8_t x4_framebuffer[X4_DISPLAY_FB_SIZE];

static bool is_screen_on = false;
static bool custom_lut_active = false;

// Legacy compat — point both to the single framebuffer
void x4_display_get_framebuffers(uint8_t **msb, uint8_t **lsb) {
    *msb = x4_framebuffer;
    *lsb = x4_framebuffer;
}

// ================================================================
// Low-level SPI
// ================================================================

static void send_command(uint8_t cmd)
{
    gpio_set_level(PIN_DC, 0);
    gpio_set_level(PIN_CS, 0);
    spi_transaction_t t = { .length = 8, .tx_buffer = &cmd };
    spi_device_transmit(x4_spi_display_dev, &t);
    gpio_set_level(PIN_CS, 1);
}

static void send_data_byte(uint8_t val)
{
    gpio_set_level(PIN_DC, 1);
    gpio_set_level(PIN_CS, 0);
    spi_transaction_t t = { .length = 8, .tx_buffer = &val };
    spi_device_transmit(x4_spi_display_dev, &t);
    gpio_set_level(PIN_CS, 1);
}

static void send_data(const uint8_t *data, size_t len)
{
    gpio_set_level(PIN_DC, 1);
    gpio_set_level(PIN_CS, 0);
    while (len > 0) {
        size_t chunk = (len > 4096) ? 4096 : len;
        spi_transaction_t t = { .length = chunk * 8, .tx_buffer = data };
        spi_device_transmit(x4_spi_display_dev, &t);
        data += chunk;
        len -= chunk;
    }
    gpio_set_level(PIN_CS, 1);
}

static void wait_busy(const char *comment)
{
    uint32_t start = xTaskGetTickCount() * portTICK_PERIOD_MS;
    while (gpio_get_level(PIN_BUSY) == 1) {
        vTaskDelay(pdMS_TO_TICKS(1));
        uint32_t elapsed = xTaskGetTickCount() * portTICK_PERIOD_MS - start;
        if (elapsed > 10000) {
            ESP_LOGE(TAG, "BUSY timeout: %s", comment ? comment : "");
            break;
        }
    }
}

// ================================================================
// RAM area
// ================================================================

// Reset SSD1677 address counter to full screen.
// x=0, y=0, w=800, h=480. Y is flipped (479→0) for top-down scan.
static void set_full_ram(void)
{
    send_command(CMD_DATA_ENTRY_MODE); send_data_byte(0x01);

    // X range: 0 to 799
    send_command(CMD_SET_RAM_X_RANGE);
    send_data_byte(0x00); send_data_byte(0x00);
    send_data_byte((X4_DISPLAY_WIDTH - 1) & 0xFF);
    send_data_byte((X4_DISPLAY_WIDTH - 1) >> 8);

    // Y range: 479 down to 0
    send_command(CMD_SET_RAM_Y_RANGE);
    send_data_byte((X4_DISPLAY_HEIGHT - 1) & 0xFF);
    send_data_byte((X4_DISPLAY_HEIGHT - 1) >> 8);
    send_data_byte(0x00); send_data_byte(0x00);

    // Counter starts at (0, 479)
    send_command(CMD_SET_RAM_X_COUNTER);
    send_data_byte(0x00); send_data_byte(0x00);

    send_command(CMD_SET_RAM_Y_COUNTER);
    send_data_byte((X4_DISPLAY_HEIGHT - 1) & 0xFF);
    send_data_byte((X4_DISPLAY_HEIGHT - 1) >> 8);
}

static void write_ram(uint8_t cmd, const uint8_t *data, uint32_t size)
{
    send_command(cmd);
    send_data(data, size);
}

// Write data to SSD1677 RAM. If source not DMA-capable, copy through x4_framebuffer.
static void write_ram_safe(uint8_t cmd, const uint8_t *data)
{
    if (!esp_ptr_dma_capable(data)) {
        memcpy(x4_framebuffer, data, X4_DISPLAY_FB_SIZE);
        data = x4_framebuffer;
    }
    set_full_ram();
    write_ram(cmd, data, X4_DISPLAY_FB_SIZE);
}

// ================================================================
// LUT management
// ================================================================

static void load_custom_lut(const uint8_t *lut)
{
    send_command(CMD_WRITE_LUT);
    for (int i = 0; i < 105; i++) send_data_byte(lut[i]);

    send_command(CMD_GATE_VOLTAGE);  send_data_byte(lut[105]);
    send_command(CMD_SOURCE_VOLTAGE);
    send_data_byte(lut[106]); send_data_byte(lut[107]); send_data_byte(lut[108]);
    send_command(CMD_WRITE_VCOM);    send_data_byte(lut[109]);

    custom_lut_active = true;
}

static void clear_custom_lut(void)
{
    custom_lut_active = false;
}

// ================================================================
// Refresh
// ================================================================

typedef enum { REFRESH_HALF, REFRESH_FAST } refresh_mode_t;

static void do_refresh(refresh_mode_t mode, bool turn_off)
{
    send_command(CMD_UPDATE_CTRL1);
    send_data_byte((mode == REFRESH_FAST) ? CTRL1_NORMAL : CTRL1_BYPASS_RED);

    uint8_t ctrl2 = 0x00;

    if (!is_screen_on) {
        is_screen_on = true;
        ctrl2 |= CTRL2_CLOCK_ON | CTRL2_ANALOG_ON;
    }

    if (turn_off) {
        is_screen_on = false;
        ctrl2 |= CTRL2_ANALOG_OFF | CTRL2_CLOCK_OFF;
    }

    if (mode == REFRESH_HALF) {
        send_command(CMD_WRITE_TEMP);
        send_data_byte(0x5A);
        // HALF: power on + temp load + display start (no MODE_SELECT)
        ctrl2 |= CTRL2_CLOCK_ON | CTRL2_ANALOG_ON
               | CTRL2_TEMP_LOAD | CTRL2_DISPLAY_START;
    } else if (custom_lut_active) {
        // Custom LUT: only need DISPLAY_START (skip TEMP_LOAD + MODE_SELECT)
        ctrl2 |= CTRL2_CLOCK_ON | CTRL2_ANALOG_ON | CTRL2_DISPLAY_START;
    } else {
        ctrl2 |= CTRL2_TEMP_LOAD | CTRL2_MODE_SELECT | CTRL2_DISPLAY_START;
    }

    send_command(CMD_UPDATE_CTRL2);
    send_data_byte(ctrl2);
    send_command(CMD_MASTER_ACTIVATION);
    wait_busy((mode == REFRESH_HALF) ? "half" : "fast");
}

// ================================================================
// Controller init
// ================================================================

static void init_controller(void)
{
    send_command(CMD_SOFT_RESET);
    wait_busy("reset");

    send_command(CMD_TEMP_SENSOR); send_data_byte(0x80);

    send_command(CMD_BOOSTER_SOFT_START);
    send_data_byte(0xAE); send_data_byte(0xC7);
    send_data_byte(0xC3); send_data_byte(0xC0); send_data_byte(0x40);

    send_command(CMD_DRIVER_OUTPUT);
    send_data_byte((X4_DISPLAY_HEIGHT - 1) % 256);
    send_data_byte((X4_DISPLAY_HEIGHT - 1) / 256);
    send_data_byte(0x02);

    send_command(CMD_BORDER_WAVEFORM); send_data_byte(0x01);

    set_full_ram();

    send_command(CMD_AUTO_WRITE_BW_RAM);  send_data_byte(0xF7); wait_busy("clear_bw");
    send_command(CMD_AUTO_WRITE_RED_RAM); send_data_byte(0xF7); wait_busy("clear_red");
}

// ================================================================
// Public API: init
// ================================================================

void x4_display_init(void)
{
    ESP_LOGI(TAG, "Display init");

    is_screen_on = false;
    custom_lut_active = false;

    // Init framebuffer to white
    memset(x4_framebuffer, 0xFF, X4_DISPLAY_FB_SIZE);

    // GPIO
    gpio_config_t out_conf = {
        .pin_bit_mask = (1ULL << PIN_DC) | (1ULL << PIN_RST),
        .mode = GPIO_MODE_OUTPUT,
    };
    gpio_config(&out_conf);

    gpio_config_t in_conf = {
        .pin_bit_mask = (1ULL << PIN_BUSY),
        .mode = GPIO_MODE_INPUT,
    };
    gpio_config(&in_conf);

    gpio_set_level(PIN_CS, 1);
    gpio_set_level(PIN_DC, 1);

    // Hardware reset
    gpio_set_level(PIN_RST, 1); vTaskDelay(pdMS_TO_TICKS(20));
    gpio_set_level(PIN_RST, 0); vTaskDelay(pdMS_TO_TICKS(2));
    gpio_set_level(PIN_RST, 1); vTaskDelay(pdMS_TO_TICKS(20));

    init_controller();
    ESP_LOGI(TAG, "Display ready (%dx%d)", X4_DISPLAY_WIDTH, X4_DISPLAY_HEIGHT);
}

// ================================================================
// Public API: low-level RAM write (new single-buffer API)
// ================================================================

void x4_display_write_bw_ram(void)
{
    set_full_ram();
    write_ram(CMD_WRITE_RAM_BW, x4_framebuffer, X4_DISPLAY_FB_SIZE);
}

void x4_display_write_red_ram(void)
{
    set_full_ram();
    write_ram(CMD_WRITE_RAM_RED, x4_framebuffer, X4_DISPLAY_FB_SIZE);
}

void x4_display_refresh_grayscale(x4_refresh_t refresh)
{
    (void)refresh;  // always FAST for grayscale overlay step

    if (!is_screen_on) {
        // Need to turn on first
        is_screen_on = true;
    }

    // Grayscale overlay: BW RAM and RED RAM must already contain target MSB/LSB.
    // Caller is responsible for doing the BW base refresh (step 1) before this.
    load_custom_lut(lut_grayscale);
    do_refresh(REFRESH_FAST, false);
    clear_custom_lut();
}

void x4_display_refresh_bw(x4_refresh_t refresh)
{
    refresh_mode_t mode = (refresh == X4_REFRESH_FULL) ? REFRESH_HALF : REFRESH_FAST;
    if (!is_screen_on && mode == REFRESH_FAST) mode = REFRESH_HALF;

    do_refresh(mode, false);
    is_screen_on = true;
}

// ================================================================
// Public API: render B&W (legacy)
// ================================================================

void x4_display_render_bw(const uint8_t *msb, x4_refresh_t refresh)
{
    if (!msb) { ESP_LOGE(TAG, "render_bw: NULL"); return; }

    refresh_mode_t mode = (refresh == X4_REFRESH_FULL) ? REFRESH_HALF : REFRESH_FAST;
    if (!is_screen_on && mode == REFRESH_FAST) mode = REFRESH_HALF;

    write_ram_safe(CMD_WRITE_RAM_BW, msb);
    if (mode == REFRESH_HALF) {
        write_ram_safe(CMD_WRITE_RAM_RED, msb);
    }
    // FAST mode: skip RED differential (no tracking available)

    do_refresh(mode, false);
}

// ================================================================
// Public API: render grayscale (4-level)
// ================================================================
//
// Inlined B&W step (not calling render_bw) to avoid scratch aliasing.
// Uses scratch for all temp computation, never corrupts tracking buffers.
//   Step 1: BW base refresh (target_bw = msb | lsb)
//   Step 2: Grayscale overlay (custom LUT)

void x4_display_render_grayscale(const uint8_t *msb, const uint8_t *lsb,
                                  x4_refresh_t refresh)
{
    if (!msb || !lsb) { ESP_LOGE(TAG, "render_grayscale: NULL"); return; }

    refresh_mode_t mode = (refresh == X4_REFRESH_FULL) ? REFRESH_HALF : REFRESH_FAST;
    if (!is_screen_on && mode == REFRESH_FAST) mode = REFRESH_HALF;

    // Step 1: BW base refresh
    // BW RAM = target_bw = msb | lsb (all non-white → black)
    {
        const uint32_t n4 = X4_DISPLAY_FB_SIZE / 4;
        uint32_t *dst = (uint32_t *)x4_framebuffer;
        const uint32_t *m = (const uint32_t *)msb;
        const uint32_t *l = (const uint32_t *)lsb;
        for (uint32_t i = 0; i < n4; i++) dst[i] = m[i] | l[i];
    }
    set_full_ram();
    write_ram(CMD_WRITE_RAM_BW, x4_framebuffer, X4_DISPLAY_FB_SIZE);

    // HALF mode: RED = same as BW
    if (mode == REFRESH_HALF) {
        set_full_ram();
        write_ram(CMD_WRITE_RAM_RED, x4_framebuffer, X4_DISPLAY_FB_SIZE);
    }
    // FAST mode: skip RED differential (no tracking buffer available)
    // TODO: implement FAST with RED RAM readback or chunked tracking

    do_refresh(mode, false);

    // Step 2: Grayscale overlay — BW=msb, RED=lsb
    write_ram_safe(CMD_WRITE_RAM_BW, msb);
    write_ram_safe(CMD_WRITE_RAM_RED, lsb);

    load_custom_lut(lut_grayscale);
    do_refresh(REFRESH_FAST, false);
    clear_custom_lut();
}

// ================================================================
// Public API: sleep
// ================================================================

void x4_display_sleep(void)
{
    if (is_screen_on) {
        send_command(CMD_UPDATE_CTRL1);
        send_data_byte(CTRL1_BYPASS_RED);
        send_command(CMD_UPDATE_CTRL2);
        send_data_byte(CTRL2_ANALOG_OFF | CTRL2_CLOCK_OFF);
        send_command(CMD_MASTER_ACTIVATION);
        wait_busy("power_down");
        is_screen_on = false;
    }

    send_command(CMD_DEEP_SLEEP);
    send_data_byte(0x01);
    ESP_LOGI(TAG, "Display in deep sleep");
}
