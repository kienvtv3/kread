/**
 * Display SDK v2 — mode switching test
 *
 * UP:      white (B&W)
 * DOWN:    white (grayscale)
 * BACK:    grayscale quadrant (reset rot=0)
 * CONFIRM: grayscale quadrant rotate CW
 * LEFT:    grayscale quadrant rotate CW (FULL refresh)
 * RIGHT:   B&W 1/2 toggle normal↔inverted
 */
#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

#include "serial.h"
#include <x4/x4.h>

static const char *TAG = "test";

extern const uint8_t _binary_test_page1_bw_bin_start[] asm("_binary_test_page1_bw_bin_start");
extern const uint8_t _binary_test_page1_gs_bin_start[] asm("_binary_test_page1_gs_bin_start");
extern const uint8_t _binary_test_page2_bw_bin_start[] asm("_binary_test_page2_bw_bin_start");
extern const uint8_t _binary_test_page2_gs_bin_start[] asm("_binary_test_page2_gs_bin_start");

#define FB_SIZE X4_DISPLAY_FB_SIZE

static uint8_t white_frame[FB_SIZE];
static uint8_t bw_buf[FB_SIZE];
static uint8_t gs_buf[FB_SIZE];

// Invert a full framebuffer
static void invert_fb(uint8_t *dst, const uint8_t *src)
{
    for (uint32_t i = 0; i < FB_SIZE; i++) dst[i] = ~src[i];
}

// Rotate quadrant: swap the 4 quarters of bw and gs planes
// Rotation 0: original, 1: 90° CW, 2: 180°, 3: 270°
static int quad_rotation = 0;
static bool right_toggle = false;  // alternates normal↔inverted B&W page

// The quadrant page has 4 quarters (landscape 800×480):
// In native layout: left half = rows 0-239, right half = rows 240-479
//                   top half = cols 0-399, bottom half = cols 400-799
// Each quarter = 240 rows × 400 cols = 240 × 50 bytes
//
// To rotate, we swap which source quarter maps to which destination quarter.
// Quarter indices (portrait view):
//   0=top-left, 1=top-right, 2=bottom-right, 3=bottom-left
// CW rotation: 0→1→2→3→0

static void build_rotated_quadrant(uint8_t *out_bw, uint8_t *out_gs, int rotation)
{
    // For simplicity, use byte-level quarter swapping in native landscape:
    // Top-half rows [0, 240) and bottom-half rows [240, 480)
    // Left-half cols bytes [0, 50) and right-half cols bytes [50, 100)
    //
    // Native quarters:
    //   Q0 = top-left:     rows [0,240) × bytes [0,50)
    //   Q1 = top-right:    rows [0,240) × bytes [50,100)
    //   Q2 = bottom-left:  rows [240,480) × bytes [0,50)
    //   Q3 = bottom-right: rows [240,480) × bytes [50,100)
    //
    // Portrait mapping (screen held portrait):
    //   Portrait top-left     = native Q1 (top-right in landscape)
    //   Portrait top-right    = native Q3
    //   Portrait bottom-left  = native Q0
    //   Portrait bottom-right = native Q2
    //
    // CW rotation in portrait: TL→TR→BR→BL→TL
    // = native: Q1→Q3→Q2→Q0→Q1

    const uint8_t *src_bw = _binary_test_page2_bw_bin_start;
    const uint8_t *src_gs = _binary_test_page2_gs_bin_start;

    // Map: which source native quarter goes to which dest native quarter
    // rotation=0: identity
    // rotation=1 (CW in portrait): TL←BL, TR←TL, BR←TR, BL←BR
    //   = native: Q1←Q0, Q3←Q1, Q2←Q3, Q0←Q2
    // Dest native Q0 ← src native Q[map[0]], etc.
    static const int maps[4][4] = {
        {0, 1, 2, 3},  // rot 0: identity
        {2, 0, 3, 1},  // rot 1: CW
        {3, 2, 1, 0},  // rot 2: 180°
        {1, 3, 0, 2},  // rot 3: CCW
    };
    const int *map = maps[rotation % 4];

    memset(out_bw, 0xFF, FB_SIZE);  // white default
    memset(out_gs, 0xFF, FB_SIZE);

    for (int q = 0; q < 4; q++) {
        int sq = map[q];
        int dst_row0 = (q < 2) ? 0 : 240;
        int dst_col0 = (q % 2 == 0) ? 0 : 50;
        int src_row0 = (sq < 2) ? 0 : 240;
        int src_col0 = (sq % 2 == 0) ? 0 : 50;

        for (int r = 0; r < 240; r++) {
            memcpy(&out_bw[(dst_row0 + r) * 100 + dst_col0],
                   &src_bw[(src_row0 + r) * 100 + src_col0], 50);
            memcpy(&out_gs[(dst_row0 + r) * 100 + dst_col0],
                   &src_gs[(src_row0 + r) * 100 + src_col0], 50);
        }
    }
}

