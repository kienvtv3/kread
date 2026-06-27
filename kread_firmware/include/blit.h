#ifndef BLIT_H
#define BLIT_H

#include <stdint.h>
#include <x4/display.h>

// Blit a 1-bit bitmap into framebuffer at (x, y).
// src: row-major, 1 bit/pixel, MSB first. 0=black, 1=white.
// fb: full 800x480 framebuffer (X4_DISPLAY_FB_SIZE bytes).
// x, y: top-left position in portrait coordinates (0,0 = top-left).
// w, h: bitmap dimensions in pixels.
void blit_bw(uint8_t *fb, int x, int y, const uint8_t *src, int w, int h);

// Blit with inversion (for selected list items): 0=white, 1=black.
void blit_bw_inverted(uint8_t *fb, int x, int y, const uint8_t *src, int w, int h);

// Fill a rectangle in the framebuffer.
// color: 0 = black, 1 = white.
void blit_fill_rect(uint8_t *fb, int x, int y, int w, int h, uint8_t color);

// Draw a horizontal line (1px).
void blit_hline(uint8_t *fb, int x, int y, int w, uint8_t color);

// Blit a grayscale bitmap (BW + LSB planes) into dual framebuffers
// Source is portrait-packed, coordinates are portrait. Transform handled internally.
void blit_gs(uint8_t *fb_msb, uint8_t *fb_lsb,
             int x, int y,
             const uint8_t *bw, const uint8_t *lsb,
             int w, int h);

// Blit landscape-packed planes directly into landscape framebuffers.
// src_bw/src_gs: landscape-packed (src_w bits wide, src_h rows).
// dst_x, dst_y: portrait position where top-left corner goes.
// Converts portrait (dst_x, dst_y) to landscape offset internally.
void blit_landscape(uint8_t *fb_bw, uint8_t *fb_gs,
                    int dst_x, int dst_y,
                    const uint8_t *src_bw, const uint8_t *src_gs,
                    int src_w, int src_h);

#endif
