#ifndef X4_DISPLAY_H
#define X4_DISPLAY_H

#include <stdint.h>
#include <stdbool.h>

#define X4_DISPLAY_WIDTH       800
#define X4_DISPLAY_HEIGHT      480
#define X4_DISPLAY_WIDTH_BYTES (X4_DISPLAY_WIDTH / 8)
#define X4_DISPLAY_FB_SIZE     (X4_DISPLAY_WIDTH_BYTES * X4_DISPLAY_HEIGHT)

// --- Refresh mode ---

typedef enum {
    X4_REFRESH_FAST,  // Quick differential refresh (~600ms). Default.
    X4_REFRESH_FULL,  // Inversion-based refresh (~1.7s). Clears accumulated ghost.
} x4_refresh_t;

// --- Init / Sleep ---

void x4_display_init(void);
void x4_display_sleep(void);

// --- Single shared framebuffer ---
// All screens render into this buffer. It is reused for each plane.
// Flow: fill MSB data → write_bw_ram() → fill LSB data → write_red_ram() → refresh

extern uint8_t x4_framebuffer[X4_DISPLAY_FB_SIZE];

// --- Low-level RAM write (direct to SSD1677) ---

// Write framebuffer contents to SSD1677 BW RAM (MSB plane)
void x4_display_write_bw_ram(void);

// Write framebuffer contents to SSD1677 RED RAM (LSB plane)
void x4_display_write_red_ram(void);

// --- Refresh ---

// Trigger grayscale refresh (2-step: BW base + custom LUT overlay)
// Assumes BW RAM and RED RAM already written with correct data.
void x4_display_refresh_grayscale(x4_refresh_t refresh);

// Trigger B&W refresh (single step)
void x4_display_refresh_bw(x4_refresh_t refresh);

// --- Legacy API (backward compat) ---

void x4_display_render_bw(const uint8_t *msb, x4_refresh_t refresh);
void x4_display_render_grayscale(const uint8_t *msb, const uint8_t *lsb,
                                  x4_refresh_t refresh);
void x4_display_get_framebuffers(uint8_t **msb, uint8_t **lsb);

#endif
