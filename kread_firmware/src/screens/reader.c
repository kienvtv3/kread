/**
 * reader.c - Book reader screen
 *
 * Displays current book page fullscreen. Pages are landscape-packed KP bitmaps
 * loaded from .kb file via kb_reader API.
 *
 * Help bar: ▲Prev ▼Next ●Menu ◀Home
 */

#include "reader.h"
#include "books.h"
#include "ui_assets.h"
#include "kp_decode.h"
#include "kb_reader.h"
#include "blit.h"
#include <x4/display.h>
#include <string.h>
#include <stdlib.h>
#include "esp_log.h"

static const char *TAG = "reader";

#define fb_bw ui_fb_bw
#define fb_gs ui_fb_gs

/* Page KP data buffer — allocated on enter, freed on exit */
#define PAGE_BUF_SIZE (128 * 1024)
static uint8_t *page_buf = NULL;

/* Tracks whether we need a re-render on enter */
static bool needs_render;

/* ─── Helpers ────────────────────────────────────────────────────────── */

static void blit_asset(int asset_id, int x, int y)
{
    if (!ui_lang) return;
    const ui_asset_t *a = &ui_lang[asset_id];
    kp_blit(a->data, a->size, fb_bw, fb_gs, x, y);
}

static void render_page(void)
{
    if (book_count == 0) return;

    book_info_t *b = &books[current_book];

    if (!kb_open(b->path)) {
        ESP_LOGE(TAG, "cannot open: %s", b->path);
        return;
    }

    uint16_t page = b->current_page;
    const kb_page_entry_t *pe = kb_get_page_entry(page);
    if (!pe || pe->size == 0) {
        ESP_LOGW(TAG, "page %u not found", page);
        kb_close();
        return;
    }

    /* Allocate page buffer if needed */
    if (!page_buf) {
        page_buf = malloc(PAGE_BUF_SIZE);
        if (!page_buf) {
            ESP_LOGE(TAG, "malloc page_buf failed");
            kb_close();
            return;
        }
    }

    uint32_t bytes = kb_load_page(page, page_buf, PAGE_BUF_SIZE);
    kb_close();

    if (bytes == 0) {
        ESP_LOGW(TAG, "page %u load failed", page);
        return;
    }

    /* Decode KP and blit. Pages are landscape-packed. */
    const uint8_t *bw_plane, *gs_plane;
    uint16_t pw, ph;
    if (kp_decode(page_buf, bytes, &bw_plane, &gs_plane, &pw, &ph)) {
        /* Landscape-packed page: blit directly */
        blit_landscape(fb_bw, fb_gs, 0, 0,
                       bw_plane, gs_plane, pw, ph);
    } else {
        ESP_LOGW(TAG, "page %u decode failed", page);
    }

    /* Update progress */
    if (b->page_count > 0) {
        b->progress = (uint8_t)(((uint32_t)(page + 1) * 100) / b->page_count);
        if (b->progress > 100) b->progress = 100;
    }
}

/* ─── Screen lifecycle ───────────────────────────────────────────────── */

void reader_enter(void)
{
    ESP_LOGI(TAG, "enter (book=%d page=%u)",
             current_book,
             book_count > 0 ? books[current_book].current_page : 0);
    needs_render = true;
}

ui_state_t reader_update(x4_input_event_t *evt)
{
    if (evt->type != X4_EVT_PRESS) return STATE_BOOK;

    book_info_t *b = (book_count > 0) ? &books[current_book] : NULL;

    switch (evt->button) {
        case X4_BTN_DOWN:
            /* Next page */
            if (b && b->current_page + 1 < b->page_count) {
                b->current_page++;
                reader_render();
            }
            return STATE_BOOK;

        case X4_BTN_UP:
            /* Previous page */
            if (b && b->current_page > 0) {
                b->current_page--;
                reader_render();
            }
            return STATE_BOOK;

        case X4_BTN_CONFIRM:
            return STATE_BOOK_MENU;

        case X4_BTN_BACK:
            return STATE_HOME;

        default:
            return STATE_BOOK;
    }
}

void reader_render(void)
{
    ESP_LOGI(TAG, "render (book=%d page=%u)",
             current_book,
             book_count > 0 ? books[current_book].current_page : 0);

    /* Clear to white */
    memset(fb_bw, 0xFF, X4_DISPLAY_FB_SIZE);
    memset(fb_gs, 0xFF, X4_DISPLAY_FB_SIZE);

    if (book_count > 0) {
        render_page();
    } else {
        /* No book — show empty state */
        blit_asset(ASSET_EMPTY_NO_BOOK,
                   (480 - ui_lang[ASSET_EMPTY_NO_BOOK].w) / 2,
                   (800 - ui_lang[ASSET_EMPTY_NO_BOOK].h) / 2 - 15);
        blit_asset(ASSET_EMPTY_NO_BOOK_SUB,
                   (480 - ui_lang[ASSET_EMPTY_NO_BOOK_SUB].w) / 2,
                   (800 - ui_lang[ASSET_EMPTY_NO_BOOK_SUB].h) / 2 + 15);
    }

    /* Push to display */
    x4_display_render_grayscale(fb_bw, fb_gs, X4_REFRESH_FULL);
}

void reader_exit(void)
{
    ESP_LOGI(TAG, "exit");

    /* Free page buffer to reclaim heap */
    if (page_buf) {
        free(page_buf);
        page_buf = NULL;
    }
}
