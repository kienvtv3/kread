#ifndef BOOKS_H
#define BOOKS_H

#include <stdint.h>

#define MAX_BOOKS 32

typedef struct {
    char path[64];       /* e.g. "/sd/library/book.kb" */
    char title[128];
    char author[64];
    uint16_t page_count;
    uint8_t chapter_count;
    uint8_t progress;    /* 0-100 reading progress */
    uint16_t current_page; /* last-read page index */
} book_info_t;

/* Shared book state — owned by home.c */
extern book_info_t books[];
extern int book_count;
extern int current_book;

#endif
