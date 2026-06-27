/**
 * kb_reader.h - .kb v2 file format reader
 *
 * Reads .kb files from SD card. A .kb file contains pre-rendered book pages
 * (as KP-encoded bitmaps), book assets (cover, title, author), and metadata.
 */

#ifndef KB_READER_H
#define KB_READER_H

#include <stdint.h>
#include <stdbool.h>

/* Maximum limits for static arrays */
#define KB_MAX_PAGES    2000
#define KB_MAX_ASSETS   64
#define KB_MAX_CHAPTERS 128

/* Asset type constants (from .kb spec) */
#define KB_ASSET_FONT_NAME    0x00
#define KB_ASSET_BOOK_TITLE   0x01
#define KB_ASSET_BOOK_AUTHOR  0x02
#define KB_ASSET_COVER        0x03
#define KB_ASSET_CHAPTER_NAME 0x04
#define KB_ASSET_COVER_THUMB  0x05

/* Book metadata (parsed from JSON) */
typedef struct {
    char title[128];
    char author[64];
    uint16_t page_count;
    uint8_t chapter_count;
    uint8_t font_size_idx;
    uint8_t orientation;
    uint8_t mode;
    uint8_t flags;
} kb_metadata_t;

/* Page table entry */
typedef struct {
    uint32_t offset;
    uint32_t size;
} kb_page_entry_t;

/* Asset index entry */
typedef struct {
    uint8_t type;
    uint8_t index;
    uint16_t height;
    uint32_t offset;
    uint32_t size;
} kb_asset_entry_t;

/* Open a .kb file. Returns true on success. */
bool kb_open(const char *path);

/* Close current book and free resources. */
void kb_close(void);

/* Check if a book is currently open. */
bool kb_is_open(void);

/* Get metadata (valid while book is open). */
const kb_metadata_t *kb_get_metadata(void);

/* Get total page count. */
uint16_t kb_get_page_count(void);

/**
 * Load a page's KP data into buf.
 * Returns bytes read, or 0 on failure.
 * Caller should provide buf_size >= page entry's size.
 */
uint32_t kb_load_page(uint16_t page_num, uint8_t *buf, uint32_t buf_size);

/* Get page entry (offset + size). Returns NULL if out of range. */
const kb_page_entry_t *kb_get_page_entry(uint16_t page_num);

/**
 * Load a book asset by type and index.
 * Returns bytes read, or 0 on failure.
 */
uint32_t kb_load_asset(uint8_t type, uint8_t index, uint8_t *buf, uint32_t buf_size);

/* Find asset entry by type and index. Returns NULL if not found. */
const kb_asset_entry_t *kb_find_asset(uint8_t type, uint8_t index);

/* Get chapter start page. Returns 0 if out of range. */
uint16_t kb_get_chapter_page(uint8_t chapter_idx);

#endif /* KB_READER_H */
