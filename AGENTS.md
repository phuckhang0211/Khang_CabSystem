# AGENTS.md - Hướng dẫn bắt buộc cho Codex (CABSYSTEM_API)

> **ĐỌC FILE NÀY TRƯỚC KHI VIẾT BẤT KỲ DÒNG CODE NÀO.**
> File này là "luật làm việc". Nội dung nghiệp vụ chi tiết nằm ở `SPEC.md` (nguồn sự thật duy nhất).
> Nếu AGENTS.md và SPEC.md mâu thuẫn → **SPEC.md thắng**, và ghi mâu thuẫn vào README.

---

## 1. Thứ tự đọc bắt buộc (trước khi code)

1. `AGENTS.md` (file này).
2. `SPEC.md` **§0** (quy tắc bắt buộc) → **§16** (các quyết định bổ sung, đọc trước khi code) → **§15** (thứ tự build + Definition of Done).
3. Khi làm từng phần, đọc đúng mục tương ứng trong SPEC.md **trước khi** viết code cho phần đó:

| Đang làm | Đọc mục |
|---|---|
| Khung dự án, compose, env | §2, §4 |
| Proto / gRPC | §3.5, §3.6, §5 |
| Event / RabbitMQ | §6 |
| Schema SQL | §7 |
| Logic service | §8 (8.1 Auth ... 8.7 Notify) |
| Gateway, RBAC, rate limit | §9 |
| Luồng, trạng thái, ngoại lệ, BR | §10, §11 |
| Seed | §12 |
| Bảo mật | §3.7, §13 |
| Postman, TC01..TC30 | §14 |

Không code theo trí nhớ hay theo "cách thường làm". Mọi con số, tên field, mã lỗi, tên bảng, routing key phải lấy từ SPEC.md.

---

## 2. Dự án là gì (tóm tắt 6 dòng)

- Đồ án môn MSA (IUH): **chỉ backend API**, kiểm chứng bằng Postman smoke test. Không frontend, không production.
- Gateway REST (Express) + **7 microservice**: `auth, customer, driver, booking, trip, payment, notify`.
- Đồng bộ: **gRPC + protobuf**. Bất đồng bộ: **RabbitMQ** topic exchange `ride.events`.
- Mỗi service có **1 container PostgreSQL riêng** (7 DB), cộng Redis + RabbitMQ → tổng **17 container**.
- Node.js 20 (`node:20-alpine`), **CommonJS**, một lệnh chạy: `docker compose up --build`.
- Thanh toán chỉ **MOCK**, trả tiền **trước** khi tìm tài xế.

---

## 3. Luật vàng (vi phạm = sai đề)

1. **Chỉ làm đúng những gì có trong SPEC.md.** Không tự thêm tính năng, service, bảng, endpoint, event, thư viện nghiệp vụ. Thiếu thông tin → chọn phương án **đơn giản nhất** và ghi vào README (mục "Giả định").
2. **Không làm** những thứ ngoài phạm vi (SPEC §1.2, BR23): WebSocket/Socket.IO, refresh token, cổng thanh toán thật, refund, phí hủy, timeout thanh toán, worker/cron nền, Transactional Outbox, `processed_events`, DLQ, retry queue, circuit breaker, mTLS, email/SMS thật, frontend, cập nhật vị trí định kỳ, TTL/stale-check vị trí tài xế.
3. **Không hard-code** config/secret/URL/port. Mọi thứ đọc từ biến môi trường qua `src/config/index.js`; thiếu biến bắt buộc → log lỗi rõ ràng và `process.exit(1)`.
4. **Không service nào query DB của service khác.** Không FK xuyên DB, không JOIN xuyên DB. ID xuyên service chỉ là logical reference.
5. **Không tạo bảng/cột/index ngoài danh sách ở SPEC §7.**
6. Mọi SQL dùng **parameterized query** (`$1, $2...`). Tuyệt đối không nối chuỗi vào SQL.
7. Không log password/token/PII. Không trả stack trace/SQL/chi tiết nội bộ ra client.
8. Không commit secret. `.env` nằm trong `.gitignore`; `.env.example` đủ biến.

---

## 4. Các bất biến kỹ thuật phải nhớ (hay sai nhất)

### 4.1 Định danh
- `customerId` / `customer_id` **ở mọi nơi** = Auth `users.id` = JWT `sub` = metadata `x-user-id`. **Không bao giờ** dùng `customer_profiles.id` ra ngoài `customer_db`.
- `driverId` = `driver_profiles.id`; `driverUserId` = `driver_profiles.user_id` (= Auth user id).
- UUID sinh ở service bằng `crypto.randomUUID()`; **không** dùng `DEFAULT gen_random_uuid()`.

