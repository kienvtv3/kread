#include "blit.h"
#include <string.h>

// Landscape framebuffer: 800 pixels wide, 480 tall, 100 bytes/row
#define FB_STRIDE 100

// Portrait (px, py) -> landscape (row=479-px, col=py)
static inline void fb_set_pixel(uint8_t *fb, int px, int py, uint8_t color)
{
    if (px < 0 || px >= 480 || py < 0 || py >= 800) return;
    int row = 479 - px;
    int col = py;
    int byte_idx = row * FB_STRIDE + (col >> 3);
    int bit_idx = 7 - (col & 7);
    if (color)
        fb[byte_idx] |= (1 << bit_idx);
    else
        fb[byte_idx] &= ~(1 << bit_idx);
}

// Convention: planes use direct display convention.
// bit=0 = black, bit=1 = white. No inversion needed.

void blit_bw(uint8_t *fb, int x, int y, const uint8_t *src, int w, int h)
{
    int src_stride = (w + 7) >> 3;
    for (int row = 0; row < h; row++) {
        for (int col = 0; col < w; col++) {
            int src_byte = row * src_stride + (col >> 3);
            int src_bit = 7 - (col & 7);
            uint8_t pixel = (src[src_byte] >> src_bit) & 1;
            fb_set_pixel(fb, x + col, y + row, pixel);
        }
    }
}

void blit_gs(uint8_t *fb_msb, uint8_t *fb_lsb,
             int x, int y,
             const uint8_t *bw, const uint8_t *gs,
             int w, int h)
{
    // Planes match display convention directly:
    //   (bw=0,gs=0)=black, (0,1)=dark, (1,0)=light, (1,1)=white
    int src_stride = (w + 7) >> 3;
    for (int row = 0; row < h; row++) {
        for (int col = 0; col < w; col++) {
            int src_byte = row * src_stride + (col >> 3);
            int src_bit = 7 - (col & 7);
            uint8_t bw_pixel = (bw[src_byte] >> src_bit) & 1;
            uint8_t gs_pixel = (gs[src_byte] >> src_bit) & 1;
            fb_set_pixel(fb_msb, x + col, y + row, bw_pixel);
            fb_set_pixel(fb_lsb, x + col, y + row, gs_pixel);
        }
    }
}

void blit_bw_inverted(uint8_t *fb, int x, int y, const uint8_t *src, int w, int h)
{
    int src_stride = (w + 7) >> 3;
    for (int row = 0; row < h; row++) {
        for (int col = 0; col < w; col++) {
            int src_byte = row * src_stride + (col >> 3);
            int src_bit = 7 - (col & 7);
            uint8_t pixel = (src[src_byte] >> src_bit) & 1;
            fb_set_pixel(fb, x + col, y + row, !pixel);
        }
    }
}

void blit_fill_rect(uint8_t *fb, int x, int y, int w, int h, uint8_t color)
{
    for (int row = 0; row < h; row++) {
        for (int col = 0; col < w; col++) {
            fb_set_pixel(fb, x + col, y + row, color);
        }
    }
}

void blit_hline(uint8_t *fb, int x, int y, int w, uint8_t color)
{
    for (int col = 0; col < w; col++) {
        fb_set_pixel(fb, x + col, y, color);
    }
}

// Blit landscape-packed source planes at portrait position (dst_x, dst_y).
// Source is landscape-packed: src_w wide × src_h tall.
// Encoder did: portrait(px,py) → landscape(lx=py, ly=pw-1-px), pw=src_h.
// Inverse: portrait(px,py) = (src_h - 1 - ly, lx).
// So each source pixel (alx, aly) → portrait pixel (src_h-1-aly, alx).
// Placed at framebuffer portrait position (dst_x + src_h-1-aly, dst_y + alx).
void blit_landscape(uint8_t *fb_bw, uint8_t *fb_gs,
                    int dst_x, int dst_y,
                    const uint8_t *src_bw, const uint8_t *src_gs,
                    int src_w, int src_h)
{
    int src_stride = (src_w + 7) >> 3;

    for (int aly = 0; aly < src_h; aly++) {
        int px = dst_x + (src_h - 1 - aly);
        for (int alx = 0; alx < src_w; alx++) {
            int py = dst_y + alx;

            int src_byte = aly * src_stride + (alx >> 3);
            int src_bit = 7 - (alx & 7);

            if (src_bw) {
                uint8_t val = (src_bw[src_byte] >> src_bit) & 1;
                fb_set_pixel(fb_bw, px, py, val);
            }
            if (src_gs) {
                uint8_t val = (src_gs[src_byte] >> src_bit) & 1;
                fb_set_pixel(fb_gs, px, py, val);
            }
        }
    }
}
