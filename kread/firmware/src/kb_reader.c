/**
 * kb_reader.c - .kb v2 file format reader
 *
 * KB v2 file layout:
 *   [header 32B] [page_table] [chapter_offsets] [asset_index + data] [page_data] [metadata]
 *
 * Header (32 bytes):
 *   0x00: magic 'K' 'B' 0x00 0x02
 *   0x04: page_count (u16le)
 *   0x06: chapter_count (u8)
 *   0x07: rendition_count (u8)
 *   0x08: font_size_idx (u8)
 *   0x09: orientation (u8)
 *   0x0A: mode (u8)
 *   0x0B: flags (u8)
 *   0x0C: page_table_offset (u32le)
 *   0x10: chapter_offset (u32le)
 *   0x14: asset_offset (u32le)
 *   0x18: asset_count (u16le)
 *   0x1A: meta_offset (u32le)
 *   0x1E: meta_size (u16le)
 *
 * Page table entry (8 bytes): offset:u32le + size:u32le
 * Chapter entry (2 bytes): page_index:u16le
 * Asset entry (12 bytes): type:u8 + index:u8 + height:u16le + offset:u32le + size:u32le
 * Metadata: JSON string (not null-terminated in file)
 */

#include "kb_reader.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "esp_log.h"

static const char *TAG = "kb";

#define KB_HEADER_SIZE 32

/* Safe LE reads (RISC-V unaligned access) */
static inline uint16_t rd16(const uint8_t *p)
{
    return (uint16_t)p[0] | ((uint16_t)p[1] << 8);
}

static inline uint32_t rd32(const uint8_t *p)
{
    return (uint32_t)p[0] | ((uint32_t)p[1] << 8) |
           ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}

/* Static state — one book open at a time */
static FILE *s_file = NULL;
static kb_metadata_t s_meta;
static kb_page_entry_t s_pages[KB_MAX_PAGES];
static kb_asset_entry_t s_assets[KB_MAX_ASSETS];
static uint16_t s_chapters[KB_MAX_CHAPTERS];
static uint16_t s_page_count;
static uint16_t s_asset_count;
static uint8_t s_chapter_count;

/* ─── JSON string extraction (no library) ────────────────────────────── */

/**
 * Extract a JSON string value by key from a JSON buffer.
 * Writes into dst (max dst_size-1 chars + null).
 * Returns true if found.
 *
 * Handles: "key":"value" with simple escape (\", \\).
 * Does NOT handle nested objects, arrays, or unicode escapes.
 */
static bool json_get_string(const char *json, int json_len,
                            const char *key, char *dst, int dst_size)
{
    if (!json || !key || !dst || dst_size <= 0) return false;
    dst[0] = '\0';

    /* Build search pattern: "key" */
    char pattern[140];
    int plen = snprintf(pattern, sizeof(pattern), "\"%s\"", key);
    if (plen < 0 || plen >= (int)sizeof(pattern)) return false;

    /* Find the key */
    const char *p = json;
    const char *end = json + json_len;
    while (p < end - plen) {
        if (memcmp(p, pattern, plen) == 0) break;
        p++;
    }
    if (p >= end - plen) return false;

    /* Skip past key and colon */
    p += plen;
    while (p < end && (*p == ' ' || *p == ':')) p++;
    if (p >= end || *p != '"') return false;
    p++; /* skip opening quote */

    /* Copy value until closing quote */
    int i = 0;
    while (p < end && *p != '"' && i < dst_size - 1) {
        if (*p == '\\' && p + 1 < end) {
            p++;
            if (*p == 'n') dst[i++] = '\n';
            else if (*p == 't') dst[i++] = '\t';
            else dst[i++] = *p;
        } else {
            dst[i++] = *p;
        }
        p++;
    }
    dst[i] = '\0';
    return i > 0;
}

/* ─── Public API ─────────────────────────────────────────────────────── */

