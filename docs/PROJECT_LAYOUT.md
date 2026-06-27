# Project layout (kread-master)

Git root hiện tại:
- `D:\Projects\kread-master`

Mã thực thi nằm trong hai phần chính:
- `kread_web` (Svelte web converter)
- `kread_firmware` (ESP32 firmware)
- `docs` (tài liệu kỹ thuật)
- `kread_firmware/firmware_backup` (file backup firmware)
- `AGENTS.md` (ghi chú nội bộ)

Top-level metadata/support:
- `design`, `docs`, `images`.

Chạy web:
```powershell
cd D:\Projects\kread-master\kread_web
npm install
npm run dev
```

Lưu ý: URL mặc định `http://localhost:5173/`

