#ifndef SETTINGS_H
#define SETTINGS_H

#include "ui.h"

void settings_enter(void);
ui_state_t settings_update(x4_input_event_t *evt);
void settings_render(void);
void settings_exit(void);

#endif
