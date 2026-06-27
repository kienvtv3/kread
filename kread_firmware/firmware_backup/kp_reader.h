#ifndef KP_READER_H
#define KP_READER_H

#include <stdint.h>
#include <stdbool.h>

// .kp header (matches spec: 16 bytes, little-endian)
typedef struct __attribute__((packed)) {
    uint8_t  magic[4];      // "KP\x00\x01"
    uint16_t width;
    uint16_t height;
    uint8_t  bit_depth;     // 1 or 2
    uint8_t  compression;   // 0=raw, 1=LZ4
    uint32_t data_size;     // compressed data size
    uint16_t raw_size_hi;   // upper 16 bits of uncompressed size
} kp_header_t;

// Display a .kp file from SD card on the e-ink display
// use_half: true = HALF refresh for B&W base (clears ghost), false = FAST (normal)
// Returns true on success
bool kp_display_file(const char *path, bool use_half);

#endif
