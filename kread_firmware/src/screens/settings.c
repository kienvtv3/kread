/**
 * settings.c - Settings screen
 *
 * Shows a list of settings options with pre-rendered label assets.
 * Each item has a label and a current value indicator.
 * MVP: static display of labels, no value changes yet.
 *
 * Help bar: ▲Up ▼Down ●Enter ◀Home
 */

#include "settings.h"
#include "ui_assets.h"
#include "kp_decode.h"
#include "blit.h"
#include <x4/display.h>
#include <string.h>
#include "esp_log.h"

static const char *TAG = "settings";

#define fb_bw ui_fb_bw
#define fb_gs ui_fb_gs

#define SCREEN_W    480
#define SCREEN_H    800
#define SAFE_X      8

/* Layout */
#define HDR_Y       18
#define LIST_Y      68
#define ITEM_H      48
#define LABEL_X     28
#define VALUE_X     300
#define SEL_PAD     4
#define HELP_Y      752

/* Settings menu items */
typedef struct {
    int label_asset;
    int value_asset;    /* current value display, or NAV_NONE */
} settings_item_t;

static const settings_item_t menu_items[] = {
    { ASSET_LABEL_SLEEP_TIMEOUT, ASSET_VAL_TIME_5M },
    { ASSET_LABEL_SLEEP_IMAGE,   ASSET_VAL_BOOK_COVER },
    { ASSET_LABEL_LANGUAGE,      ASSET_VAL_LANG_EN },
    { ASSET_LABEL_DEVICE_INFO,   -1 },
    { ASSET_LABEL_FIRMWARE,      -1 },
};
#define MENU_COUNT (sizeof(menu_items) / sizeof(menu_items[0]))

static int selected = 0;

/* ─── Helpers ────────────────────────────────────────────────────────── */

static void blit_asset(int asset_id, int x, int y)
{
    if (!ui_lang) return;
    const ui_asset_t *a = &ui_lang[asset_id];
    kp_blit(a->data, a->size, fb_bw, fb_gs, x, y);
}

static void blit_asset_inverted(int asset_id, int x, int y)
{
    if (!ui_lang) return;
    const ui_asset_t *a = &ui_lang[asset_id];
    const uint8_t *bw_plane, *gs_plane;
    uint16_t w, h;
    if (!kp_decode(a->data, a->size, &bw_plane, &gs_plane, &w, &h)) return;

    blit_bw_inverted(fb_bw, x, y, bw_plane, w, h);
    if (gs_plane)
        blit_bw_inverted(fb_gs, x, y, gs_plane, w, h);
    else
        blit_bw_inverted(fb_gs, x, y, bw_plane, w, h);
}

/* ─── Screen lifecycle ───────────────────────────────────────────────── */

void settings_enter(void)
{
    ESP_LOGI(TAG, "enter");
    selected = 0;
}

ui_state_t settings_update(x4_input_event_t *evt)
{
    if (evt->type != X4_EVT_PRESS) return STATE_SETTINGS;

    switch (evt->button) {
        case X4_BTN_UP:
            if (selected > 0) {
                selected--;
                settings_render();
            }
            return STATE_SETTINGS;

        case X4_BTN_DOWN:
            if (selected < (int)MENU_COUNT - 1) {
                selected++;
                settings_render();
            }
            return STATE_SETTINGS;

        case X4_BTN_CONFIRM:
            /* Sub-screens for device info / firmware */
            if (menu_items[selected].label_asset == ASSET_LABEL_DEVICE_INFO)
                return STATE_SETTINGS_DEVICE;
            if (menu_items[selected].label_asset == ASSET_LABEL_FIRMWARE)
                return STATE_SETTINGS_FIRMWARE;
            /* For value items, would toggle — MVP: just re-render */
            settings_render();
            return STATE_SETTINGS;

        case X4_BTN_BACK:
            return STATE_HOME;

        default:
            return STATE_SETTINGS;
    }
}

void settings_render(void)
{
    ESP_LOGI(TAG, "render (sel=%d)", selected);

    /* Clear to white */
    memset(fb_bw, 0xFF, X4_DISPLAY_FB_SIZE);
    memset(fb_gs, 0xFF, X4_DISPLAY_FB_SIZE);

    /* Header */
    blit_asset(ASSET_HDR_SETTINGS, SAFE_X, HDR_Y);

    /* Divider under header */
    blit_hline(fb_bw, SAFE_X, HDR_Y + 40, SCREEN_W - SAFE_X * 2, 0);
    blit_hline(fb_gs, SAFE_X, HDR_Y + 40, SCREEN_W - SAFE_X * 2, 0);

    /* Menu items */
    for (int i = 0; i < (int)MENU_COUNT; i++) {
        int y = LIST_Y + i * ITEM_H;
        bool is_selected = (i == selected);

        if (is_selected) {
            /* Selection bar */
            blit_fill_rect(fb_bw, SAFE_X, y, SCREEN_W - SAFE_X * 2, ITEM_H - 4, 0);
            blit_fill_rect(fb_gs, SAFE_X, y, SCREEN_W - SAFE_X * 2, ITEM_H - 4, 0);
        }

        /* Label */
        if (is_selected) {
            blit_asset_inverted(menu_items[i].label_asset, LABEL_X, y + SEL_PAD);
        } else {
            blit_asset(menu_items[i].label_asset, LABEL_X, y + SEL_PAD);
        }

        /* Value (if any) */
        if (menu_items[i].value_asset >= 0) {
            if (is_selected) {
                blit_asset_inverted(menu_items[i].value_asset, VALUE_X, y + SEL_PAD);
            } else {
                blit_asset(menu_items[i].value_asset, VALUE_X, y + SEL_PAD);
            }
        }
    }

    /* Help bar */
    blit_hline(fb_bw, SAFE_X, 751, SCREEN_W - SAFE_X * 2, 0);
    blit_hline(fb_gs, SAFE_X, 751, SCREEN_W - SAFE_X * 2, 0);

    static const int help_ids[] = {
        ASSET_HELP_PAGE, ASSET_HELP_PAGE,
        ASSET_HELP_ENTER, ASSET_HELP_HOME
    };
    for (int i = 0; i < 4; i++) {
        blit_asset(help_ids[i], SAFE_X + i * 116, HELP_Y);
    }

    /* Push to display */
    x4_display_render_grayscale(fb_bw, fb_gs, X4_REFRESH_FULL);
}

void settings_exit(void)
{
    ESP_LOGI(TAG, "exit");
}
