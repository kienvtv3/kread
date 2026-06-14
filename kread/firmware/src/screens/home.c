/**
 * home.c - Home screen for kread e-reader
 * Currently in QUADRANT TEST MODE for display driver validation.
 */

// Suppress unused warnings for home screen functions (disabled during quadrant test)
#pragma GCC diagnostic push
#pragma GCC diagnostic ignored "-Wunused-function"
#pragma GCC diagnostic ignored "-Wunused-variable"

#include "home.h"
#include "books.h"
#include "nav.h"
#include "ui_assets.h"
#include "kp_decode.h"
#include "kb_reader.h"
#include "blit.h"
#include <x4/display.h>
#include <x4/power.h>
#include <x4/sd.h>
#include <string.h>
#include <stdio.h>
#include <dirent.h>
#include <math.h>
#include "esp_log.h"

static const char *TAG = "home";

/* ─── Layout constants (portrait 480x800) ────────────────────────────── */

#define SCREEN_W         480
#define SCREEN_H         800
#define SAFE_X           8

/* Battery */
#define BATTERY_X        433
#define BATTERY_Y        18

/* Cover */
#define COVER_W          300
#define COVER_H          400
#define COVER_Y          64
#define COVER_X          ((SCREEN_W - COVER_W) / 2)  /* 90 */
#define COVER_BORDER     2

/* Arrows: centered in gaps between safe margin and cover */
#define ARROW_LEFT_CX    ((SAFE_X + COVER_X) / 2)
#define ARROW_RIGHT_CX   ((COVER_X + COVER_W + SCREEN_W - SAFE_X) / 2)
#define ARROW_CY         (COVER_Y + COVER_H / 2)

/* Title & Author (bottom-left anchored text from .kb assets) */
#define TITLE_X          28
#define TITLE_BOTTOM_Y   603
#define AUTHOR_X         28
#define AUTHOR_Y         611

/* Progress */
#define PROGRESS_LABEL_CX   240
#define PROGRESS_LABEL_BY   696
#define PROGRESS_FRAME_X    27
#define PROGRESS_FRAME_Y    700

/* Help bar divider */
#define HELP_DIVIDER_Y   751
#define HELP_DIVIDER_X1  8
#define HELP_DIVIDER_X2  472

/* ─── Memory ─────────────────────────────────────────────────────────── */

/* Dual framebuffers for grayscale rendering */
// Use shared framebuffers from ui.c (heap-allocated)
#define fb_bw ui_fb_bw
#define fb_gs ui_fb_gs

/* Book list from SD scan — shared with other screens via books.h */
book_info_t books[MAX_BOOKS];
int book_count = 0;
int current_book = 0;

/* Asset buffer for current book's KP blobs (cover_thumb + title + author) */
#define ASSET_BUF_SIZE (48 * 1024)  // cover ~30KB + title ~8KB + author ~3KB
static uint8_t asset_buf[ASSET_BUF_SIZE];

/* Current book's loaded assets: offsets into asset_buf */
static uint32_t cover_offset;
static uint32_t cover_size;
static uint32_t title_offset;
static uint32_t title_size;
static uint32_t author_offset;
static uint32_t author_size;

/* Mock battery percent for testing */
static int battery_percent = 80;

/* ─── Helpers ────────────────────────────────────────────────────────── */

/* Blit a flash UI asset (KP-encoded) at (x, y) into dual framebuffers */
static void blit_asset(int asset_id, int x, int y)
{
    if (!ui_lang) return;
    const ui_asset_t *a = &ui_lang[asset_id];
    kp_blit(a->data, a->size, fb_bw, fb_gs, x, y);
}

/* Blit a flash UI asset centered: x = center_x - w/2, y = bottom_y - h */
static void blit_asset_centered(int asset_id, int center_x, int bottom_y)
{
    if (!ui_lang) return;
    const ui_asset_t *a = &ui_lang[asset_id];
    kp_blit_centered(a->data, a->size, fb_bw, fb_gs, center_x, bottom_y);
}

