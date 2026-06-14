#ifndef BOOK_MENU_H
#define BOOK_MENU_H

#include "ui.h"

void book_menu_enter(void);
ui_state_t book_menu_update(x4_input_event_t *evt);
void book_menu_render(void);
void book_menu_exit(void);

#endif
