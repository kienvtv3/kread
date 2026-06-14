# kread-master

Workspace chứa project kread và các firmware tham khảo cho Xteink X4.

## Structure

- `kread/` — Project chính. Xem `kread/CLAUDE.md` để biết chi tiết.
- `crosspoint/` — CrossPoint Reader (C++, Arduino-ESP32). Firmware gốc mà Papyrix fork từ đó.
- `papyrix/` — Papyrix Reader (C++, Arduino-ESP32). Fork của CrossPoint, thêm multi-format, Knuth-Plass line breaking, dual-boot system.
- `ternos/` — TernOS (Rust). Platform abstraction, Palm OS emulation, binary serial protocol.

## Reference Notes

Các project tham khảo **chỉ để đọc**, không sửa. Mọi code mới viết trong `kread/`.

Điểm đáng học từ mỗi project:
- **CrossPoint**: Activity lifecycle, HAL pattern, ESP32-C3 pitfalls, resource protocol (380KB RAM)
- **Papyrix**: State machine with pre-allocated states, dual-boot (UI/Reader mode), PageCache, streaming fonts, Knuth-Plass
- **TernOS**: Binary framed serial protocol (MAGIC+CRC32), platform abstraction traits, USB mode UI flow

## Environment

- PlatformIO: `PLATFORMIO_CORE_DIR=C:\pio` (tránh dấu cách trong user path)
- CLI: `C:\Users\Kien Vu\.platformio\penv\Scripts\pio.exe`
- Device: Xteink X4 on COM7 @ 115200 baud
