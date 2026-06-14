#ifndef BOOK_CHAPTERS_H
#define BOOK_CHAPTERS_H

#include "ui.h"

void book_chapters_enter(void);
ui_state_t book_chapters_update(x4_input_event_t *evt);
void book_chapters_render(void);
void book_chapters_exit(void);

#endif
