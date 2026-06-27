/**
 * book_menu.c - Book options menu
 *
 * Shows options for the current book: chapters, font, font size,
 * refresh interval, flip direction.
 *
 * Help bar: ▲Up ▼Down ●Enter ◀Back
 */

#include "book_menu.h"
#include "books.h"
#include "ui_assets.h"
#include "kp_decode.h"
#include "blit.h"
#include <x4/display.h>
#include <string.h>
#include "esp_log.h"

static const char *TAG = "book_menu";

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

/* Book menu items */
typedef struct {
    int label_asset;
    int value_asset;    /* -1 if no inline value */
} book_menu_item_t;

static const book_menu_item_t menu_items[] = {
    { ASSET_LABEL_CHAPTERS,       -1 },
    { ASSET_LABEL_FONT_SIZE,      ASSET_VAL_FONT_12PT },
    { ASSET_LABEL_REFRESH_EVERY,  ASSET_VAL_PAGES_5 },
    { ASSET_LABEL_FLIP_DIRECTION, ASSET_VAL_FLIP_DOWN },
    { ASSET_LABEL_TEXT_MODE,      ASSET_VAL_GRAYSCALE },
    { ASSET_LABEL_IMAGE_MODE,     ASSET_VAL_GRAYSCALE },
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

void book_menu_enter(void)
{
    ESP_LOGI(TAG, "enter");
    selected = 0;
}

ui_state_t book_menu_update(x4_input_event_t *evt)
{
    if (evt->type != X4_EVT_PRESS) return STATE_BOOK_MENU;

    switch (evt->button) {
        case X4_BTN_UP:
            if (selected > 0) {
                selected--;
                book_menu_render();
            }
            return STATE_BOOK_MENU;

        case X4_BTN_DOWN:
            if (selected < (int)MENU_COUNT - 1) {
                selected++;
                book_menu_render();
            }
            return STATE_BOOK_MENU;

        case X4_BTN_CONFIRM:
            if (menu_items[selected].label_asset == ASSET_LABEL_CHAPTERS)
                return STATE_BOOK_CHAPTERS;
            /* For value items: MVP just re-render */
            book_menu_render();
            return STATE_BOOK_MENU;

        case X4_BTN_BACK:
            return STATE_BOOK;

        default:
            return STATE_BOOK_MENU;
    }
}

void book_menu_render(void)
{
    ESP_LOGI(TAG, "render (sel=%d)", selected);

    /* Clear to white */
    memset(fb_bw, 0xFF, X4_DISPLAY_FB_SIZE);
    memset(fb_gs, 0xFF, X4_DISPLAY_FB_SIZE);

    /* Header */
    blit_asset(ASSET_HDR_BOOK, SAFE_X, HDR_Y);

    /* Divider under header */
    blit_hline(fb_bw, SAFE_X, HDR_Y + 40, SCREEN_W - SAFE_X * 2, 0);
    blit_hline(fb_gs, SAFE_X, HDR_Y + 40, SCREEN_W - SAFE_X * 2, 0);

    /* Menu items */
    for (int i = 0; i < (int)MENU_COUNT; i++) {
        int y = LIST_Y + i * ITEM_H;
        bool is_selected = (i == selected);

        if (is_selected) {
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
        ASSET_HELP_ENTER, ASSET_HELP_BACK
    };
    for (int i = 0; i < 4; i++) {
        blit_asset(help_ids[i], SAFE_X + i * 116, HELP_Y);
    }

    /* Push to display */
    x4_display_render_grayscale(fb_bw, fb_gs, X4_REFRESH_FULL);
}

void book_menu_exit(void)
{
    ESP_LOGI(TAG, "exit");
}
