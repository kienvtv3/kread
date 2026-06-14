# KREAD Serial Protocol v1.0

USB Serial @ 115200 baud, 8N1

## Commands (Host → Device)

### File Transfer
```
KREAD_START <filename> <filesize>\n    → Device replies KREAD_READY
[binary data in chunks]                 → Device writes to SD
KREAD_END <crc32>\n                     → Device replies KREAD_OK or KREAD_ERROR
```

### File Management
```
KREAD_LIST\n                            → List all files on SD
KREAD_DELETE <filename>\n               → Delete a file
KREAD_INFO\n                            → Device info (fw version, SD free space)
KREAD_EXISTS <filename>\n               → Check if file exists
```

## Responses (Device → Host)

```
KREAD_READY\n                           → Ready to receive data
KREAD_OK\n                              → Command successful
KREAD_ERROR <reason>\n                  → Command failed
KREAD_INFO <json>\n                     → Device info response
KREAD_FILES <json>\n                    → File list response
```

## Example Flow

### List files on device
```
Host:   KREAD_LIST\n
Device: KREAD_FILES {"files":[{"name":"book1.kb","size":15234567},{"name":"passes.kb","size":45678}],"free":1234567890}\n
```

### Upload a book
```
Host:   KREAD_START mybook.kb 18432000\n
Device: KREAD_READY\n
Host:   [binary data, 4KB chunks]
Device: (silence, writing to SD)
Host:   KREAD_END a3f2c1b0\n
Device: KREAD_OK\n
```

### Get device info
```
Host:   KREAD_INFO\n
Device: KREAD_INFO {"fw":"1.0.0","sd_total":32000000000,"sd_free":28500000000,"current_book":"book1.kb","page":42}\n
```

### Delete a file
```
Host:   KREAD_DELETE oldbook.kb\n
Device: KREAD_OK\n
```

### Check if file exists
```
Host:   KREAD_EXISTS mybook.kb\n
Device: KREAD_OK\n           (exists)
Device: KREAD_ERROR not_found\n  (doesn't exist)
```

## Chunk Size

- Recommended: 4096 bytes per chunk
- Device buffers and writes to SD
- No ACK per chunk (faster transfer)
- CRC32 verification at end

## Error Codes

| Code | Meaning |
|------|---------|
| `crc_mismatch` | File corrupted during transfer |
| `sd_full` | Not enough space on SD |
| `sd_error` | SD card read/write error |
| `not_found` | File doesn't exist |
| `invalid_cmd` | Unknown command |
| `busy` | Device busy (e.g., during transfer) |
