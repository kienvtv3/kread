/**
 * book_chapters.c - Chapter list screen
 *
 * Shows chapters from the current book's .kb file. Each chapter name
 * is loaded as a KP bitmap asset. Selecting a chapter jumps to that
 * page in the reader.
 *
 * Help bar: ▲Up ▼Down ●Go ◀Back
 */

#include "book_chapters.h"
#include "books.h"
#include "ui_assets.h"
#include "kp_decode.h"
#include "kb_reader.h"
#include "blit.h"
#include <x4/display.h>
#include <string.h>
#include "esp_log.h"

static const char *TAG = "chapters";

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
#define SEL_PAD     4
#define HELP_Y      752
#define ITEMS_PER_PAGE  13

/* Chapter name buffer — load one at a time */
#define CHAP_BUF_SIZE (16 * 1024)
static uint8_t chap_buf[CHAP_BUF_SIZE];

static int selected = 0;
static int scroll_offset = 0;
static uint8_t chapter_count = 0;

/* ─── Helpers ────────────────────────────────────────────────────────── */

static void blit_asset(int asset_id, int x, int y)
{
    if (!ui_lang) return;
    const ui_asset_t *a = &ui_lang[asset_id];
    kp_blit(a->data, a->size, fb_bw, fb_gs, x, y);
}

/* Load and blit a chapter name asset from current book */
static void blit_chapter_name(int chapter_idx, int x, int y, bool inverted)
{
    /* Book must already be open */
    uint32_t bytes = kb_load_asset(KB_ASSET_CHAPTER_NAME, (uint8_t)chapter_idx,
                                    chap_buf, CHAP_BUF_SIZE);
    if (bytes == 0) return;

    const uint8_t *bw_plane, *gs_plane;
    uint16_t w, h;
    if (!kp_decode(chap_buf, bytes, &bw_plane, &gs_plane, &w, &h)) return;

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

/* ─── Screen lifecycle ───────────────────────────────────────────────── */

void book_chapters_enter(void)
{
    ESP_LOGI(TAG, "enter");
    selected = 0;
    scroll_offset = 0;

    /* Get chapter count from book metadata */
    if (book_count > 0) {
        chapter_count = books[current_book].chapter_count;
    } else {
        chapter_count = 0;
    }

    ESP_LOGI(TAG, "chapters=%d", chapter_count);
}

ui_state_t book_chapters_update(x4_input_event_t *evt)
{
    if (evt->type != X4_EVT_PRESS) return STATE_BOOK_CHAPTERS;

    switch (evt->button) {
        case X4_BTN_UP:
            if (selected > 0) {
                selected--;
                if (selected < scroll_offset) {
                    scroll_offset = selected;
                }
                book_chapters_render();
            }
            return STATE_BOOK_CHAPTERS;

        case X4_BTN_DOWN:
            if (selected < chapter_count - 1) {
                selected++;
                if (selected >= scroll_offset + ITEMS_PER_PAGE) {
                    scroll_offset = selected - ITEMS_PER_PAGE + 1;
                }
                book_chapters_render();
            }
            return STATE_BOOK_CHAPTERS;

        case X4_BTN_CONFIRM:
            /* Jump to chapter's start page */
            if (book_count > 0 && chapter_count > 0) {
                book_info_t *b = &books[current_book];

                if (kb_open(b->path)) {
                    uint16_t page = kb_get_chapter_page((uint8_t)selected);
                    kb_close();

                    if (page < b->page_count) {
                        b->current_page = page;
                        ESP_LOGI(TAG, "jump to chapter %d page %u", selected, page);
                        return STATE_BOOK;
                    }
                }
            }
            return STATE_BOOK_CHAPTERS;

        case X4_BTN_BACK:
            return STATE_BOOK_MENU;

        default:
            return STATE_BOOK_CHAPTERS;
    }
}

void book_chapters_render(void)
{
    ESP_LOGI(TAG, "render (chapters=%d, sel=%d)", chapter_count, selected);

    /* Clear to white */
    memset(fb_bw, 0xFF, X4_DISPLAY_FB_SIZE);
    memset(fb_gs, 0xFF, X4_DISPLAY_FB_SIZE);

    /* Header */
    blit_asset(ASSET_HDR_BOOK_CHAPTERS, SAFE_X, HDR_Y);

    /* Divider under header */
    blit_hline(fb_bw, SAFE_X, HDR_Y + 40, SCREEN_W - SAFE_X * 2, 0);
    blit_hline(fb_gs, SAFE_X, HDR_Y + 40, SCREEN_W - SAFE_X * 2, 0);

    if (chapter_count == 0 || book_count == 0) {
        /* No chapters — just show empty screen with header */
        goto help_bar;
    }

    /* Open book to load chapter name assets */
    if (!kb_open(books[current_book].path)) {
        ESP_LOGE(TAG, "cannot open book for chapters");
        goto help_bar;
    }

    /* Chapter list */
    {
        int visible = chapter_count - scroll_offset;
        if (visible > ITEMS_PER_PAGE) visible = ITEMS_PER_PAGE;

        for (int i = 0; i < visible; i++) {
            int chap_idx = scroll_offset + i;
            int y = LIST_Y + i * ITEM_H;
            bool is_selected = (chap_idx == selected);

            if (is_selected) {
                blit_fill_rect(fb_bw, SAFE_X, y, SCREEN_W - SAFE_X * 2, ITEM_H - 4, 0);
                blit_fill_rect(fb_gs, SAFE_X, y, SCREEN_W - SAFE_X * 2, ITEM_H - 4, 0);
            }

            blit_chapter_name(chap_idx, LABEL_X, y + SEL_PAD, is_selected);
        }
    }

    kb_close();

help_bar:
    /* Help bar */
    blit_hline(fb_bw, SAFE_X, 751, SCREEN_W - SAFE_X * 2, 0);
    blit_hline(fb_gs, SAFE_X, 751, SCREEN_W - SAFE_X * 2, 0);

    {
        static const int help_ids[] = {
            ASSET_HELP_PAGE, ASSET_HELP_PAGE,
            ASSET_HELP_GO, ASSET_HELP_BACK
        };
        for (int i = 0; i < 4; i++) {
            blit_asset(help_ids[i], SAFE_X + i * 116, HELP_Y);
        }
    }

    /* Push to display */
    x4_display_render_grayscale(fb_bw, fb_gs, X4_REFRESH_FULL);
}

void book_chapters_exit(void)
{
    ESP_LOGI(TAG, "exit");
}
