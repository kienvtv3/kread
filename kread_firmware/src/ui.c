#include "ui.h"
#include "home.h"
#include "reader.h"
#include "library.h"
#include "settings.h"
#include "book_menu.h"
#include "book_chapters.h"
#include "esp_log.h"
#include <x4/display.h>

static const char *TAG = "ui";

// Shared framebuffers — point to display driver's static buffers.
// Screens render here, then call x4_display_render_grayscale(ui_fb_bw, ui_fb_gs, FULL).
// FULL refresh doesn't need separate tracking → safe to render in-place.
uint8_t *ui_fb_bw = NULL;
uint8_t *ui_fb_gs = NULL;

// --- Stub screen for unimplemented states ---

static void stub_enter(void) {}
static ui_state_t stub_update(x4_input_event_t *evt)
{
    (void)evt;
    return STATE_HOME;  // any button in stub state → back to HOME
}
static void stub_render(void) {}
static void stub_exit(void) {}

// --- Screen table ---

static const ui_screen_t screens[STATE_COUNT] = {
    [STATE_HOME]               = { home_enter, home_update, home_render, home_exit },
    [STATE_LIBRARY]            = { library_enter, library_update, library_render, library_exit },
    [STATE_BOOK]               = { reader_enter, reader_update, reader_render, reader_exit },
    [STATE_BOOK_MENU]          = { book_menu_enter, book_menu_update, book_menu_render, book_menu_exit },
    [STATE_BOOK_CHAPTERS]      = { book_chapters_enter, book_chapters_update, book_chapters_render, book_chapters_exit },
    [STATE_GALLERY_LIST]       = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_GALLERY_THUMBNAIL]  = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_GALLERY_FULLSCREEN] = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_SETTINGS]           = { settings_enter, settings_update, settings_render, settings_exit },
    [STATE_SETTINGS_DEVICE]    = { stub_enter, stub_update, stub_render, stub_exit },
    [STATE_SETTINGS_FIRMWARE]  = { stub_enter, stub_update, stub_render, stub_exit },
};

static ui_state_t current_state;

void ui_init(void)
{
    // Get framebuffers from display driver (static BSS, no heap allocation)
    x4_display_get_framebuffers(&ui_fb_bw, &ui_fb_gs);
    ESP_LOGI(TAG, "Using display framebuffers: bw=%p gs=%p", ui_fb_bw, ui_fb_gs);

    current_state = STATE_HOME;
    ESP_LOGI(TAG, "init: entering HOME");
    screens[current_state].enter();
    screens[current_state].render();
}

void ui_update(void)
{
    x4_input_event_t evt;
    while (x4_input_next_event(&evt)) {
        ui_state_t next = screens[current_state].update(&evt);
        if (next != current_state && next < STATE_COUNT) {
            ESP_LOGI(TAG, "transition: %d -> %d", current_state, next);
            screens[current_state].exit();
            current_state = next;
            screens[current_state].enter();
            screens[current_state].render();
        }
    }
}

ui_state_t ui_current_state(void)
{
    return current_state;
}
