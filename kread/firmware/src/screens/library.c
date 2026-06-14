/**
 * library.c - Library screen
 *
 * Shows list of books from SD card. Each entry loads its title bitmap
 * from the .kb file on demand. Selected item is highlighted with
 * inverted colors. Selecting a book sets current_book and returns home.
 *
 * Help bar: ▲Up ▼Down ●Select ◀Home
 */

#include "library.h"
#include "books.h"
#include "ui_assets.h"
#include "kp_decode.h"
#include "kb_reader.h"
#include "blit.h"
#include <x4/display.h>
#include <string.h>
#include "esp_log.h"

static const char *TAG = "library";

#define fb_bw ui_fb_bw
#define fb_gs ui_fb_gs

#define SCREEN_W    480
#define SCREEN_H    800
#define SAFE_X      8

/* Layout */
#define HDR_Y       18
#define LIST_Y      68
#define ITEM_H      48
#define ITEMS_PER_PAGE  13  /* (751 - 68) / 48 ≈ 14, use 13 for safety */
#define LIST_X      28
#define SEL_PAD     4

/* Help bar */
#define HELP_Y      752

/* Title asset buffer — one at a time for visible items */
#define TITLE_BUF_SIZE (16 * 1024)
static uint8_t title_buf[TITLE_BUF_SIZE];

static int selected = 0;
static int scroll_offset = 0;

/* ─── Helpers ────────────────────────────────────────────────────────── */

static void blit_asset(int asset_id, int x, int y)
{
    if (!ui_lang) return;
    const ui_asset_t *a = &ui_lang[asset_id];
    kp_blit(a->data, a->size, fb_bw, fb_gs, x, y);
}

/* Load and blit a book's title asset from its .kb file */
static void blit_book_title(int book_idx, int x, int y, bool inverted)
{
    if (book_idx < 0 || book_idx >= book_count) return;

    const book_info_t *b = &books[book_idx];

    if (!kb_open(b->path)) return;

    uint32_t bytes = kb_load_asset(KB_ASSET_BOOK_TITLE, 0,
                                    title_buf, TITLE_BUF_SIZE);
    kb_close();

    if (bytes == 0) return;

    const uint8_t *bw_plane, *gs_plane;
    uint16_t w, h;
    if (!kp_decode(title_buf, bytes, &bw_plane, &gs_plane, &w, &h)) return;

    if (inverted) {
        blit_bw_inverted(fb_bw, x, y, bw_plane, w, h);
        if (gs_plane)
            blit_bw_inverted(fb_gs, x, y, gs_plane, w, h);
        else
            blit_bw_inverted(fb_gs, x, y, bw_plane, w, h);
    } else {
        blit_bw(fb_bw, x, y, bw_plane, w, h);
        if (gs_plane)
            blit_bw(fb_gs, x, y, gs_plane, w, h);
        else
            blit_bw(fb_gs, x, y, bw_plane, w, h);
    }
}

/* Render page number indicator using small digit assets */
static void render_page_indicator(void)
{
    if (book_count <= ITEMS_PER_PAGE) return;

    int page = scroll_offset / ITEMS_PER_PAGE + 1;
    int total_pages = (book_count + ITEMS_PER_PAGE - 1) / ITEMS_PER_PAGE;

    /* Render "page/total" using SM_* digit assets at top-right */
    int x = SCREEN_W - SAFE_X;
    int digits[8];
    int n = 0;

    /* total */
    if (total_pages >= 10) digits[n++] = ASSET_SM_0 + total_pages / 10;
    digits[n++] = ASSET_SM_0 + total_pages % 10;

    /* slash */
    digits[n++] = ASSET_SM_SLASH;

    /* page */
    if (page >= 10) digits[n++] = ASSET_SM_0 + page / 10;
    digits[n++] = ASSET_SM_0 + page % 10;

    /* Measure total width, render right-aligned */
    int total_w = 0;
    for (int i = n - 1; i >= 0; i--) {
        const ui_asset_t *a = &ui_lang[digits[i]];
        total_w += a->w + 1;
    }

    x = SCREEN_W - SAFE_X - total_w;
    for (int i = 0; i < n; i++) {
        const ui_asset_t *a = &ui_lang[digits[i]];
        blit_asset(digits[i], x, HDR_Y + 4);
        x += a->w + 1;
    }
}

/* ─── Screen lifecycle ───────────────────────────────────────────────── */

