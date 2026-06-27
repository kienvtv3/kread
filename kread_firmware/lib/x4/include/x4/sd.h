#ifndef X4_SD_H
#define X4_SD_H

#include <stdbool.h>

typedef struct {
    const char *mount_point;
} x4_sd_config_t;

#define X4_SD_CONFIG_DEFAULT { "/sd" }

bool x4_sd_init(const x4_sd_config_t *config);
void x4_sd_deinit(void);
bool x4_sd_mounted(void);

#endif
