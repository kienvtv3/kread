#ifndef READER_H
#define READER_H

#include "ui.h"

void reader_enter(void);
ui_state_t reader_update(x4_input_event_t *evt);
void reader_render(void);
void reader_exit(void);

#endif
