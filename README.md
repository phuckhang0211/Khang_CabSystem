# CABSYSTEM_API

## Giả định và mâu thuẫn đặc tả

- SPEC §3.3 quy định trạng thái xác minh Driver là `REJECTED`, trong khi proto trước đó dùng `DRIVER_REJECTED`. Theo quy tắc ưu tiên SPEC, proto và mapping Driver dùng `REJECTED`.
- SPEC §3.3 quy định trạng thái Payment là `PENDING`, `COMPLETED`, `FAILED`, trong khi proto trước đó có hậu tố khác. Theo quy tắc ưu tiên SPEC, proto dùng đúng ba giá trị này.