void app_main(void)
{
    ESP_LOGI(TAG, "Display SDK v2 — mode switching test");

    serial_init();

    x4_config_t cfg = {
        .input = X4_INPUT_CONFIG_DEFAULT,
        .sd    = X4_SD_CONFIG_DEFAULT,
    };
    x4_init(&cfg);

    memset(white_frame, 0xFF, FB_SIZE);

    ESP_LOGI(TAG, "Boot: white (B&W FULL)");
    x4_display_render_bw(white_frame, X4_REFRESH_FULL);

    ESP_LOGI(TAG, "UP=bw white, DOWN=gs white, BACK=gs quad, CONFIRM=gs quad rotate");
    ESP_LOGI(TAG, "LEFT=bw 1/2, RIGHT=bw 1/2 inverted");

    vTaskDelay(pdMS_TO_TICKS(500));
    x4_input_poll();
    x4_input_event_t d;
    while (x4_input_next_event(&d)) {}

    while (1) {
        serial_poll();
        x4_input_poll();

        x4_input_event_t evt;
        while (x4_input_next_event(&evt)) {
            if (evt.type != X4_EVT_PRESS) continue;

            switch (evt.button) {
                case X4_BTN_UP:
                    ESP_LOGI(TAG, "White (B&W FAST)");
                    x4_display_render_bw(white_frame, X4_REFRESH_FAST);
                    break;

                case X4_BTN_DOWN:
                    ESP_LOGI(TAG, "White (Grayscale FAST)");
                    x4_display_render_grayscale(white_frame, white_frame, X4_REFRESH_FAST);
                    break;

                case X4_BTN_BACK:
                    quad_rotation = 0;
                    ESP_LOGI(TAG, "Quadrant rot=0 (Grayscale FAST)");
                    x4_display_render_grayscale(
                        _binary_test_page2_bw_bin_start,
                        _binary_test_page2_gs_bin_start,
                        X4_REFRESH_FAST);
                    break;

                case X4_BTN_CONFIRM:
                    quad_rotation = (quad_rotation + 1) % 4;
                    ESP_LOGI(TAG, "Quadrant rot=%d (Grayscale FAST)", quad_rotation);
                    build_rotated_quadrant(bw_buf, gs_buf, quad_rotation);
                    x4_display_render_grayscale(bw_buf, gs_buf, X4_REFRESH_FAST);
                    break;

                case X4_BTN_LEFT:
                    quad_rotation = (quad_rotation + 1) % 4;
                    ESP_LOGI(TAG, "Quadrant rot=%d (Grayscale FULL)", quad_rotation);
                    build_rotated_quadrant(bw_buf, gs_buf, quad_rotation);
                    x4_display_render_grayscale(bw_buf, gs_buf, X4_REFRESH_FULL);
                    break;

                case X4_BTN_RIGHT:
                    right_toggle = !right_toggle;
                    ESP_LOGI(TAG, "B&W 1/2 %s (FAST)", right_toggle ? "inverted" : "normal");
                    if (right_toggle) {
                        invert_fb(bw_buf, _binary_test_page1_bw_bin_start);
                    } else {
                        memcpy(bw_buf, _binary_test_page1_bw_bin_start, FB_SIZE);
                    }
                    x4_display_render_bw(bw_buf, X4_REFRESH_FAST);
                    break;

                default:
                    break;
            }
        }

        vTaskDelay(pdMS_TO_TICKS(50));
    }
}
