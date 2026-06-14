#ifndef X4_H
#define X4_H

#include <x4/display.h>
#include <x4/input.h>
#include <x4/sd.h>
#include <x4/power.h>

typedef struct {
    x4_input_config_t   input;
    x4_sd_config_t      sd;
} x4_config_t;

void x4_init(const x4_config_t *config);

#endif