bool kb_open(const char *path)
{
    if (s_file) {
        ESP_LOGW(TAG, "closing previous book before opening new one");
        kb_close();
    }

    s_file = fopen(path, "rb");
    if (!s_file) {
        ESP_LOGE(TAG, "cannot open: %s", path);
        return false;
    }

    /* Read header */
    uint8_t hdr[KB_HEADER_SIZE];
    if (fread(hdr, 1, KB_HEADER_SIZE, s_file) != KB_HEADER_SIZE) {
        ESP_LOGE(TAG, "short header");
        fclose(s_file); s_file = NULL;
        return false;
    }

    /* Validate magic */
    if (hdr[0] != 'K' || hdr[1] != 'B' || hdr[2] != 0x00 || hdr[3] != 0x02) {
        ESP_LOGE(TAG, "bad magic: %02x %02x %02x %02x",
                 hdr[0], hdr[1], hdr[2], hdr[3]);
        fclose(s_file); s_file = NULL;
        return false;
    }

    /* Parse header fields */
    s_page_count      = rd16(hdr + 0x04);
    s_chapter_count   = hdr[0x06];
    /* hdr[0x07] = rendition_count (unused) */
    uint8_t font_size_idx = hdr[0x08];
    uint8_t orientation   = hdr[0x09];
    uint8_t mode          = hdr[0x0A];
    uint8_t flags         = hdr[0x0B];
    uint32_t page_table_off = rd32(hdr + 0x0C);
    uint32_t chapter_off    = rd32(hdr + 0x10);
    uint32_t asset_off      = rd32(hdr + 0x14);
    s_asset_count           = rd16(hdr + 0x18);
    uint32_t meta_off       = rd32(hdr + 0x1A);
    uint16_t meta_size      = rd16(hdr + 0x1E);

    ESP_LOGI(TAG, "pages=%u chapters=%u assets=%u meta=%u bytes",
             s_page_count, s_chapter_count, s_asset_count, meta_size);

    /* Clamp to static array limits */
    if (s_page_count > KB_MAX_PAGES) {
        ESP_LOGW(TAG, "clamping pages %u -> %d", s_page_count, KB_MAX_PAGES);
        s_page_count = KB_MAX_PAGES;
    }
    if (s_asset_count > KB_MAX_ASSETS) {
        ESP_LOGW(TAG, "clamping assets %u -> %d", s_asset_count, KB_MAX_ASSETS);
        s_asset_count = KB_MAX_ASSETS;
    }
    if (s_chapter_count > KB_MAX_CHAPTERS) {
        ESP_LOGW(TAG, "clamping chapters %u -> %d", s_chapter_count, KB_MAX_CHAPTERS);
        s_chapter_count = KB_MAX_CHAPTERS;
    }

    /* Read page table */
    if (s_page_count > 0) {
        fseek(s_file, page_table_off, SEEK_SET);
        for (uint16_t i = 0; i < s_page_count; i++) {
            uint8_t entry[8];
            if (fread(entry, 1, 8, s_file) != 8) {
                ESP_LOGE(TAG, "short page table at %u", i);
                fclose(s_file); s_file = NULL;
                return false;
            }
            s_pages[i].offset = rd32(entry);
            s_pages[i].size   = rd32(entry + 4);
        }
    }

    /* Read chapter offsets */
    if (s_chapter_count > 0) {
        fseek(s_file, chapter_off, SEEK_SET);
        for (uint8_t i = 0; i < s_chapter_count; i++) {
            uint8_t entry[2];
            if (fread(entry, 1, 2, s_file) != 2) {
                ESP_LOGE(TAG, "short chapter table at %u", i);
                /* Non-fatal: chapters are optional */
                s_chapter_count = i;
                break;
            }
            s_chapters[i] = rd16(entry);
        }
    }

    /* Read asset index */
    if (s_asset_count > 0) {
        fseek(s_file, asset_off, SEEK_SET);
        for (uint16_t i = 0; i < s_asset_count; i++) {
            uint8_t entry[12];
            if (fread(entry, 1, 12, s_file) != 12) {
                ESP_LOGE(TAG, "short asset index at %u", i);
                fclose(s_file); s_file = NULL;
                return false;
            }
            s_assets[i].type   = entry[0];
            s_assets[i].index  = entry[1];
            s_assets[i].height = rd16(entry + 2);
            s_assets[i].offset = rd32(entry + 4);
            s_assets[i].size   = rd32(entry + 8);
        }
    }

    /* Read metadata JSON and parse title/author */
    memset(&s_meta, 0, sizeof(s_meta));
    s_meta.page_count    = s_page_count;
    s_meta.chapter_count = s_chapter_count;
    s_meta.font_size_idx = font_size_idx;
    s_meta.orientation   = orientation;
    s_meta.mode          = mode;
    s_meta.flags         = flags;

    if (meta_size > 0 && meta_size < 4096) {
        char *json = malloc(meta_size + 1);
        if (json) {
            fseek(s_file, meta_off, SEEK_SET);
            size_t rd = fread(json, 1, meta_size, s_file);
            json[rd] = '\0';

            json_get_string(json, (int)rd, "title",  s_meta.title,  sizeof(s_meta.title));
            json_get_string(json, (int)rd, "author", s_meta.author, sizeof(s_meta.author));

            ESP_LOGI(TAG, "title=\"%s\" author=\"%s\"", s_meta.title, s_meta.author);
            free(json);
        }
    }

    ESP_LOGI(TAG, "opened: %s (%u pages)", path, s_page_count);
    return true;
}