/* ─── SD scan ────────────────────────────────────────────────────────── */

void home_scan_books(void)
{
    book_count = 0;

    if (!x4_sd_mounted()) {
        ESP_LOGW(TAG, "SD not mounted, no books");
        return;
    }

    DIR *dir = opendir("/sd/library");
    if (!dir) dir = opendir("/sd/LIBRARY");
    if (!dir) dir = opendir("/sd/Library");
    if (!dir) {
        ESP_LOGW(TAG, "cannot open /sd/library (tried all cases)");
        return;
    }

    struct dirent *ent;
    while ((ent = readdir(dir)) != NULL && book_count < MAX_BOOKS) {
        /* Filter: must end with .kb or .KB */
        size_t len = strlen(ent->d_name);
        if (len < 4) continue;
        const char *ext = ent->d_name + len - 3;
        if (strcmp(ext, ".kb") != 0 && strcmp(ext, ".KB") != 0) continue;

        char path[272];
        snprintf(path, sizeof(path), "/sd/library/%s", ent->d_name);

        /* Open, read metadata, close */
        if (!kb_open(path)) continue;

        const kb_metadata_t *meta = kb_get_metadata();
        book_info_t *b = &books[book_count];
        strncpy(b->path, path, sizeof(b->path) - 1);
        b->path[sizeof(b->path) - 1] = '\0';

        if (meta) {
            strncpy(b->title, meta->title, sizeof(b->title) - 1);
            b->title[sizeof(b->title) - 1] = '\0';
            strncpy(b->author, meta->author, sizeof(b->author) - 1);
            b->author[sizeof(b->author) - 1] = '\0';
            b->page_count = meta->page_count;
            b->chapter_count = meta->chapter_count;
        } else {
            strncpy(b->title, ent->d_name, sizeof(b->title) - 1);
            b->title[sizeof(b->title) - 1] = '\0';
            b->author[0] = '\0';
            b->page_count = 0;
            b->chapter_count = 0;
        }

        b->current_page = 0;

        /* Demo: initial progress varies per book */
        b->progress = (book_count == 0) ? 42 : (book_count == 1) ? 0 : 100;

        kb_close();
        book_count++;

        ESP_LOGI(TAG, "found [%d]: %s", book_count - 1, b->title);
    }

    closedir(dir);
    ESP_LOGI(TAG, "scan complete: %d books", book_count);

    /* Reset selection */
    current_book = 0;
}

/* ─── Load current book's assets into asset_buf ──────────────────────── */

static void load_book_assets(void)
{
    cover_size = 0;
    title_size = 0;
    author_size = 0;

    if (book_count == 0) return;

    const book_info_t *b = &books[current_book];
    if (!kb_open(b->path)) {
        ESP_LOGE(TAG, "cannot reopen: %s", b->path);
        return;
    }

    uint32_t offset = 0;

    /* Load cover thumbnail */
    const kb_asset_entry_t *ae = kb_find_asset(KB_ASSET_COVER_THUMB, 0);
    if (ae && ae->size <= ASSET_BUF_SIZE - offset) {
        cover_offset = offset;
        cover_size = kb_load_asset(KB_ASSET_COVER_THUMB, 0,
                                   asset_buf + offset,
                                   ASSET_BUF_SIZE - offset);
        if (cover_size > 0) offset += cover_size;
        else cover_size = 0;
    }

    /* Load title bitmap */
    ae = kb_find_asset(KB_ASSET_BOOK_TITLE, 0);
    if (ae && ae->size <= ASSET_BUF_SIZE - offset) {
        title_offset = offset;
        title_size = kb_load_asset(KB_ASSET_BOOK_TITLE, 0,
                                   asset_buf + offset,
                                   ASSET_BUF_SIZE - offset);
        if (title_size > 0) offset += title_size;
        else title_size = 0;
    }

    /* Load author bitmap */
    ae = kb_find_asset(KB_ASSET_BOOK_AUTHOR, 0);
    if (ae && ae->size <= ASSET_BUF_SIZE - offset) {
        author_offset = offset;
        author_size = kb_load_asset(KB_ASSET_BOOK_AUTHOR, 0,
                                    asset_buf + offset,
                                    ASSET_BUF_SIZE - offset);
        if (author_size > 0) offset += author_size;
        else author_size = 0;
    }

    kb_close();

    ESP_LOGI(TAG, "loaded assets: cover=%lu title=%lu author=%lu",
             (unsigned long)cover_size, (unsigned long)title_size,
             (unsigned long)author_size);
}

