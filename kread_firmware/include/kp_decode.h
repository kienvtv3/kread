#pragma once
#include <stdint.h>
#include <stdbool.h>

/**
 * Decode a KP v2 asset into BW and GS plane pointers.
 *
 * For uncompressed assets, bw_out/gs_out point directly into kp_data (zero-copy).
 * For compressed assets, data is decompressed into heap buffers that the caller
 * must free via kp_free_decoded().
 *
 * Returns true on success. gs_out is NULL for 1-bit assets.
 */
bool kp_decode(const uint8_t *kp_data, uint32_t kp_size,
               const uint8_t **bw_out, const uint8_t **gs_out,
               uint16_t *w_out, uint16_t *h_out);

/**
 * Blit a KP v2 asset to dual framebuffers at portrait (x, y).
 * Handles decompression internally if needed.
 */
bool kp_blit(const uint8_t *kp_data, uint32_t kp_size,
             uint8_t *fb_bw, uint8_t *fb_gs,
             int dst_x, int dst_y);

/**
 * Blit centered: x = center_x - w/2, y = bottom_y - h.
 */
bool kp_blit_centered(const uint8_t *kp_data, uint32_t kp_size,
                      uint8_t *fb_bw, uint8_t *fb_gs,
                      int center_x, int bottom_y);

/**
 * Get dimensions without blitting.
 */
bool kp_get_dimensions(const uint8_t *kp_data, uint16_t *w, uint16_t *h);
