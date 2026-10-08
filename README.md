# CABSYSTEM_API

## Giả định và mâu thuẫn đặc tả

- SPEC §3.3 quy định trạng thái xác minh Driver là `REJECTED`, trong khi proto trước đó dùng `DRIVER_REJECTED`. Theo quy tắc ưu tiên SPEC, proto và mapping Driver dùng `REJECTED`.
- SPEC §3.3 quy định trạng thái Payment là `PENDING`, `COMPLETED`, `FAILED`, trong khi proto trước đó có hậu tố khác. Theo quy tắc ưu tiên SPEC, proto dùng đúng ba giá trị này.
- T22: lỗi tạm thời khi Booking consumer xử lý event được thử lại tối đa 3 lần trong tiến trình; khi hết lượt chỉ ghi log và ack, không dùng DLQ/retry queue. Lỗi tìm Driver sau các lượt thử chuyển Booking sang `NO_DRIVER_FOUND` để không bị kẹt ở `SEARCHING_DRIVER`.
- T26: proto Trip ban đầu thiếu các field tọa độ trực tiếp và mốc thời gian mà SPEC §8.6 yêu cầu trả ra; bổ sung field 16..23 trong `Trip` để REST hiển thị `lastLat/lastLng`, `endLat/endLng`, `arrivedAt/startedAt/completedAt`.
- T27: proto Trip ban đầu thiếu `canceledAt`, `canceledBy`, `cancelReason` để trả kết quả hủy theo SPEC §8.6; bổ sung field 24..26. Reason được kiểm tra 5..200 ký tự trước khi escape HTML và phải còn vừa cột 200 ký tự sau khi escape.
- T28: Customer gọi Trip qua `TRIP_GRPC_ADDR` và deadline, nhưng không thêm `depends_on` vì Auth đã phụ thuộc Customer, còn Trip phụ thuộc Driver rồi Auth; thêm cạnh Customer → Trip sẽ tạo vòng khởi động. Gateway trả danh sách Review trong `data.items` theo yêu cầu nghiệm thu T28, khác mẫu mảng `data` chung tại SPEC §3.4.