/* ─── Render helpers ─────────────────────────────────────────────────── */

static void render_battery(void)
{
    /* Battery frame from flash asset */
    blit_asset(ASSET_BATTERY_FRAME, BATTERY_X, BATTERY_Y);

    /* Get frame dimensions to place fill bar inside */
    if (!ui_lang) return;
    const ui_asset_t *bat = &ui_lang[ASSET_BATTERY_FRAME];
    uint16_t fw, fh;
    if (!kp_get_dimensions(bat->data, &fw, &fh)) return;

    /* Fill bar: inside frame body (after tip), fills right-to-left */
    int tip_w = 3, sw = 2;  /* tip width, stroke width */
    int body_x = BATTERY_X + 1 + tip_w + sw;  /* inside body after tip + stroke */
    int body_y = BATTERY_Y + 1 + sw;
    int max_w = (int)fw - 2 - tip_w - sw * 2;
    int fill_h = (int)fh - 2 - sw * 2;
    int fill_w = (max_w * battery_percent) / 100;

    if (fill_w > 0 && fill_h > 0) {
        /* Right-aligned: offset from left by (max_w - fill_w) */
        int fill_x = body_x + (max_w - fill_w);
        blit_fill_rect(fb_bw, fill_x, body_y, fill_w, fill_h, 0);
        blit_fill_rect(fb_gs, fill_x, body_y, fill_w, fill_h, 0);
    }
}

static void render_cover(void)
{
    /* 2px black border around cover area */
    int bx = COVER_X - COVER_BORDER;
    int by = COVER_Y - COVER_BORDER;
    int bw = COVER_W + COVER_BORDER * 2;
    int bh = COVER_H + COVER_BORDER * 2;

    /* Top edge */
    blit_fill_rect(fb_bw, bx, by, bw, COVER_BORDER, 0);
    blit_fill_rect(fb_gs, bx, by, bw, COVER_BORDER, 0);
    /* Bottom edge */
    blit_fill_rect(fb_bw, bx, by + bh - COVER_BORDER, bw, COVER_BORDER, 0);
    blit_fill_rect(fb_gs, bx, by + bh - COVER_BORDER, bw, COVER_BORDER, 0);
    /* Left edge */
    blit_fill_rect(fb_bw, bx, by, COVER_BORDER, bh, 0);
    blit_fill_rect(fb_gs, bx, by, COVER_BORDER, bh, 0);
    /* Right edge */
    blit_fill_rect(fb_bw, bx + bw - COVER_BORDER, by, COVER_BORDER, bh, 0);
    blit_fill_rect(fb_gs, bx + bw - COVER_BORDER, by, COVER_BORDER, bh, 0);

    /* Cover thumbnail image */
    if (cover_size > 0) {
        /* Blit cover centered in the cover area */
        uint16_t cw, ch;
        if (kp_get_dimensions(asset_buf + cover_offset, &cw, &ch)) {
            int cx = COVER_X + (COVER_W - (int)cw) / 2;
            int cy = COVER_Y + (COVER_H - (int)ch) / 2;
            kp_blit(asset_buf + cover_offset, cover_size,
                    fb_bw, fb_gs, cx, cy);
        }
    }
}