### 4.2 gRPC
- Package `cab.<service>.v1`. Proto dùng `snake_case`, JS dùng `camelCase` (loader: `keepCase:false, longs:Number, enums:String, defaults:true, oneofs:true`).
- Gateway gắn vào mọi call: `x-correlation-id`, `x-user-id`, `x-user-role` (từ JWT đã verify), `x-service-token`.
- Service **từ chối `UNAUTHENTICATED`** nếu `x-service-token` thiếu/sai (kể cả Health).
- **Danh tính người gọi luôn lấy từ metadata**, không tin field trong body. Cuộc gọi không có `x-user-id` = nội bộ tin cậy (bỏ qua ownership).
- Lỗi nghiệp vụ: ném gRPC status + **trailer `error-code`**. Xung đột trạng thái dùng `ABORTED` (→409); chỉ offer hết hạn dùng `FAILED_PRECONDITION` (→410).
- Deadline mỗi RPC = `GRPC_DEADLINE_MS`.
- gRPC port **không bao giờ** publish ra host (kể cả file debug).

### 4.3 RabbitMQ
- Producer: **ghi DB → COMMIT → publish** (`persistent:true`). Publish lỗi chỉ log.
- Consumer: `prefetch(10)`, manual ack sau khi xử lý xong; lỗi không phục hồi → log + `nack(requeue=false)`. Luôn đọc **state hiện tại** và chỉ đổi trạng thái khi điều kiện còn đúng (event lặp không gây tác động lần hai).
- Routing key = `eventType`. Envelope đúng như SPEC §6. Tự `assertExchange/assertQueue/bindQueue` khi khởi động.
- Queue: `booking.q`, `trip.q`, `notify.q` với binding đúng bảng SPEC §6.

### 4.4 Dữ liệu
- `pg` trả BIGINT/NUMERIC dạng **string** → luôn `Number(...)` trước khi trả ra (fare, amount, distanceKm).
- Dùng **conditional UPDATE** (`WHERE id=$1 AND status=$2`) để chống race; 0 dòng bị ảnh hưởng → xử lý theo SPEC.
- Redis giữ chỗ tài xế bằng **Lua atomic** (TryAssign / Release) như SPEC §8.3.
- Mọi timestamp trả ra là chuỗi ISO-8601 UTC. Tiền là số nguyên VND.

### 4.5 Bảo mật
- Mã hóa AES-256-GCM, định dạng `v1:<iv_b64>:<tag_b64>:<cipher_b64>`; tra cứu bằng blind index HMAC-SHA256.
- `escapeHtml` **trước khi lưu** cho: displayName, fullName, address, comment, cancel/reject reason, vehicle brand/model/color.
- bcryptjs cost ≥ 10; JWT HS256 whitelist (`algorithms:['HS256']`), kiểm `exp`, từ chối `alg=none`.
- Callback payment: HMAC-SHA256 `"{paymentId}|{providerTxnId}|{amount}|{result}"`, so sánh bằng `crypto.timingSafeEqual`.

### 4.6 REST
- Prefix `/api/v1`; `/health`, `/ready`, `/health/services` phục vụ ở **cả** `/` và `/api/v1`, **không bị rate limit**.
- Thành công `{ "data": ... }`; phân trang kèm `pagination{page,limit,total,totalPages}`; lỗi `{ "error":{code,message,correlationId} }`.
- Mọi response có header `x-correlation-id`.
- Thứ tự middleware Gateway: `correlationId → helmet → express.json(100kb) → rateLimit → auth(JWT) → rbac → validate → controller`.
- `POST /bookings` **bắt buộc** header `Idempotency-Key`.

---

## 5. Cấu trúc bắt buộc

- Đúng cây thư mục ở SPEC §2 (`gateway/`, `services/<x>-service/`, `contracts/proto/`, `scripts/`, `postman/`, `huong-dan-test/`).
- Mỗi service chia lớp: `grpc` (handler) → `services` (nghiệp vụ) → `repositories` (SQL/Redis); thêm `events`, `config`, `utils`, `db`. Handler **không** chứa SQL; repository **không** chứa nghiệp vụ.
- Mỗi service có `package.json`, `Dockerfile`, `migrations/schema.sql` (idempotent, chạy khi khởi động), `src/server.js`, `src/healthcheck.js` riêng. Chỉ chia sẻ file `.proto`.
- Khởi động service: retry kết nối Postgres/Redis/RabbitMQ (~30 lần, cách 2s) → chạy migration → mở gRPC → start consumer. Tắt êm khi SIGTERM.
- Log JSON một dòng: `{ts, level, service, correlationId, msg}`.
- Mỗi container chỉ nhận **biến môi trường của chính nó** (Gateway không nhận DB URL nào).