void kb_close(void)
{
    if (s_file) {
        fclose(s_file);
        s_file = NULL;
    }
    s_page_count = 0;
    s_asset_count = 0;
    s_chapter_count = 0;
    memset(&s_meta, 0, sizeof(s_meta));
}

bool kb_is_open(void)
{
    return s_file != NULL;
}

const kb_metadata_t *kb_get_metadata(void)
{
    return s_file ? &s_meta : NULL;
}

uint16_t kb_get_page_count(void)
{
    return s_page_count;
}

const kb_page_entry_t *kb_get_page_entry(uint16_t page_num)
{
    if (!s_file || page_num >= s_page_count) return NULL;
    return &s_pages[page_num];
}

uint32_t kb_load_page(uint16_t page_num, uint8_t *buf, uint32_t buf_size)
{
    if (!s_file || page_num >= s_page_count || !buf) return 0;

    const kb_page_entry_t *pe = &s_pages[page_num];
    if (pe->size == 0) return 0;
    if (pe->size > buf_size) {
        ESP_LOGE(TAG, "page %u: %lu > buf %lu",
                 page_num, (unsigned long)pe->size, (unsigned long)buf_size);
        return 0;
    }

    fseek(s_file, pe->offset, SEEK_SET);
    size_t rd = fread(buf, 1, pe->size, s_file);
    if (rd != pe->size) {
        ESP_LOGE(TAG, "page %u: read %u/%lu",
                 page_num, (unsigned)rd, (unsigned long)pe->size);
        return 0;
    }

    return (uint32_t)rd;
}

const kb_asset_entry_t *kb_find_asset(uint8_t type, uint8_t index)
{
    for (uint16_t i = 0; i < s_asset_count; i++) {
        if (s_assets[i].type == type && s_assets[i].index == index) {
            return &s_assets[i];
        }
    }
    return NULL;
}

uint32_t kb_load_asset(uint8_t type, uint8_t index, uint8_t *buf, uint32_t buf_size)
{
    if (!s_file || !buf) return 0;

    const kb_asset_entry_t *ae = kb_find_asset(type, index);
    if (!ae) return 0;
    if (ae->size > buf_size) {
        ESP_LOGE(TAG, "asset t=%u i=%u: %lu > buf %lu",
                 type, index, (unsigned long)ae->size, (unsigned long)buf_size);
        return 0;
    }

    fseek(s_file, ae->offset, SEEK_SET);
    size_t rd = fread(buf, 1, ae->size, s_file);
    if (rd != ae->size) {
        ESP_LOGE(TAG, "asset t=%u i=%u: read %u/%lu",
                 type, index, (unsigned)rd, (unsigned long)ae->size);
        return 0;
    }

    return (uint32_t)rd;
}

uint16_t kb_get_chapter_page(uint8_t chapter_idx)
{
    if (!s_file || chapter_idx >= s_chapter_count) return 0;
    return s_chapters[chapter_idx];
}