static void render_arrows(void)
{
    if (book_count <= 1) return; /* No arrows for 0-1 books */

    if (!ui_lang) return;

    /* Left arrow: centered in left gap */
    const ui_asset_t *al = &ui_lang[ASSET_ARROW_LEFT];
    uint16_t aw, ah;
    if (kp_get_dimensions(al->data, &aw, &ah)) {
        int ax = ARROW_LEFT_CX - (int)aw / 2;
        int ay = ARROW_CY - (int)ah / 2;
        kp_blit(al->data, al->size, fb_bw, fb_gs, ax, ay);
    }

    /* Right arrow: centered in right gap */
    const ui_asset_t *ar = &ui_lang[ASSET_ARROW_RIGHT];
    if (kp_get_dimensions(ar->data, &aw, &ah)) {
        int ax = ARROW_RIGHT_CX - (int)aw / 2;
        int ay = ARROW_CY - (int)ah / 2;
        kp_blit(ar->data, ar->size, fb_bw, fb_gs, ax, ay);
    }
}

static void render_title_author(void)
{
    /* Title: bottom-left anchor at (28, 603) */
    if (title_size > 0) {
        kp_blit_centered(asset_buf + title_offset, title_size,
                         fb_bw, fb_gs,
                         SCREEN_W / 2, TITLE_BOTTOM_Y);
    }

    /* Author: top-left at (28, 611) */
    if (author_size > 0) {
        kp_blit(asset_buf + author_offset, author_size,
                fb_bw, fb_gs, AUTHOR_X, AUTHOR_Y);
    }
}

static void render_progress(void)
{
    const book_info_t *b = &books[current_book];
    uint8_t prog = b->progress;

    /* Progress label: pick asset based on progress */
    if (prog == 0) {
        blit_asset_centered(ASSET_PROGRESS_UNREAD, PROGRESS_LABEL_CX, PROGRESS_LABEL_BY);
    } else if (prog >= 100) {
        blit_asset_centered(ASSET_PROGRESS_FINISHED, PROGRESS_LABEL_CX, PROGRESS_LABEL_BY);
    } else {
        /* progress.1 through progress.99 are sequential in enum */
        blit_asset_centered(ASSET_PROGRESS_1 + prog - 1, PROGRESS_LABEL_CX, PROGRESS_LABEL_BY);
    }

    /* Progress frame */
    blit_asset(ASSET_PROGRESS_FRAME, PROGRESS_FRAME_X, PROGRESS_FRAME_Y);

    /* Progress fill bar inside frame.
     * Left edge: rounded only when fill starts at frame left edge.
     * Right edge: rounded only when fill reaches frame right edge.
     * Middle: straight rectangle. */
    if (prog > 0) {
        const ui_asset_t *pf = &ui_lang[ASSET_PROGRESS_FRAME];
        uint16_t fw, fh;
        if (kp_get_dimensions(pf->data, &fw, &fh)) {
            int pad = 3;
            int ix = PROGRESS_FRAME_X + 1 + pad;
            int iy = PROGRESS_FRAME_Y + 1 + pad;
            int iw = (int)fw - 2 - pad * 2;
            int ih = (int)fh - 2 - pad * 2;
            int fill_w = (iw * prog) / 100;
            if (fill_w < 2) fill_w = 2;
            if (fill_w > iw) fill_w = iw;

            if (fill_w > 0 && ih > 0) {
                float r = ih * 0.5f;
                float cy_c = r - 0.5f;
                int round_left = 1;              /* always at left edge */
                int round_right = (fill_w >= iw); /* only when 100% */

                for (int dy = 0; dy < ih; dy++) {
                    float cy = dy - cy_c;
                    int inset = 0;
                    if (cy * cy < r * r) {
                        inset = (int)(r - sqrtf(r * r - cy * cy) + 0.5f);
                    } else {
                        inset = (int)(r + 0.5f);
                    }

                    int left = ix + (round_left ? inset : 0);
                    int right = ix + fill_w - 1 - (round_right ? inset : 0);
                    int w = right - left + 1;
                    if (w > 0) {
                        blit_fill_rect(fb_bw, left, iy + dy, w, 1, 0);
                        blit_fill_rect(fb_gs, left, iy + dy, w, 1, 0);
                    }
                }
            }
        }
    }
}