---

## 6. Quy trình làm việc

Làm **tuần tự** theo SPEC §15.1 (10 bước). Quy tắc:

1. Trước mỗi bước: đọc lại mục SPEC liên quan (bảng §1 ở trên).
2. Làm xong một bước phải **chạy được** (`docker compose up --build`, healthcheck xanh, gọi thử endpoint bằng curl/Postman) rồi mới sang bước sau. Không dồn kiểm thử về cuối.
3. Mỗi bước kết thúc bằng một **tự kiểm tra** ngắn: liệt kê endpoint/RPC/event đã làm và đối chiếu với SPEC (tên, mã lỗi, trạng thái).
4. Nếu repo có `TASKS.md`, cập nhật tiến độ sau mỗi bước.
5. Gặp điểm mơ hồ: **đừng tự sáng tạo**. Chọn phương án đơn giản nhất, ghi vào README mục "Giả định", và tiếp tục.
6. Không refactor/đổi cấu trúc đã chốt, không đổi tên field/enum/route/mã lỗi so với SPEC.

---

## 7. Checklist tự kiểm tra trước khi báo "xong"

- [ ] `docker compose up --build` chạy sạch; `docker compose ps` đủ **17 container** (gateway, 7 service, 7 DB, redis, rabbitmq), healthy.
- [ ] `docker-compose.debug.yml` chỉ **thêm `ports`** (DB 5433-5439, Redis 6379); 50051-50057 vẫn không truy cập được từ host.
- [ ] Chế độ thường chỉ publish gateway `3000` và RabbitMQ UI `15672`.
- [ ] `/health`, `/ready`, `/health/services` đúng SPEC §4.4 (dừng 1 service → 503).
- [ ] Luồng đặt xe đầy đủ SPEC §10.1 chạy được; nhánh FAIL và nhánh cancel đúng.
- [ ] Seed idempotent, chạy lặp không lỗi; số liệu TC14 đúng (Customer1 total=6, totalPages=2 khi limit=3, COMPLETED=2, xem booking 307 → 403).
- [ ] Idempotency: cùng key+body → cùng bookingId/paymentId + `Idempotent-Replayed:true`; khác body → 422. Callback lặp không publish lần hai.
- [ ] Không có WebSocket, refresh token, refund, outbox, DLQ, retry, worker nền, cổng thanh toán ngoài.
- [ ] Không secret trong git; `.env.example` đủ biến; `.env` có giá trị dev chạy được ngay.
- [ ] Đủ `huong-dan-test/TC01.md ... TC30.md` + Postman collection + environment khớp SPEC §14.
- [ ] README: cách chạy, chạy debug/seed, cách xoay khóa mã hóa, lưu ý rate limit khi chạy Postman Runner, mục "Giả định".

---

## 8. Những lỗi thường gặp cần tránh

- Dùng `customer_profiles.id` thay vì Auth `user_id` làm `customerId`.
- Tạo Trip **trước** khi driver accept (Trip chỉ tạo khi consume `booking.assigned`).
- Matching khi Payment chưa `COMPLETED`; hoặc tạo offer khi booking đã `CANCELED`.
- Publish event **trước** COMMIT.
- Quên `Number()` cho BIGINT/NUMERIC → trả string ra REST.
- Quên `escapeHtml` trước khi lưu; nối chuỗi vào SQL.
- Tin `userId` trong body thay vì metadata `x-user-id`.
- Cho driver `BUSY` xuống `OFFLINE` (phải 409 `DRIVER_BUSY`).
- `UpdateTripLocation` khi trip chưa `IN_PROGRESS` (phải 409).
- Thêm EXPIRE/TTL cho vị trí tài xế trong Redis.
- Trả `userId`/`licenseNumber` của Driver ra REST cho Customer (chỉ trả safe fields).
- Publish port gRPC hoặc DB ở chế độ không debug.
- Để Reject offer kích hoạt tìm tài xế mới (không được - booking giữ `SEARCHING_DRIVER`).