void library_enter(void)
{
    ESP_LOGI(TAG, "enter (books=%d)", book_count);
    selected = current_book;
    scroll_offset = 0;

    /* Ensure selected item is visible */
    if (selected >= ITEMS_PER_PAGE) {
        scroll_offset = (selected / ITEMS_PER_PAGE) * ITEMS_PER_PAGE;
    }
}

ui_state_t library_update(x4_input_event_t *evt)
{
    if (evt->type != X4_EVT_PRESS) return STATE_LIBRARY;

    switch (evt->button) {
        case X4_BTN_UP:
            if (selected > 0) {
                selected--;
                if (selected < scroll_offset) {
                    scroll_offset = selected;
                }
                library_render();
            }
            return STATE_LIBRARY;

        case X4_BTN_DOWN:
            if (selected < book_count - 1) {
                selected++;
                if (selected >= scroll_offset + ITEMS_PER_PAGE) {
                    scroll_offset = selected - ITEMS_PER_PAGE + 1;
                }
                library_render();
            }
            return STATE_LIBRARY;

        case X4_BTN_CONFIRM:
            /* Select this book */
            current_book = selected;
            return STATE_HOME;

        case X4_BTN_BACK:
            return STATE_HOME;

        default:
            return STATE_LIBRARY;
    }
}

void library_render(void)
{
    ESP_LOGI(TAG, "render (books=%d, sel=%d, scroll=%d)",
             book_count, selected, scroll_offset);

    /* Clear to white */
    memset(fb_bw, 0xFF, X4_DISPLAY_FB_SIZE);
    memset(fb_gs, 0xFF, X4_DISPLAY_FB_SIZE);

    /* Header */
    blit_asset(ASSET_HDR_LIBRARY, SAFE_X, HDR_Y);

    /* Divider under header */
    blit_hline(fb_bw, SAFE_X, HDR_Y + 40, SCREEN_W - SAFE_X * 2, 0);
    blit_hline(fb_gs, SAFE_X, HDR_Y + 40, SCREEN_W - SAFE_X * 2, 0);

    if (book_count == 0) {
        /* Empty state */
        blit_asset(ASSET_EMPTY_NO_BOOKS,
                   (SCREEN_W - ui_lang[ASSET_EMPTY_NO_BOOKS].w) / 2,
                   (SCREEN_H - ui_lang[ASSET_EMPTY_NO_BOOKS].h) / 2 - 15);
        blit_asset(ASSET_EMPTY_NO_BOOKS_SUB,
                   (SCREEN_W - ui_lang[ASSET_EMPTY_NO_BOOKS_SUB].w) / 2,
                   (SCREEN_H - ui_lang[ASSET_EMPTY_NO_BOOKS_SUB].h) / 2 + 15);
    } else {
        /* Page indicator */
        render_page_indicator();

        /* Book list */
        int visible = book_count - scroll_offset;
        if (visible > ITEMS_PER_PAGE) visible = ITEMS_PER_PAGE;

        for (int i = 0; i < visible; i++) {
            int book_idx = scroll_offset + i;
            int y = LIST_Y + i * ITEM_H;
            bool is_selected = (book_idx == selected);

            if (is_selected) {
                /* Draw selection bar (black background) */
                blit_fill_rect(fb_bw, SAFE_X, y, SCREEN_W - SAFE_X * 2, ITEM_H - 4, 0);
                blit_fill_rect(fb_gs, SAFE_X, y, SCREEN_W - SAFE_X * 2, ITEM_H - 4, 0);
            }

            /* Blit book title from .kb */
            blit_book_title(book_idx, LIST_X, y + SEL_PAD, is_selected);
        }
    }

    /* Help bar divider + items */
    blit_hline(fb_bw, SAFE_X, 751, SCREEN_W - SAFE_X * 2, 0);
    blit_hline(fb_gs, SAFE_X, 751, SCREEN_W - SAFE_X * 2, 0);

    static const int help_ids[] = {
        ASSET_HELP_PAGE, ASSET_HELP_PAGE,
        ASSET_HELP_SELECT, ASSET_HELP_HOME
    };
    for (int i = 0; i < 4; i++) {
        blit_asset(help_ids[i], SAFE_X + i * 116, HELP_Y);
    }

    /* Push to display */
    x4_display_render_grayscale(fb_bw, fb_gs, X4_REFRESH_FULL);
}

void library_exit(void)
{
    ESP_LOGI(TAG, "exit");
}
