#ifndef LIBRARY_H
#define LIBRARY_H

#include "ui.h"

void library_enter(void);
ui_state_t library_update(x4_input_event_t *evt);
void library_render(void);
void library_exit(void);

#endif