static void render_empty_state(void)
{
    if (!ui_lang) return;

    /* "No books" message centered on screen */
    const ui_asset_t *nb = &ui_lang[ASSET_EMPTY_NO_BOOKS];
    int cx = (SCREEN_W - (int)nb->w) / 2;
    int cy = (SCREEN_H - (int)nb->h) / 2 - 15;
    blit_asset(ASSET_EMPTY_NO_BOOKS, cx, cy);

    /* Sub-message */
    const ui_asset_t *ns = &ui_lang[ASSET_EMPTY_NO_BOOKS_SUB];
    cx = (SCREEN_W - (int)ns->w) / 2;
    cy = (SCREEN_H - (int)ns->h) / 2 + 15;
    blit_asset(ASSET_EMPTY_NO_BOOKS_SUB, cx, cy);
}

/* ─── Screen lifecycle ───────────────────────────────────────────────── */

/* Render a raw .kp file fullscreen for testing.
 * KP is landscape-packed — memcpy directly into framebuffer. Zero malloc. */
static bool try_render_test_kp(void)
{
    FILE *f = fopen("/sd/TEST4.KP", "rb");
    if (!f) f = fopen("/sd/test4.kp", "rb");
    if (!f) { ESP_LOGW(TAG, "test4.kp not found"); return false; }

    uint8_t hdr[16];
    if (fread(hdr, 1, 16, f) != 16) { fclose(f); return false; }
    if (hdr[0] != 0x4B || hdr[1] != 0x50) { fclose(f); return false; }

    uint16_t w = hdr[4] | (hdr[5] << 8);
    uint16_t h = hdr[6] | (hdr[7] << 8);
    uint8_t comp = hdr[9];
    ESP_LOGI(TAG, "test4.kp: %dx%d comp=%d", w, h, comp);

    if (comp != 0) { fclose(f); return false; }

    uint32_t plane_size = (uint32_t)((w + 7) / 8) * h;
    if (plane_size > X4_DISPLAY_FB_SIZE) { fclose(f); return false; }

    uint8_t skip[4];

    /* Landscape KP: planes match framebuffer layout — read directly, zero transform */
    fread(skip, 1, 4, f);                    /* lsb_size prefix */
    memset(fb_gs, 0xFF, X4_DISPLAY_FB_SIZE);
    fread(fb_gs, 1, plane_size, f);          /* LSB → fb_gs (display RED RAM) */

    fread(skip, 1, 4, f);                    /* msb_size prefix */
    memset(fb_bw, 0xFF, X4_DISPLAY_FB_SIZE);
    fread(fb_bw, 1, plane_size, f);          /* MSB → fb_bw (display BW RAM) */

    fclose(f);

    ESP_LOGI(TAG, "Rendering test4.kp fullscreen...");
    x4_display_render_grayscale(fb_bw, fb_gs, X4_REFRESH_FULL);
    ESP_LOGI(TAG, "Done");
    return true;
}

/* ─── Quadrant test (pre-rendered from flash, 1-buffer API) ──────────── */

static int quadrant_rotation = 0;

// Pre-rendered quadrant images: 4 rotations, each = MSB plane (48KB) + LSB plane (48KB)
extern const uint8_t *quadrant_rotations[];

