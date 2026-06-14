/**
 * serial.h - KREAD serial protocol handler
 */

#ifndef SERIAL_H
#define SERIAL_H

#include <stdint.h>
#include <stdbool.h>

// Initialize serial communication
void serial_init(void);

// Poll for incoming serial data (call from main loop)
void serial_poll(void);

// Send responses
void serial_send_ok(void);
void serial_send_ready(void);
void serial_send_error(const char *reason);
void serial_send_info(void);
void serial_send_files(void);

#endif // SERIAL_H
