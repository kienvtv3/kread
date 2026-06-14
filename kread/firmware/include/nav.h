#ifndef NAV_H
#define NAV_H

#include <stdint.h>
#include "ui_assets.h"

// Sentinel: no icon/label for this slot
#define NAV_NONE (-1)

// A nav bar slot: icon + label from UI assets
typedef struct {
    int icon;    // ui_asset_id_t or NAV_NONE
    int label;   // ui_asset_id_t or NAV_NONE
} nav_slot_t;

// Nav bar with 4 slots: [BACK, CONFIRM, LEFT, RIGHT]
typedef struct {
    nav_slot_t slots[4];
} nav_bar_t;

// Render nav bar into dual framebuffers (grayscale mode).
// Draws at y=756, h=44 (portrait coordinates).
// Draws 1px separator line at top.
void nav_render(const nav_bar_t *bar, uint8_t *fb_msb, uint8_t *fb_lsb);

#endif
