#ifndef UI_H
#define UI_H

#include <x4/input.h>

typedef enum {
    STATE_HOME,
    STATE_LIBRARY,
    STATE_BOOK,
    STATE_BOOK_MENU,
    STATE_BOOK_CHAPTERS,
    STATE_GALLERY_LIST,
    STATE_GALLERY_THUMBNAIL,
    STATE_GALLERY_FULLSCREEN,
    STATE_SETTINGS,
    STATE_SETTINGS_DEVICE,
    STATE_SETTINGS_FIRMWARE,
    STATE_COUNT
} ui_state_t;

typedef struct {
    void (*enter)(void);
    ui_state_t (*update)(x4_input_event_t *evt);
    void (*render)(void);
    void (*exit)(void);
} ui_screen_t;

// Shared framebuffers (heap-allocated by ui_init, used by all screens)
extern uint8_t *ui_fb_bw;
extern uint8_t *ui_fb_gs;

// Initialize UI: allocate framebuffers, set initial state, render first screen
void ui_init(void);

// Process input events and dispatch to current state
void ui_update(void);

// Get current state (for debugging)
ui_state_t ui_current_state(void);

#endif
