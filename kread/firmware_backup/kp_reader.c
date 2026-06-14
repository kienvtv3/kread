#include "kp_reader.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <x4/x4.h>
#include "lz4.h"
#include "esp_log.h"

static const char *TAG = "kp";

static uint8_t *decompress_block(FILE *f, uint32_t comp_size_from_hdr, uint32_t plane_size, bool read_size)
{
    uint32_t comp_size = comp_size_from_hdr;
    if (read_size) {
        if (fread(&comp_size, 4, 1, f) != 1) return NULL;
    }

    uint8_t *comp = malloc(comp_size);
    if (!comp) { ESP_LOGE(TAG, "OOM comp %lu", comp_size); return NULL; }
    fread(comp, 1, comp_size, f);

    uint8_t *plane = malloc(plane_size);
    if (!plane) { free(comp); return NULL; }

    int dec = LZ4_decompress_safe((const char *)comp, (char *)plane, comp_size, plane_size);
    free(comp);
    if (dec < 0) { ESP_LOGE(TAG, "LZ4 fail: %d", dec); free(plane); return NULL; }

    return plane;
}

bool kp_display_file(const char *path, bool use_half)
{
    FILE *f = fopen(path, "rb");
    if (!f) {
        ESP_LOGE(TAG, "Cannot open %s", path);
        return false;
    }

    kp_header_t hdr;
    if (fread(&hdr, sizeof(hdr), 1, f) != 1) {
        ESP_LOGE(TAG, "Cannot read header");
        fclose(f);
        return false;
    }

    if (hdr.magic[0] != 0x4B || hdr.magic[1] != 0x50 ||
        hdr.magic[2] != 0x00 || hdr.magic[3] != 0x01) {
        ESP_LOGE(TAG, "Invalid magic");
        fclose(f);
        return false;
    }

    ESP_LOGI(TAG, "kp: %dx%d, %d-bit, compression=%d, data=%u bytes",
             hdr.width, hdr.height, hdr.bit_depth, hdr.compression,
             (unsigned)hdr.data_size);

    uint32_t plane_size = (uint32_t)((hdr.width + 7) / 8) * hdr.height;

    if (hdr.bit_depth == 2) {
        // ============================================================
        // 2-bit grayscale:
        //   1. FAST refresh B&W base (dual buffer swaps after this)
        //   2. Grayscale overlay with custom LUT
        //   3. Modify framebuffer_active to zero gray pixels
        //      → next page's FAST writes RED from framebuffer_active
        //      → gray positions get RED=0, BW=1(white) → transition → clean!
        // ============================================================
        uint8_t *lsb = NULL, *msb = NULL;

        if (hdr.compression == 1) {
            lsb = decompress_block(f, 0, plane_size, true);
            if (!lsb) { fclose(f); return false; }
            msb = decompress_block(f, 0, plane_size, true);
            if (!msb) { free(lsb); fclose(f); return false; }
        } else {
            lsb = malloc(plane_size);
            msb = malloc(plane_size);
            if (!lsb || !msb) { free(lsb); free(msb); fclose(f); return false; }
            fread(lsb, 1, plane_size, f);
            fread(msb, 1, plane_size, f);
        }
        fclose(f);

        // Transform in-place — derive B&W base and grayscale planes
        uint8_t *fb = x4_display_framebuffer();
        for (uint32_t i = 0; i < plane_size; i++) {
            uint8_t l = lsb[i], m = msb[i];
            fb[i]  = ~(l & m);     // B&W: val=3 → black, else white
            lsb[i] = m & ~l;       // gs BW plane: val=2 → L2
            msb[i] = l & ~m;       // gs RED plane: val=1 → L1
        }

        // Step 1: Refresh B&W base (HALF for ghost clear, FAST for normal)
        // After this, dual buffer swaps: fb now points to framebuffer_active
        x4_display_grayscale_cancel();
        x4_display_update(use_half ? X4_REFRESH_HALF : X4_REFRESH_FAST, false);

        // Step 2: Grayscale overlay
        x4_display_grayscale_lsb(lsb);
        x4_display_grayscale_msb(msb);
        x4_display_grayscale_refresh(false);

        // Step 3: Zero gray pixels in framebuffer_active (fb after swap)
        // Next FAST: RED[gray_pos]=0, BW[gray_pos]=1(white) → transition → clean
        for (uint32_t i = 0; i < plane_size; i++) {
            uint8_t gray_mask = lsb[i] | msb[i];
            fb[i] &= ~gray_mask;
        }
        x4_display_grayscale_cancel();

        free(lsb);
        free(msb);

        ESP_LOGI(TAG, "Displayed 2-bit grayscale");
        return true;

    } else if (hdr.bit_depth == 1) {
        uint8_t *plane = NULL;

        if (hdr.compression == 1) {
            plane = decompress_block(f, hdr.data_size, plane_size, false);
        } else {
            plane = malloc(plane_size);
            if (plane) fread(plane, 1, plane_size, f);
        }
        fclose(f);
        if (!plane) return false;

        memcpy(x4_display_framebuffer(), plane, plane_size);
        free(plane);
        x4_display_update(use_half ? X4_REFRESH_HALF : X4_REFRESH_FAST, false);

        ESP_LOGI(TAG, "Displayed 1-bit B&W");
        return true;
    }

    fclose(f);
    return false;
}
