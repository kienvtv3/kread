/**
 * kp_decode.c - KP v2 asset decoder
 *
 * KP v2 header (16 bytes):
 *   [0..3]   magic: 'K' 'P' 0x00 0x02
 *   [4..5]   width (uint16 LE)
 *   [6..7]   height (uint16 LE)
 *   [8]      bit_depth: 1 or 2
 *   [9]      compression: 0=raw, 1=LZ4
 *   [10..13] data_size (uint32 LE)
 *   [14]     content_flags
 *   [15]     reserved
 *
 * For bit_depth=2, data section:
 *   [lsb_size:u32le][lsb_data][msb_size:u32le][msb_data]
 *   lsb = GS plane (level & 1), msb = BW plane (level >> 1)
 *
 * For bit_depth=1, data section:
 *   [bw_size:u32le][bw_data]
 */

#include "kp_decode.h"
#include "blit.h"
#include "lz4.h"
#include <string.h>
#include <stdlib.h>
#include "esp_log.h"

static const char *TAG = "kp";

#define KP_HEADER_SIZE 16

/* Safe LE reads (RISC-V may fault on unaligned access) */
static inline uint16_t read_u16le(const uint8_t *p)
{
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

static inline uint32_t read_u32le(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

/* Validate KP v2 header. Returns true if valid. */
static bool kp_parse_header(const uint8_t *kp_data, uint32_t kp_size,
                            uint16_t *w, uint16_t *h,
                            uint8_t *depth, uint8_t *comp,
                            uint32_t *data_size)
{
    if (kp_size < KP_HEADER_SIZE) return false;

    /* Magic: 'K' 'P' 0x00 0x02 */
    if (kp_data[0] != 0x4B || kp_data[1] != 0x50 ||
        kp_data[2] != 0x00 || kp_data[3] != 0x02) {
        ESP_LOGE(TAG, "bad magic: %02x %02x %02x %02x",
                 kp_data[0], kp_data[1], kp_data[2], kp_data[3]);
        return false;
    }

    *w = read_u16le(kp_data + 4);
    *h = read_u16le(kp_data + 6);
    *depth = kp_data[8];
    *comp = kp_data[9];
    *data_size = read_u32le(kp_data + 10);

    if (*depth != 1 && *depth != 2) {
        ESP_LOGE(TAG, "unsupported depth %d", *depth);
        return false;
    }
    if (*comp > 1) {
        ESP_LOGE(TAG, "unsupported comp %d", *comp);
        return false;
    }
    if (KP_HEADER_SIZE + *data_size > kp_size) {
        ESP_LOGE(TAG, "data_size %lu exceeds kp_size %lu",
                 (unsigned long)*data_size, (unsigned long)kp_size);
        return false;
    }

    return true;
}

bool kp_get_dimensions(const uint8_t *kp_data, uint16_t *w, uint16_t *h)
{
    if (!kp_data) return false;
    /* Just read w/h from header, no data_size validation */
    if (kp_data[0] != 0x4B || kp_data[1] != 0x50) return false;
    *w = kp_data[4] | (kp_data[5] << 8);
    *h = kp_data[6] | (kp_data[7] << 8);
    return true;
}

bool kp_decode(const uint8_t *kp_data, uint32_t kp_size,
               const uint8_t **bw_out, const uint8_t **gs_out,
               uint16_t *w_out, uint16_t *h_out)
{
    if (!kp_data || !bw_out || !w_out || !h_out) return false;

    uint16_t w, h;
    uint8_t depth, comp;
    uint32_t data_size;
    if (!kp_parse_header(kp_data, kp_size, &w, &h, &depth, &comp, &data_size))
        return false;

    *w_out = w;
    *h_out = h;

    const uint8_t *data = kp_data + KP_HEADER_SIZE;
    uint32_t plane_size = (uint32_t)((w + 7) / 8) * h;

    if (depth == 2) {
        if (comp == 0) {
            /* Uncompressed: [lsb_size:4][lsb_data][msb_size:4][msb_data] */
            uint32_t lsb_size = read_u32le(data);
            const uint8_t *lsb_ptr = data + 4;
            uint32_t msb_size = read_u32le(lsb_ptr + lsb_size);
            const uint8_t *msb_ptr = lsb_ptr + lsb_size + 4;
            (void)msb_size;

            /* bw = msb plane, gs = lsb plane (zero-copy) */
            *bw_out = msb_ptr;
            if (gs_out) *gs_out = lsb_ptr;
        } else {
            /* LZ4 compressed: decompress both planes */
            uint32_t lsb_comp_size = read_u32le(data);
            const uint8_t *lsb_comp = data + 4;
            uint32_t msb_comp_size = read_u32le(lsb_comp + lsb_comp_size);
            const uint8_t *msb_comp = lsb_comp + lsb_comp_size + 4;

            uint8_t *lsb_dec = malloc(plane_size);
            uint8_t *msb_dec = malloc(plane_size);
            if (!lsb_dec || !msb_dec) {
                ESP_LOGE(TAG, "OOM decode %lu", (unsigned long)plane_size);
                free(lsb_dec);
                free(msb_dec);
                return false;
            }

            int r1 = LZ4_decompress_safe((const char *)lsb_comp, (char *)lsb_dec,
                                          lsb_comp_size, plane_size);
            int r2 = LZ4_decompress_safe((const char *)msb_comp, (char *)msb_dec,
                                          msb_comp_size, plane_size);
            if (r1 < 0 || r2 < 0) {
                ESP_LOGE(TAG, "LZ4 fail: lsb=%d msb=%d", r1, r2);
                free(lsb_dec);
                free(msb_dec);
                return false;
            }

            *bw_out = msb_dec;
            if (gs_out) *gs_out = lsb_dec;
            /* NOTE: caller is responsible for freeing these if compressed.
             * For flash UI assets (always uncompressed), this is never hit. */
        }
    } else {
        /* bit_depth == 1 */
        if (comp == 0) {
            uint32_t bw_size = read_u32le(data);
            (void)bw_size;
            *bw_out = data + 4;
        } else {
            uint32_t bw_comp_size = read_u32le(data);
            const uint8_t *bw_comp = data + 4;

            uint8_t *bw_dec = malloc(plane_size);
            if (!bw_dec) {
                ESP_LOGE(TAG, "OOM decode %lu", (unsigned long)plane_size);
                return false;
            }

            int r = LZ4_decompress_safe((const char *)bw_comp, (char *)bw_dec,
                                         bw_comp_size, plane_size);
            if (r < 0) {
                ESP_LOGE(TAG, "LZ4 fail: %d", r);
                free(bw_dec);
                return false;
            }

            *bw_out = bw_dec;
        }
        if (gs_out) *gs_out = NULL;
    }

    return true;
}

bool kp_blit(const uint8_t *kp_data, uint32_t kp_size,
             uint8_t *fb_bw, uint8_t *fb_gs,
             int dst_x, int dst_y)
{
    if (!kp_data || !fb_bw) return false;

    uint16_t w, h;
    uint8_t depth, comp;
    uint32_t data_size;
    if (!kp_parse_header(kp_data, kp_size, &w, &h, &depth, &comp, &data_size))
        return false;

    const uint8_t *bw = NULL;
    const uint8_t *gs = NULL;
    bool allocated = false;

    const uint8_t *data = kp_data + KP_HEADER_SIZE;
    uint32_t plane_size = (uint32_t)((w + 7) / 8) * h;

    if (depth == 2) {
        if (comp == 0) {
            uint32_t lsb_size = read_u32le(data);
            const uint8_t *lsb_ptr = data + 4;
            uint32_t msb_size = read_u32le(lsb_ptr + lsb_size);
            const uint8_t *msb_ptr = lsb_ptr + lsb_size + 4;
            (void)msb_size;
            bw = msb_ptr;
            gs = lsb_ptr;
        } else {
            uint32_t lsb_comp_size = read_u32le(data);
            const uint8_t *lsb_comp = data + 4;
            uint32_t msb_comp_size = read_u32le(lsb_comp + lsb_comp_size);
            const uint8_t *msb_comp = lsb_comp + lsb_comp_size + 4;

            uint8_t *lsb_dec = malloc(plane_size);
            uint8_t *msb_dec = malloc(plane_size);
            if (!lsb_dec || !msb_dec) {
                ESP_LOGE(TAG, "OOM blit %lu", (unsigned long)plane_size);
                free(lsb_dec);
                free(msb_dec);
                return false;
            }

            int r1 = LZ4_decompress_safe((const char *)lsb_comp, (char *)lsb_dec,
                                          lsb_comp_size, plane_size);
            int r2 = LZ4_decompress_safe((const char *)msb_comp, (char *)msb_dec,
                                          msb_comp_size, plane_size);
            if (r1 < 0 || r2 < 0) {
                ESP_LOGE(TAG, "LZ4 fail: lsb=%d msb=%d", r1, r2);
                free(lsb_dec);
                free(msb_dec);
                return false;
            }

            bw = msb_dec;
            gs = lsb_dec;
            allocated = true;
        }

        /* Check layout flag: bit 2 of content_flags */
        uint8_t flags = kp_data[14];
        if (flags & 0x04) {
            /* Landscape-packed (fullscreen pages) */
            blit_landscape(fb_bw, fb_gs, dst_x, dst_y, bw, gs, w, h);
        } else {
            /* Portrait-packed (UI assets, covers) — use proven blit_gs */
            blit_gs(fb_bw, fb_gs, dst_x, dst_y, bw, gs, w, h);
        }

    } else {
        /* bit_depth == 1 */
        if (comp == 0) {
            uint32_t bw_size = read_u32le(data);
            (void)bw_size;
            bw = data + 4;
        } else {
            uint32_t bw_comp_size = read_u32le(data);
            const uint8_t *bw_comp = data + 4;

            uint8_t *bw_dec = malloc(plane_size);
            if (!bw_dec) {
                ESP_LOGE(TAG, "OOM blit %lu", (unsigned long)plane_size);
                return false;
            }

            int r = LZ4_decompress_safe((const char *)bw_comp, (char *)bw_dec,
                                         bw_comp_size, plane_size);
            if (r < 0) {
                ESP_LOGE(TAG, "LZ4 fail: %d", r);
                free(bw_dec);
                return false;
            }

            bw = bw_dec;
            allocated = true;
        }

        uint8_t flags = kp_data[14];
        if (flags & 0x04) {
            blit_landscape(fb_bw, fb_gs, dst_x, dst_y, bw, bw, w, h);
        } else {
            blit_bw(fb_bw, dst_x, dst_y, bw, w, h);
            if (fb_gs) blit_bw(fb_gs, dst_x, dst_y, bw, w, h);
        }
    }

    if (allocated) {
        free((void *)bw);
        free((void *)gs);
    }

    return true;
}

bool kp_blit_centered(const uint8_t *kp_data, uint32_t kp_size,
                      uint8_t *fb_bw, uint8_t *fb_gs,
                      int center_x, int bottom_y)
{
    uint16_t w, h;
    if (!kp_get_dimensions(kp_data, &w, &h)) return false;

    int x = center_x - w / 2;
    int y = bottom_y - h;
    return kp_blit(kp_data, kp_size, fb_bw, fb_gs, x, y);
}
