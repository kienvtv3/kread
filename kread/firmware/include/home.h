#ifndef HOME_H
#define HOME_H

#include "ui.h"

void home_enter(void);
ui_state_t home_update(x4_input_event_t *evt);
void home_render(void);
void home_exit(void);

/* Scan SD card for .kb files and populate the book list.
 * Called from home_enter(), but can also be called earlier (e.g. from main). */
void home_scan_books(void);

#endif
