#include "nav.h"
#include "ui_assets.h"
#include "kp_decode.h"
#include "blit.h"

// Nav bar layout (portrait coordinates)
#define SCREEN_W    480
#define NAV_Y       756
#define NAV_HEIGHT  44
#define NAV_SLOTS   4
#define NAV_SLOT_W  (SCREEN_W / NAV_SLOTS)  // 120px each

void nav_render(const nav_bar_t *bar, uint8_t *fb_msb, uint8_t *fb_lsb)
{
    // Blit nav slot bitmaps first
    for (int i = 0; i < NAV_SLOTS; i++) {
        int slot_x = i * NAV_SLOT_W;

        if (bar->slots[i].label >= 0 && ui_lang) {
            const ui_asset_t *a = &ui_lang[bar->slots[i].label];
            const uint8_t *bw, *gs;
            uint16_t w, h;
            if (kp_decode(a->data, a->size, &bw, &gs, &w, &h)) {
                int bx = slot_x + (NAV_SLOT_W - w) / 2;
                int by = NAV_Y + 2 + (NAV_HEIGHT - 2 - h) / 2;

                if (gs) {
                    blit_gs(fb_msb, fb_lsb, bx, by, bw, gs, w, h);
                } else {
                    blit_bw(fb_msb, bx, by, bw, w, h);
                    blit_bw(fb_lsb, bx, by, bw, w, h);
                }
            }
        }
    }

    // Draw separator AFTER bitmaps so it's not overwritten (z-order)
    blit_hline(fb_msb, 0, NAV_Y, SCREEN_W, 0);
    blit_hline(fb_lsb, 0, NAV_Y, SCREEN_W, 0);
}