static void render_quadrant_test(void)
{
    const uint8_t *msb = quadrant_rotations[quadrant_rotation];
    const uint8_t *lsb = msb + X4_DISPLAY_FB_SIZE;

    // ── Step 1: BW base refresh ──
    // BW RAM = msb | lsb (all non-white → black)
    // RED RAM already has old B&W state from previous sync (or 0xFF from init)
    // SSD1677 differential: (BW=new, RED=old) → computes transitions
    for (uint32_t i = 0; i < X4_DISPLAY_FB_SIZE; i++)
        x4_framebuffer[i] = msb[i] | lsb[i];
    x4_display_write_bw_ram();
    x4_display_refresh_bw(X4_REFRESH_FAST);

    // ── Step 2: Grayscale overlay ──
    // BW RAM = target MSB, RED RAM = target LSB
    // Custom LUT: (BW, RED) → 4 gray levels
    memcpy(x4_framebuffer, msb, X4_DISPLAY_FB_SIZE);
    x4_display_write_bw_ram();
    memcpy(x4_framebuffer, lsb, X4_DISPLAY_FB_SIZE);
    x4_display_write_red_ram();
    x4_display_refresh_grayscale(X4_REFRESH_FAST);

    // ── Step 3: Sync RED RAM for next render's step 1 ──
    // Store current B&W state (msb|lsb) in RED RAM.
    // Next render: SSD1677 reads RED RAM as "old state" for differential.
    // No refresh — just RAM write (~10ms).
    for (uint32_t i = 0; i < X4_DISPLAY_FB_SIZE; i++)
        x4_framebuffer[i] = msb[i] | lsb[i];
    x4_display_write_red_ram();

    ESP_LOGI(TAG, "quadrant rotation=%d", quadrant_rotation);
}

void home_enter(void)
{
    ESP_LOGI(TAG, "enter — quadrant test mode (1-buffer API)");
    render_quadrant_test();
}

ui_state_t home_update(x4_input_event_t *evt)
{
    if (evt->type != X4_EVT_PRESS) return STATE_HOME;

    switch (evt->button) {
        case X4_BTN_LEFT:
            /* Rotate counterclockwise */
            quadrant_rotation = (quadrant_rotation + 3) % 4;
            render_quadrant_test();
            return STATE_HOME;

        case X4_BTN_RIGHT:
            /* Rotate clockwise */
            quadrant_rotation = (quadrant_rotation + 1) % 4;
            render_quadrant_test();
            return STATE_HOME;

        default:
            return STATE_HOME;
    }
}

void home_render(void)
{
    /* Quadrant test mode — rendering handled by render_quadrant_test() */
    return;

    ESP_LOGI(TAG, "render (books=%d, current=%d, bat=%d%%)",
             book_count, current_book, battery_percent);

    /* Clear to white */
    memset(fb_bw, 0xFF, X4_DISPLAY_FB_SIZE);
    memset(fb_gs, 0xFF, X4_DISPLAY_FB_SIZE);

    /* Battery */
    render_battery();

    if (book_count > 0) {
        /* Cover with border */
        render_cover();

        /* Left/Right arrows */
        render_arrows();

        /* Title & Author */
        render_title_author();

        /* Progress */
        render_progress();
    } else {
        /* Empty state */
        render_empty_state();
    }

    /* Help bar — matching emulator: divider at y=751, slots at y=752 */
    blit_hline(fb_bw, SAFE_X, 751, SCREEN_W - SAFE_X * 2, 0);
    blit_hline(fb_gs, SAFE_X, 751, SCREEN_W - SAFE_X * 2, 0);

    static const int help_ids[] = {
        ASSET_HELP_READ, ASSET_HELP_LIBRARY,
        ASSET_HELP_GALLERY, ASSET_HELP_SETTINGS
    };
    for (int i = 0; i < 4; i++) {
        blit_asset(help_ids[i], SAFE_X + i * 116, 752);
    }

    /* Push to display */
    x4_display_render_grayscale(fb_bw, fb_gs, X4_REFRESH_FULL);
}

void home_exit(void)
{
    ESP_LOGI(TAG, "exit");
}

#pragma GCC diagnostic pop
