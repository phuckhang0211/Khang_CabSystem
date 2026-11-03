# SPEC.md - CABSYSTEM_API: Backend đặt xe trực tuyến (Microservices, gRPC + RabbitMQ)

> Tài liệu đặc tả để AI (Codex) sinh toàn bộ source dự án. Đây là nguồn sự thật duy nhất.
> Nguồn gốc: file nghiệp vụ "Nghiep_vu_he_thong_dat_xe_gRPC_RabbitMQ_FINAL_PAYMENT_FIRST_MOCK_CUSTOMER_ID_FIX_CLEAN_V2.docx". Những chỗ nguồn còn thiếu đã được chốt ở **§16** (đọc §16 trước khi code).

---

## 0. Quy tắc bắt buộc dành cho Codex

1. **Chỉ làm đúng những gì có trong file này.** Không tự thêm tính năng, service, bảng, endpoint, event, thư viện nghiệp vụ. Nếu thấy thiếu, chọn phương án đơn giản nhất và ghi vào README.
2. Đồ án môn MSA (IUH): **chỉ backend API**, không frontend, không đặt mục tiêu production. Kiểm chứng bằng **Postman smoke test**.
3. **Không hard-code** cấu hình/secret/URL/port. Mọi thứ đọc từ biến môi trường qua `src/config/index.js` (thiếu biến bắt buộc → báo lỗi rõ ràng và thoát).
4. Mỗi service chia lớp rõ ràng: `grpc` (handler) → `services` (nghiệp vụ) → `repositories` (SQL/Redis) ; thêm `events`, `config`, `utils`.
5. Tạo sẵn **`.env`** (giá trị dev chạy được ngay, secret sinh ngẫu nhiên) và **`.env.example`** (giá trị mẫu). `.env` nằm trong `.gitignore`.
6. Chạy bằng **một lệnh**: `docker compose up --build` tại thư mục gốc `CABSYSTEM_API`.
7. Tạo thư mục **`huong-dan-test/`** gồm `TC01.md ... TC30.md` (mỗi tiêu chí chấm một file) và `postman/CABSYSTEM_API.postman_collection.json` + environment.
8. Mọi SQL dùng **parameterized query** (`$1, $2...`), tuyệt đối không nối chuỗi.
9. Làm theo thứ tự ở **§15**; mỗi bước phải chạy được trước khi sang bước sau.

---

## 1. Phạm vi

### 1.1 Trong phạm vi
- Gateway REST + **7 microservices**: `auth`, `customer`, `driver`, `booking`, `trip`, `payment`, `notify`.
- Giao tiếp: Client → Gateway (REST/JSON); nội bộ đồng bộ **gRPC + protobuf**; bất đồng bộ **RabbitMQ** (topic exchange `ride.events`).
- Dữ liệu: **mỗi service có 1 container PostgreSQL riêng (tổng 7 container DB: `auth-db, customer-db, driver-db, booking-db, trip-db, payment-db, notify-db`)**, database được tạo tự động khi chạy `docker compose up`; **Redis** cho OTP, rate limit, vị trí/trạng thái tài xế.
- Luồng chính: đăng ký/đăng nhập → tài xế onboarding + admin duyệt → đặt xe (**thanh toán MOCK trước**) → tìm tài xế → tài xế accept → Trip → hoàn thành/hủy → review → notification (polling).

### 1.2 Ngoài phạm vi (KHÔNG làm)
WebSocket/Socket.IO, refresh token, cổng thanh toán thật (VNPAY...), refund, phí hủy, timeout thanh toán, worker/cron nền, Transactional Outbox, `processed_events`, DLQ, retry queue, circuit breaker, mTLS, email/SMS thật, frontend, cập nhật vị trí tài xế định kỳ, TTL/stale-check cho vị trí tài xế.

### 1.3 Vai trò (actor)
| Actor | Chức năng |
|---|---|
| Customer | Đăng ký/đăng nhập; xem/sửa hồ sơ; tạo Booking; thanh toán giả lập; xem Booking/Driver/Trip; hủy; review; xem notification |
| Driver | OTP/onboarding; hồ sơ/xe; ONLINE/OFFLINE; cập nhật location; nhận BOOKING_OFFER qua notification; xem/accept/reject offer; arrive/start/location/complete/cancel trip |
| Admin | Tra cứu Customer/Driver/Booking/Trip/Payment; xem/duyệt/từ chối hồ sơ Driver; xem health |

---

## 2. Kiến trúc và cấu trúc repo

```
CABSYSTEM_API/
├─ docker-compose.yml          # chạy bình thường (không publish port DB)
├─ docker-compose.debug.yml    # override: map port 7 DB (+ redis) ra host để debug/seed
├─ .env                      # tạo sẵn local, KHÔNG commit
├─ .env.example              # commit
├─ .gitignore
├─ README.md
├─ gateway/
│  ├─ src/{routes,controllers,grpc-clients,middlewares,config,utils}/
│  ├─ package.json
│  └─ Dockerfile
├─ services/
│  ├─ auth-service/  customer-service/  driver-service/
│  ├─ booking-service/  trip-service/  payment-service/  notify-service/
│  └─ (mỗi service:)
│     ├─ src/{grpc,services,repositories,events,config,utils,db}/
│     ├─ src/server.js, src/healthcheck.js
│     ├─ migrations/schema.sql        # chạy idempotent khi service khởi động
│     ├─ package.json, Dockerfile
├─ contracts/proto/{common,health,auth,customer,driver,booking,trip,payment,notify}.proto
├─ scripts/{seed.js, lib/}
├─ postman/CABSYSTEM_API.postman_collection.json, CABSYSTEM_API.postman_environment.json
└─ huong-dan-test/TC01.md ... TC30.md
```

Quy tắc repo:
- Mỗi service có `package.json`, dependency, Dockerfile riêng. Chỉ chia sẻ file `.proto` (mount/copy vào image). Không có business state trong thư mục dùng chung.
- **Không service nào query database của service khác.** ID xuyên service chỉ là logical reference (không FK xuyên DB, không JOIN xuyên DB).
- Client chỉ gọi Gateway. Service gRPC **không publish port ra host**.

`.gitignore` tối thiểu: `.env`, `node_modules/`, `dist/`, `logs/`, `*.log`, `*.pem`, `*.key`, `*-db-data/`, `redis-data/`, `rabbitmq-data/`.

---

## 3. Tech stack và quy ước kỹ thuật chung

### 3.1 Stack (chọn tối thiểu, mọi service dùng chung)
- Node.js 20 (image `node:20-alpine`), CommonJS.
- Gateway: `express`, `helmet`, `jsonwebtoken`, `ioredis`, `zod`, `@grpc/grpc-js`, `@grpc/proto-loader`, `amqplib` (chỉ cho health check).
- Service: `@grpc/grpc-js`, `@grpc/proto-loader`, `pg`, `ioredis` (auth, driver), `amqplib` (booking, trip, payment, notify, driver), `zod`, `bcryptjs` (auth), `jsonwebtoken` (auth).
- Proto loader options: `{ keepCase:false, longs:Number, enums:String, defaults:true, oneofs:true }` → proto dùng `snake_case`, code JS dùng `camelCase`.
- Infra images: `postgres:16-alpine`, `redis:7-alpine`, `rabbitmq:3-management-alpine`.
- `pg` trả BIGINT/NUMERIC dạng **string** → luôn ép `Number(...)` trước khi trả ra ngoài (fare, amount, distanceKm).

### 3.2 Định danh (QUAN TRỌNG)
- UUID sinh ở service (`crypto.randomUUID()`), không dùng default của DB.
- **`customerId` / `customer_id` ở mọi nơi (RPC, event, Booking, Payment, Trip, Review, Notification, idempotency) = Auth `users.id` = JWT `sub` = gRPC metadata `x-user-id`.** `customer_profiles.id` chỉ dùng nội bộ `customer_db`, **không bao giờ truyền ra ngoài**.
- `driverId` = `driver_profiles.id` (dùng trong Booking/Offer/Trip/Redis). `driverUserId` = `driver_profiles.user_id` (= Auth user id, dùng để gửi notification và so với `x-user-id`).

### 3.3 Enum chuẩn
| Đối tượng | Giá trị |
|---|---|
| Auth account status | PENDING, ACTIVE, REJECTED |
| Role | CUSTOMER, DRIVER, ADMIN |
| Driver verification | PENDING_REVIEW, APPROVED, REJECTED |
| Driver work_status | ONLINE, OFFLINE |
| Driver availability | AVAILABLE, BUSY |
| Booking | PAYMENT_PENDING, PAYMENT_FAILED, SEARCHING_DRIVER, DRIVER_ASSIGNED, NO_DRIVER_FOUND, CANCELED, COMPLETED |
| Offer | PENDING, ACCEPTED, REJECTED, SUPERSEDED |
| Trip | DRIVER_ARRIVING, DRIVER_ARRIVED, IN_PROGRESS, COMPLETED, CANCELED |
| Trip payment_status | PAID (duy nhất) |
| Payment | PENDING, COMPLETED, FAILED |
| Notification status | UNREAD, READ |
| Notification type | BOOKING_OFFER, BOOKING_ASSIGNED, OFFER_CLOSED, BOOKING_CANCELED, TRIP_ARRIVED, TRIP_STARTED, TRIP_COMPLETED, TRIP_CANCELED, PAYMENT_COMPLETED, PAYMENT_FAILED, DRIVER_APPROVED, DRIVER_REJECTED |

### 3.4 Định dạng response REST
- Prefix: `/api/v1`. Riêng `/health`, `/ready`, `/health/services` phục vụ ở **cả** `/` và `/api/v1`.
- Thành công: `{ "data": ... }`. Danh sách phân trang:
  `{ "data":[...], "pagination":{ "page":1,"limit":10,"total":6,"totalPages":1 } }`.
- Query phân trang: `page` (mặc định 1, ≥1), `limit` (mặc định 10, tối đa 50). Sai → 400 `VALIDATION_ERROR`.
- Lỗi: `{ "error":{ "code":"STATE_CONFLICT","message":"...","correlationId":"uuid" } }`. Không bao giờ lộ stack trace/SQL.
- Mọi response có header `x-correlation-id`.

### 3.5 Mapping lỗi gRPC → HTTP
Service ném lỗi gRPC kèm **trailer metadata `error-code`** (mã nghiệp vụ). Gateway map theo `error-code` đặc biệt trước, rồi theo status code.

| Điều kiện | HTTP | code trả ra |
|---|---|---|
| `error-code`=IDEMPOTENCY_KEY_REUSED | 422 | IDEMPOTENCY_KEY_REUSED |
| `error-code`=OFFER_EXPIRED (gRPC FAILED_PRECONDITION) | 410 | OFFER_EXPIRED |
| INVALID_ARGUMENT | 400 | VALIDATION_ERROR / INVALID_COORDINATES / INVALID_SIGNATURE / INVALID_AMOUNT / INVALID_OTP / CONFIRM_REQUIRED |
| UNAUTHENTICATED | 401 | INVALID_TOKEN / INVALID_CREDENTIALS |
| PERMISSION_DENIED | 403 | FORBIDDEN / ACCOUNT_NOT_ACTIVE |
| NOT_FOUND | 404 | NOT_FOUND |
| ALREADY_EXISTS, ABORTED | 409 | ALREADY_EXISTS / STATE_CONFLICT / DRIVER_BUSY / TRIP_CANNOT_BE_CANCELED |
| RESOURCE_EXHAUSTED | 429 | RATE_LIMITED (kèm `Retry-After`) |
| UNAVAILABLE, DEADLINE_EXCEEDED | 503 | SERVICE_UNAVAILABLE / PAYMENT_SERVICE_UNAVAILABLE |

Quy ước: **xung đột trạng thái dùng gRPC `ABORTED`** (→409); chỉ offer hết hạn dùng `FAILED_PRECONDITION` (→410). Message trả client không chứa chi tiết nội bộ.

### 3.6 Metadata gRPC
Gateway gắn vào MỌI gRPC call: `x-correlation-id` (UUID), `x-user-id`, `x-user-role` (từ JWT đã verify; endpoint public thì bỏ), `x-service-token` (= `INTERNAL_SERVICE_TOKEN`).
- Mọi service có interceptor từ chối (UNAUTHENTICATED) nếu `x-service-token` thiếu/sai (ngoại trừ `grpc.health.v1.Health/Check` cũng nên kiểm tra token; healthcheck nội bộ của container gửi kèm token).
- **Danh tính người gọi luôn lấy từ metadata**, không tin field trong body. Service vẫn tự kiểm tra ownership.
- Deadline mỗi RPC = `GRPC_DEADLINE_MS` (mặc định 4000).
- Service gọi service khác (Booking→Payment/Driver, Trip→Driver, Customer→Trip, Auth→Customer, Driver→Auth) phải **chuyển tiếp** `x-correlation-id` và đặt `x-service-token`. Chỉ chuyển tiếp `x-user-id`/`x-user-role` gốc khi callee cần kiểm tra quyền sở hữu của người dùng (ví dụ Customer→`Trip.GetTrip` khi review). Cuộc gọi **không có `x-user-id`** được coi là nội bộ tin cậy và bỏ qua kiểm tra ownership (ví dụ Booking→`Payment.GetPayment`, Booking/Trip→`Driver.GetDriver`).

### 3.7 Tiện ích bảo mật dùng chung (mỗi service cần thì tự có bản sao trong `src/utils`)
- `crypto`: AES-256-GCM, IV 12 byte ngẫu nhiên, định dạng lưu `v1:<iv_b64>:<tag_b64>:<cipher_b64>`; prefix `v1`/`v2` chọn khóa `ENCRYPTION_KEY_V1/V2` (base64 32 byte); ghi dùng `ENCRYPTION_ACTIVE_KEY_ID`.
- `blindIndex(value)`: `HMAC-SHA256(BLIND_INDEX_KEY, normalized)` hex 64 ký tự. Chuẩn hóa: email → trim + lowercase; phone → bỏ khoảng trắng/dấu `-`; plate/license → trim + uppercase + bỏ khoảng trắng.
- `escapeHtml`: `& < > " '` → `&amp; &lt; &gt; &quot; &#39;`. Áp dụng **trước khi lưu** cho: displayName, fullName, address, review comment, cancel reason, reject reason, vehicle brand/model/color.
- Password: `bcryptjs`, cost ≥ 10.
- Validation bằng `zod` ở Gateway (shape cơ bản) và ở service (nghiệp vụ).

### 3.8 Logging và khởi động
- Log JSON một dòng ra stdout: `{ts, level, service, correlationId, msg}`. Không log password/token/PII.
- Khi khởi động: retry kết nối Postgres (container DB của chính nó)/Redis/RabbitMQ (tối đa ~30 lần, cách 2s), chạy `migrations/schema.sql`, rồi mới mở cổng gRPC và start consumer. Tắt êm khi nhận SIGTERM.

---

## 4. Hạ tầng

### 4.1 docker-compose.yml (thư mục gốc)
**Mỗi service dùng 1 container PostgreSQL riêng** (không dùng chung server Postgres).

| Container | Vai trò | Port host | Phụ thuộc / healthcheck |
|---|---|---|---|
| gateway | REST entry | **3000:3000** | 7 service, redis |
| auth-service | gRPC 50051 | không | auth-db, redis, customer-service |
| customer-service | gRPC 50052 | không | customer-db (gọi trip-service lúc runtime, không bắt buộc depends_on) |
| driver-service | gRPC 50053 | không | driver-db, redis, rabbitmq |
| booking-service | gRPC 50054 | không | booking-db, driver-service, payment-service, rabbitmq |
| trip-service | gRPC 50055 | không | trip-db, driver-service, rabbitmq |
| payment-service | gRPC 50056 | không | payment-db, rabbitmq |
| notify-service | gRPC 50057 | không | notify-db, rabbitmq |
| auth-db | Postgres của Auth (DB `auth_db`) | không | `pg_isready -U $AUTH_DB_USER -d $AUTH_DB_NAME` |
| customer-db | Postgres của Customer (DB `customer_db`) | không | `pg_isready` (tương tự) |
| driver-db | Postgres của Driver (DB `driver_db`) | không | `pg_isready` |
| booking-db | Postgres của Booking (DB `booking_db`) | không | `pg_isready` |
| trip-db | Postgres của Trip (DB `trip_db`) | không | `pg_isready` |
| payment-db | Postgres của Payment (DB `payment_db`) | không | `pg_isready` |
| notify-db | Postgres của Notify (DB `notify_db`) | không | `pg_isready` |
| redis | OTP/location/rate limit | không | `redis-cli ping` |
| rabbitmq | broker + UI | 15672:15672 (5672 chỉ nội bộ) | `rabbitmq-diagnostics ping` |

Yêu cầu:
- `depends_on` dùng `condition: service_healthy`. Mỗi service app có `healthcheck` chạy `node src/healthcheck.js` (gọi `grpc.health.v1.Health/Check` vào chính nó, kèm `x-service-token`).
- Mỗi service chỉ nhận **biến môi trường của chính nó** (liệt kê trong `environment:` bằng `${VAR}`), đặc biệt chỉ nhận DB URL của DB mình. Gateway không nhận DB URL/credential nào.
- `docker compose ps` phải thấy đủ **17 container**: gateway, 7 service, 7 DB, redis, rabbitmq.
- Host không truy cập được `localhost:50051..50057`; ở chế độ thường cũng không truy cập được DB/Redis từ host.

### 4.2 PostgreSQL: 7 container, database tạo khi `docker compose up`
Mỗi container DB dùng image `postgres:16-alpine` và **tự tạo database + user** ở lần khởi động đầu tiên nhờ biến môi trường chuẩn của image (không cần script init):

| Container | `POSTGRES_DB` | `POSTGRES_USER` | `POSTGRES_PASSWORD` |
|---|---|---|---|
| auth-db | `${AUTH_DB_NAME}` (auth_db) | `${AUTH_DB_USER}` (auth_user) | `${AUTH_DB_PASSWORD}` |
| customer-db | `${CUSTOMER_DB_NAME}` (customer_db) | `${CUSTOMER_DB_USER}` (customer_user) | `${CUSTOMER_DB_PASSWORD}` |
| driver-db | driver_db | driver_user | `${DRIVER_DB_PASSWORD}` |
| booking-db | booking_db | booking_user | `${BOOKING_DB_PASSWORD}` |
| trip-db | trip_db | trip_user | `${TRIP_DB_PASSWORD}` |
| payment-db | payment_db | payment_user | `${PAYMENT_DB_PASSWORD}` |
| notify-db | notify_db | notify_user | `${NOTIFY_DB_PASSWORD}` |

- Mỗi container có **volume riêng** (`auth-db-data`, `customer-db-data`, ...) gắn vào `/var/lib/postgresql/data`; trong mạng Docker các DB đều lắng nghe cổng `5432` (khác host nên không xung đột).
- Bảng/index do từng service tạo khi khởi động bằng `migrations/schema.sql` (§3.8, §7). Vì vậy `docker compose up --build` là đủ để có DB + bảng. Đổi mật khẩu DB sau lần chạy đầu cần `docker compose down -v` (xóa volume).
- Service chỉ nhận URL tới DB của mình, ví dụ `AUTH_DATABASE_URL=postgres://auth_user:...@auth-db:5432/auth_db`.

### 4.2.1 docker-compose.debug.yml (map port DB ra host)
File override dùng để debug (DBeaver/psql/pgAdmin) và chạy seed từ host. Chạy:
```
docker compose -f docker-compose.yml -f docker-compose.debug.yml up --build
```
File chỉ **thêm `ports`** cho các container có sẵn trong `docker-compose.yml` (không định nghĩa lại service), mỗi DB một port host khác nhau (đọc từ env, không hard-code):

| Container | Map | Port mặc định (host) |
|---|---|---|
| auth-db | `${AUTH_DB_DEBUG_PORT}:5432` | 5433 |
| customer-db | `${CUSTOMER_DB_DEBUG_PORT}:5432` | 5434 |
| driver-db | `${DRIVER_DB_DEBUG_PORT}:5432` | 5435 |
| booking-db | `${BOOKING_DB_DEBUG_PORT}:5432` | 5436 |
| trip-db | `${TRIP_DB_DEBUG_PORT}:5432` | 5437 |
| payment-db | `${PAYMENT_DB_DEBUG_PORT}:5432` | 5438 |
| notify-db | `${NOTIFY_DB_DEBUG_PORT}:5432` | 5439 |
| redis | `${REDIS_DEBUG_PORT}:6379` | 6379 |

Port gRPC của 7 service **vẫn không được publish** ngay cả ở chế độ debug (giữ đúng TC08). Kết nối từ host: `localhost:<port>` với `X_DB_USER`/`X_DB_PASSWORD`/`X_DB_NAME` trong `.env`.

### 4.3 Biến môi trường (`.env` và `.env.example`)
```
# --- chung ---
NODE_ENV=development
API_PREFIX=/api/v1
GATEWAY_PORT=3000
GRPC_DEADLINE_MS=4000
LOG_LEVEL=info

# --- bảo mật ---
JWT_SECRET=<ngẫu nhiên dài>
JWT_EXPIRES_IN_SECONDS=3600
ONBOARDING_TOKEN_EXPIRES_IN_SECONDS=900
INTERNAL_SERVICE_TOKEN=<ngẫu nhiên>
ENCRYPTION_KEY_V1=<base64 của 32 byte>      # openssl rand -base64 32
ENCRYPTION_ACTIVE_KEY_ID=v1
BLIND_INDEX_KEY=<ngẫu nhiên>
BCRYPT_COST=10

# --- OTP ---
OTP_TTL_SECONDS=300
OTP_MAX_ATTEMPTS=5

# --- nghiệp vụ ---
PRICE_PER_KM=5000
MATCH_RADIUS_KM=3
MATCH_MAX_OFFERS=3
OFFER_TTL_SECONDS=120
PAYMENT_CALLBACK_SECRET=<ngẫu nhiên>
PAYMENT_SKIP_SIGNATURE=false

# --- rate limit (Gateway) ---
RATE_LIMIT_WINDOW_SECONDS=60
RATE_LIMIT_DEFAULT_PER_MIN=100      # theo IP
RATE_LIMIT_LOGIN_PER_MIN=5          # theo IP, POST /auth/login
RATE_LIMIT_BOOKING_PER_MIN=10       # theo user, POST /bookings

# --- hạ tầng ---
# mỗi DB 1 container riêng; lặp lại bộ biến sau cho CUSTOMER, DRIVER, BOOKING, TRIP, PAYMENT, NOTIFY
AUTH_DB_NAME=auth_db
AUTH_DB_USER=auth_user
AUTH_DB_PASSWORD=<ngẫu nhiên>
AUTH_DB_ADDR=auth-db:5432                 # Gateway dùng để kiểm tra TCP (không có credential)
AUTH_DB_DEBUG_PORT=5433                   # chỉ dùng trong docker-compose.debug.yml / seed
AUTH_DATABASE_URL=postgres://auth_user:${AUTH_DB_PASSWORD}@auth-db:5432/auth_db   # chỉ auth-service nhận
# cổng debug mặc định: CUSTOMER=5434, DRIVER=5435, BOOKING=5436, TRIP=5437, PAYMENT=5438, NOTIFY=5439
REDIS_URL=redis://redis:6379
REDIS_DEBUG_PORT=6379
RABBITMQ_DEFAULT_USER=cab
RABBITMQ_DEFAULT_PASS=cab
RABBITMQ_URL=amqp://cab:cab@rabbitmq:5672
RABBITMQ_EXCHANGE=ride.events

# --- địa chỉ gRPC & port ---
AUTH_GRPC_PORT=50051      AUTH_GRPC_ADDR=auth-service:50051
CUSTOMER_GRPC_PORT=50052  CUSTOMER_GRPC_ADDR=customer-service:50052
DRIVER_GRPC_PORT=50053    DRIVER_GRPC_ADDR=driver-service:50053
BOOKING_GRPC_PORT=50054   BOOKING_GRPC_ADDR=booking-service:50054
TRIP_GRPC_PORT=50055      TRIP_GRPC_ADDR=trip-service:50055
PAYMENT_GRPC_PORT=50056   PAYMENT_GRPC_ADDR=payment-service:50056
NOTIFY_GRPC_PORT=50057    NOTIFY_GRPC_ADDR=notify-service:50057

# --- seed (chạy từ host) ---
SEED_BASE_LAT=10.762622
SEED_BASE_LNG=106.660172
SEED_PG_HOST=localhost                    # cần chạy compose kèm docker-compose.debug.yml
SEED_REDIS_URL=redis://localhost:6379     # cổng = REDIS_DEBUG_PORT
```
(Trong `.env` thật, các giá trị dạng `${...}` phải được viết ra đầy đủ nếu công cụ không nội suy được.)

### 4.4 Health check
| Endpoint | Cách làm | Kết quả |
|---|---|---|
| `GET /health` | liveness Gateway | 200 `{"status":"healthy"}` |
| `GET /ready` | kiểm tra 7 service + 7 DB + redis + rabbitmq | 200 `{"status":"ready"}`; lỗi → 503 `NOT_READY` |
| `GET /health/services` | gRPC Health 7 service + 7 DB + redis + rabbitmq | `{status, components:[{name,status,latencyMs}]}` |

- Mỗi service gRPC cài `grpc.health.v1.Health/Check`: trả `SERVING` chỉ khi dependency của nó ổn (Postgres `SELECT 1`; Redis `PING` nếu dùng; RabbitMQ channel nếu dùng), ngược lại `NOT_SERVING`.
- Gateway: mỗi DB kiểm bằng **kết nối TCP** tới `X_DB_ADDR` (ví dụ `auth-db:5432`, timeout ngắn; **không** dùng credential, không truy cập DB nghiệp vụ; việc `SELECT 1` đã do gRPC Health của từng service đảm nhiệm), Redis `PING`, RabbitMQ mở/đóng connection.
- Component name: `auth-service, customer-service, driver-service, booking-service, trip-service, payment-service, notify-service, auth-db, customer-db, driver-db, booking-db, trip-db, payment-db, notify-db, redis, rabbitmq`. `status` = `healthy`/`unhealthy`; tổng thể `healthy` nếu tất cả healthy, ngược lại `unhealthy` (HTTP 503 ở `/ready`; `/health/services` trả 200 hoặc 503 đều được, **chọn 503 khi unhealthy**).
- `/health`, `/ready`, `/health/services` **không bị rate limit**.

### 4.5 Kiểm tra RabbitMQ (tiêu chí 7)
UI `http://localhost:15672` (user `cab`): thấy exchange `ride.events` và queue `booking.q`, `trip.q`, `notify.q` cùng binding ở §6.

---
## 5. Giao tiếp gRPC (`contracts/proto`)

Package `cab.<service>.v1`; `common.proto` chứa: `Empty`, `Location{lat,lng,address}`, `PageRequest{page,limit}`, `PageInfo{page,limit,total,total_pages}`. Mọi timestamp là chuỗi ISO-8601 UTC. Tiền là `int64` (VND). Danh tính người gọi lấy từ metadata (§3.6) nên **không có `userId` của người gọi trong request** trừ khi ghi rõ.

| Service | RPC | Request → Response (rút gọn) | Caller |
|---|---|---|---|
| **Auth** | RegisterCustomer | {email,password,displayName,phone?} → {userId,status} | Gateway |
| | Login | {identifier,password} → {accessToken,tokenType,expiresIn} | Gateway |
| | RequestOtp | {phone} → {ok,otp} | Gateway |
| | VerifyOtp | {phone,otp} → {onboardingToken} | Gateway |
| | CreateDriverAccount | {email,password,phone} → {userId,status=PENDING} | Driver |
| | SetAccountStatus | {userId,status} → {userId,status} | Driver |
| | GetUser | {userId} → {userId,role,status} | Driver |
| **Customer** | CreateCustomerProfile | {userId,displayName} → profile (idempotent theo userId) | Auth |
| | GetCustomer | {userId} → {userId,displayName,createdAt} | Gateway |
| | UpdateCustomer | {displayName} → profile (userId từ metadata) | Gateway |
| | CreateReview | {tripId,rating,comment?} → review | Gateway |
| | ListReviews | {tripId,page,limit} → {items,pageInfo} | Gateway |
| **Driver** | GetDriver | {driverId?} hoặc {userId?} → DriverInfo | Gateway, Booking, Trip |
| | SearchNearbyDrivers | {lat,lng,radiusKm,page,limit,workStatus?,availability?} → {items[DriverNearby],pageInfo} | Gateway, Booking |
| | SubmitApplication | {phone,email,password,fullName,licenseNumber,vehicle{plateNumber,vehicleType,brand?,model?,color?}} → {applicationId,driverId,status} | Gateway |
| | GetApplication | {applicationId} → application chi tiết | Gateway |
| | ListApplications | {status?,page,limit} → {items,pageInfo} | Gateway |
| | ApproveApplication | {applicationId} → {applicationId,status} | Gateway |
| | RejectApplication | {applicationId,reason} → {applicationId,status} | Gateway |
| | SetWorkStatus | {status} → {driverId,workStatus} (driver theo metadata `x-user-id`) | Gateway |
| | UpdateLocation | {lat,lng} → {ok} (driver theo metadata) | Gateway |
| | TryAssignDriver | {driverId,bookingId} → {assigned,driverUserId,vehicleId} | Booking |
| | ReleaseDriver | {driverId,bookingId} → {released} | Booking, Trip |
| **Booking** | CreateBooking | {idempotencyKey,pickup,destination} → {bookingId,status,distanceKm,fare,paymentId,paymentUrl,replayed} | Gateway |
| | GetBooking | {bookingId} → booking (+ `driver` safe info nếu đã gán) | Gateway |
| | ListBookings | {status?,customerId?,page,limit} → {items,pageInfo} | Gateway |
| | ListMyOffers | {} → {items[offer + booking info]} (driver theo metadata) | Gateway |
| | AcceptOffer / RejectOffer | {offerId,reason?} → {bookingId,status,tripId} / {offerId,status} | Gateway |
| | CancelBooking | {bookingId,reason,confirm} → {bookingId,status} | Gateway |
| | MarkTripCompleted / MarkTripCanceled | {bookingId[,reason]} → {ok} (xử lý nội bộ khi consume event; khai báo RPC để đủ danh mục) | consumer |
| **Trip** | GetTrip / GetTripByBooking | {tripId} / {bookingId} → trip | Gateway, Customer |
| | Arrive / Start / Complete | {tripId} → trip | Gateway |
| | UpdateTripLocation | {tripId,lat,lng} → trip | Gateway |
| | Cancel | {tripId,reason,confirm} → trip | Gateway |
| **Payment** | CreatePayment | {bookingId,customerId,amount} → {paymentId,paymentUrl,status} | Booking |
| | GetPayment | {paymentId} → payment | Gateway |
| | HandleCallback | {paymentId,amount,result} → {paymentId,status,replayed} | Gateway |
| **Notify** | ListNotifications | {unread?,page,limit} → {items,pageInfo} | Gateway |
| | MarkRead / MarkAllRead | {notificationId} / {} → {ok} | Gateway |

`DriverInfo` = {driverId, userId, fullName, verificationStatus, workStatus, availability, vehicle{id,plateNumber,vehicleType,brand,model,color}, location?{lat,lng}}.
`DriverNearby` = DriverInfo rút gọn + `distanceMeters`.
Gateway **không trả `userId`, `licenseNumber`** của Driver ra REST cho Customer ("safe fields": driverId, fullName, workStatus, availability, vehicle{plateNumber,vehicleType,brand,model,color}).

---

## 6. RabbitMQ

- Exchange `ride.events`: **topic, durable**. Không DLQ, không retry queue, không outbox, không processed_events.
- Quy trình producer: **ghi DB → COMMIT → publish** (message `persistent: true`). Publish lỗi chỉ log, không rollback.
- Consumer: `prefetch(10)`, **manual ack sau khi xử lý thành công**; lỗi không phục hồi → log + `nack(requeue=false)`. Consumer luôn đọc **state hiện tại** và chỉ chuyển trạng thái khi điều kiện còn đúng (event lặp không gây tác động lần hai).
- Mỗi service consumer tự `assertExchange`, `assertQueue(durable)`, `bindQueue` khi khởi động.

**Envelope**
```json
{ "eventId":"uuid","eventType":"booking.offer.created","occurredAt":"2026-10-01T05:00:00Z",
  "correlationId":"uuid","producer":"booking-service","aggregateId":"bookingId","payload":{} }
```
Routing key = `eventType`.

| Routing key | Producer | Consumer | Payload |
|---|---|---|---|
| driver.approved | Driver | Notify | driverId, userId |
| driver.rejected | Driver | Notify | driverId, userId, reason |
| payment.completed | Payment | Booking, Notify | paymentId, bookingId, customerId, amount, paidAt |
| payment.failed | Payment | Booking, Notify | paymentId, bookingId, customerId, failureCode |
| booking.offer.created | Booking | Notify | offerId, bookingId, driverId, driverUserId, pickup, destination, distanceKm, fare, expiresAt |
| booking.assigned | Booking | Trip, Notify | bookingId, customerId, driverId, driverUserId, vehicleId, pickup, destination, fare, paymentId, paidAt, **supersededDriverUserIds[]** |
| booking.canceled | Booking | Notify | bookingId, customerId, driverUserIds[], reason |
| trip.arrived | Trip | Notify | tripId, customerId, driverId, **driverUserId** |
| trip.started | Trip | Notify | tripId, customerId, driverId, **driverUserId** |
| trip.completed | Trip | Booking, Notify | tripId, bookingId, customerId, driverId, **driverUserId** |
| trip.canceled | Trip | Booking, Notify | tripId, bookingId, customerId, driverId, **driverUserId**, canceledBy, reason |

(Các trường **in đậm** là bổ sung nhỏ so với bản nghiệp vụ để Notify không phải gọi service khác; xem §16.)

| Queue | Binding | Consumer xử lý |
|---|---|---|
| `booking.q` | payment.completed, payment.failed, trip.completed, trip.canceled | completed → mở matching; failed → PAYMENT_FAILED; trip.completed/canceled → đồng bộ Booking |
| `trip.q` | booking.assigned | tạo Trip nếu chưa có (theo bookingId) |
| `notify.q` | driver.#, payment.#, booking.#, trip.# | tạo notification theo recipient (§8.7). `#` khớp 0..n từ, nên `booking.#` nhận được `booking.offer.created` (ba từ). |

---

## 7. Database

Quy ước: `TIMESTAMPTZ` UTC; UUID tạo ở service (không `DEFAULT gen_random_uuid()`); không FK xuyên DB; **không tạo bảng ngoài danh sách dưới**. Mỗi service chạy `migrations/schema.sql` (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`) khi khởi động.

### 7.1 auth_db
```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email_enc TEXT NOT NULL,
  email_bidx CHAR(64) NOT NULL UNIQUE,
  phone_enc TEXT,
  phone_bidx CHAR(64),
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('CUSTOMER','DRIVER','ADMIN')),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','REJECTED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone_bidx ON users(phone_bidx) WHERE phone_bidx IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_users_role ON users(role);
CREATE INDEX IF NOT EXISTS ix_users_status ON users(status);
```
Redis OTP: key `otp:{phoneBidx}`, HASH {otpHash, attempts, purpose}, `EXPIRE 300`.

### 7.2 customer_db
```sql
CREATE TABLE IF NOT EXISTS customer_profiles (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,            -- Auth user id (định danh Customer xuyên service)
  display_name VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY,
  trip_id UUID NOT NULL,
  customer_id UUID NOT NULL,               -- Auth user id
  driver_id UUID NOT NULL,                 -- driver_profiles.id
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, customer_id)
);
CREATE INDEX IF NOT EXISTS ix_reviews_trip ON reviews(trip_id);
CREATE INDEX IF NOT EXISTS ix_reviews_customer ON reviews(customer_id);
CREATE INDEX IF NOT EXISTS ix_reviews_driver ON reviews(driver_id);
```

### 7.3 driver_db (+ Redis)
```sql
CREATE TABLE IF NOT EXISTS driver_profiles (
  id UUID PRIMARY KEY,                     -- driverId
  user_id UUID NOT NULL UNIQUE,            -- Auth user id
  full_name VARCHAR(120) NOT NULL,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (verification_status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
  work_status VARCHAR(10) NOT NULL DEFAULT 'OFFLINE' CHECK (work_status IN ('ONLINE','OFFLINE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dp_verification ON driver_profiles(verification_status);
CREATE INDEX IF NOT EXISTS ix_dp_work_status ON driver_profiles(work_status);

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY,
  driver_id UUID NOT NULL,
  plate_number_enc TEXT NOT NULL,
  plate_bidx CHAR(64) NOT NULL UNIQUE,
  vehicle_type VARCHAR(30) NOT NULL,
  brand VARCHAR(60), model VARCHAR(60), color VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_vehicles_driver ON vehicles(driver_id);

CREATE TABLE IF NOT EXISTS driver_applications (
  id UUID PRIMARY KEY,
  driver_id UUID NOT NULL,
  license_number_enc TEXT NOT NULL,
  license_bidx CHAR(64) NOT NULL UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK (status IN ('PENDING_REVIEW','APPROVED','REJECTED')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,                        -- Admin auth user id
  reject_reason VARCHAR(500)
);
CREATE INDEX IF NOT EXISTS ix_da_driver ON driver_applications(driver_id);
CREATE INDEX IF NOT EXISTS ix_da_status ON driver_applications(status, submitted_at);

CREATE TABLE IF NOT EXISTS driver_state_history (
  id UUID PRIMARY KEY,
  driver_id UUID NOT NULL,
  old_work_status VARCHAR(10) NOT NULL CHECK (old_work_status IN ('ONLINE','OFFLINE')),
  new_work_status VARCHAR(10) NOT NULL CHECK (new_work_status IN ('ONLINE','OFFLINE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_dsh_driver ON driver_state_history(driver_id, created_at);
```
**Redis (không TTL, không EXPIRE, không lastSeen/stale):**
| Key | Type | Nội dung |
|---|---|---|
| `drivers:geo` | GEO | member = driverId, lng/lat |
| `driver:{driverId}:state` | HASH | workStatus, availability, currentBookingId, currentTripId |
| `driver:{driverId}:location` | HASH | lat, lng, updatedAt |

### 7.4 booking_db
```sql
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY,
  customer_id UUID NOT NULL,               -- Auth user id
  driver_id UUID,
  payment_id UUID,
  pickup_lat DOUBLE PRECISION NOT NULL CHECK (pickup_lat BETWEEN -90 AND 90),
  pickup_lng DOUBLE PRECISION NOT NULL CHECK (pickup_lng BETWEEN -180 AND 180),
  pickup_address VARCHAR(255),
  dest_lat DOUBLE PRECISION NOT NULL CHECK (dest_lat BETWEEN -90 AND 90),
  dest_lng DOUBLE PRECISION NOT NULL CHECK (dest_lng BETWEEN -180 AND 180),
  dest_address VARCHAR(255),
  distance_km NUMERIC(10,2) NOT NULL CHECK (distance_km >= 0),
  fare BIGINT NOT NULL CHECK (fare >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'PAYMENT_PENDING' CHECK (status IN
    ('PAYMENT_PENDING','PAYMENT_FAILED','SEARCHING_DRIVER','DRIVER_ASSIGNED','NO_DRIVER_FOUND','CANCELED','COMPLETED')),
  assigned_at TIMESTAMPTZ, canceled_at TIMESTAMPTZ,
  cancel_reason VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_bk_customer ON bookings(customer_id, created_at);
CREATE INDEX IF NOT EXISTS ix_bk_driver ON bookings(driver_id);
CREATE INDEX IF NOT EXISTS ix_bk_payment ON bookings(payment_id);
CREATE INDEX IF NOT EXISTS ix_bk_status ON bookings(status, created_at);

CREATE TABLE IF NOT EXISTS booking_offers (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL,
  driver_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACCEPTED','REJECTED','SUPERSEDED')),
  expires_at TIMESTAMPTZ NOT NULL,         -- now() + OFFER_TTL_SECONDS; chỉ kiểm tra lúc accept
  responded_at TIMESTAMPTZ,
  reject_reason VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (booking_id, driver_id)
);
CREATE INDEX IF NOT EXISTS ix_bo_booking ON booking_offers(booking_id, status);
CREATE INDEX IF NOT EXISTS ix_bo_driver ON booking_offers(driver_id, status, expires_at);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id UUID PRIMARY KEY,
  key VARCHAR(120) NOT NULL,
  user_id UUID NOT NULL,
  endpoint VARCHAR(120) NOT NULL DEFAULT 'POST /bookings',
  request_hash CHAR(64) NOT NULL,
  response_code INT NOT NULL,
  response_body JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,         -- created_at + 24h
  UNIQUE (user_id, endpoint, key)
);
CREATE INDEX IF NOT EXISTS ix_idem_user ON idempotency_keys(user_id);
CREATE INDEX IF NOT EXISTS ix_idem_expires ON idempotency_keys(expires_at);
```

### 7.5 trip_db
```sql
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL UNIQUE,
  customer_id UUID NOT NULL,               -- Auth user id
  driver_id UUID NOT NULL,
  vehicle_id UUID NOT NULL,
  payment_id UUID NOT NULL,
  fare BIGINT NOT NULL CHECK (fare >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'DRIVER_ARRIVING' CHECK (status IN
    ('DRIVER_ARRIVING','DRIVER_ARRIVED','IN_PROGRESS','COMPLETED','CANCELED')),
  payment_status VARCHAR(10) NOT NULL DEFAULT 'PAID' CHECK (payment_status = 'PAID'),
  paid_at TIMESTAMPTZ NOT NULL,
  last_lat DOUBLE PRECISION CHECK (last_lat BETWEEN -90 AND 90),
  last_lng DOUBLE PRECISION CHECK (last_lng BETWEEN -180 AND 180),
  location_updated_at TIMESTAMPTZ,
  end_lat DOUBLE PRECISION, end_lng DOUBLE PRECISION,
  arrived_at TIMESTAMPTZ, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, canceled_at TIMESTAMPTZ,
  canceled_by VARCHAR(10) CHECK (canceled_by IN ('CUSTOMER','DRIVER')),
  cancel_reason VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_trips_customer ON trips(customer_id, created_at);
CREATE INDEX IF NOT EXISTS ix_trips_driver ON trips(driver_id, created_at);
CREATE INDEX IF NOT EXISTS ix_trips_payment ON trips(payment_id);
CREATE INDEX IF NOT EXISTS ix_trips_status ON trips(status);
```

### 7.6 payment_db
```sql
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  booking_id UUID NOT NULL UNIQUE,         -- 1 payment / 1 booking
  customer_id UUID NOT NULL,               -- Auth user id
  amount BIGINT NOT NULL CHECK (amount > 0),
  currency CHAR(3) NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  provider VARCHAR(10) NOT NULL DEFAULT 'MOCK' CHECK (provider = 'MOCK'),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','COMPLETED','FAILED')),
  provider_txn_id VARCHAR(120),
  payment_url TEXT NOT NULL,
  failure_code VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ, failed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_pay_txn ON payments(provider_txn_id) WHERE provider_txn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_pay_customer ON payments(customer_id, created_at);
CREATE INDEX IF NOT EXISTS ix_pay_status ON payments(status);
```

### 7.7 notify_db
```sql
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  recipient_id UUID NOT NULL,              -- Auth user id
  recipient_role VARCHAR(20) NOT NULL CHECK (recipient_role IN ('CUSTOMER','DRIVER','ADMIN')),
  type VARCHAR(60) NOT NULL CHECK (type IN ('BOOKING_OFFER','BOOKING_ASSIGNED','OFFER_CLOSED','BOOKING_CANCELED',
    'TRIP_ARRIVED','TRIP_STARTED','TRIP_COMPLETED','TRIP_CANCELED','PAYMENT_COMPLETED','PAYMENT_FAILED',
    'DRIVER_APPROVED','DRIVER_REJECTED')),
  title VARCHAR(160) NOT NULL,
  body VARCHAR(500) NOT NULL,
  data JSONB,
  status VARCHAR(10) NOT NULL DEFAULT 'UNREAD' CHECK (status IN ('UNREAD','READ')),
  event_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  UNIQUE (recipient_id, event_id, type)
);
CREATE INDEX IF NOT EXISTS ix_notif_recipient ON notifications(recipient_id, status, created_at);
```

---
## 8. Đặc tả logic từng service

Quy ước: "→ 409" nghĩa là ném gRPC `ABORTED` + `error-code` tương ứng. Mọi chuỗi người dùng nhập đều `escapeHtml` trước khi lưu (§3.7). Entity trả về REST dùng key `id` (riêng response `POST /bookings` dùng `bookingId`).

### 8.1 Auth Service
- **RegisterCustomer**: validate `email` (hợp lệ, ≤255), `password` (**6..72 ký tự**), `displayName` (1..120), `phone?` (sau chuẩn hóa khớp `^\+?[0-9]{8,15}$`). Trùng email/phone (theo blind index) → 409 `ALREADY_EXISTS`. Tạo user `role=CUSTOMER,status=PENDING` (email/phone mã hóa AES-GCM + blind index, password bcrypt) → gọi `Customer.CreateCustomerProfile{userId,displayName}`; thành công → `status=ACTIVE`, trả `{userId,status}`. Customer lỗi → xóa user vừa tạo, trả 503.
- **Login**: `identifier` chứa `@` → tra `email_bidx`, ngược lại `phone_bidx`. Không thấy user hoặc `bcrypt.compare` sai → 401 `INVALID_CREDENTIALS` (cùng một thông điệp). Đúng mật khẩu nhưng `status != ACTIVE` → 403 `ACCOUNT_NOT_ACTIVE`. Thành công → JWT **HS256** `{sub:userId, role, iat, exp}` ký bằng `JWT_SECRET`; trả `{accessToken, tokenType:"Bearer", expiresIn}`. **Không có refreshToken, không có /auth/refresh.**
- **RequestOtp{phone}**: sinh OTP ngẫu nhiên 6 chữ số, lưu Redis `otp:{phoneBidx}` HASH `{otpHash=sha256(otp), attempts=0, purpose="DRIVER_ONBOARDING"}`, `EXPIRE OTP_TTL_SECONDS`, rồi trả `{ok:true,otp}` để demo. Redis không lưu OTP rõ; gọi lại sinh mã mới và ghi đè key.
- **VerifyOtp{phone,otp}**: không có key → 400 `INVALID_OTP`; sai → `attempts+1`, 400 `INVALID_OTP` (đạt `OTP_MAX_ATTEMPTS` thì xóa key); đúng → xóa key, trả `onboardingToken` = JWT HS256 `{purpose:"DRIVER_ONBOARDING", phone:<chuẩn hóa>}` hạn `ONBOARDING_TOKEN_EXPIRES_IN_SECONDS`.
- **CreateDriverAccount{email,password,phone}** (chỉ Driver service gọi): tạo user `role=DRIVER,status=PENDING`; trùng → 409.
- **SetAccountStatus{userId,status}**: chỉ nhận `ACTIVE` | `REJECTED`. **GetUser**: trả `{userId,role,status}`.

### 8.2 Customer Service
- `CreateCustomerProfile`: idempotent theo `user_id` (đã có thì trả bản ghi cũ). `GetCustomer{userId}`: tra theo `customer_profiles.user_id`; Customer chỉ xem được chính mình (userId ≠ `x-user-id` → 403), Admin xem tất cả; không có → 404. `UpdateCustomer`: chỉ đổi `displayName` của chính mình.
- **CreateReview{tripId,rating(1..5),comment?(≤500)}**: gọi `Trip.GetTrip` (chuyển tiếp metadata của người dùng). Trip không tồn tại → 404; `trip.customerId != x-user-id` → 403; `trip.status != COMPLETED` → 409 `STATE_CONFLICT`; đã review (UNIQUE trip+customer) → 409 `ALREADY_EXISTS`. Lưu `customer_id = x-user-id`, `driver_id = trip.driverId`. Chỉ role CUSTOMER.
- **ListReviews{tripId}**: bắt buộc `tripId` (thiếu → 400); trả review của chuyến, có phân trang.

### 8.3 Driver Service
**Onboarding**
- **SubmitApplication** (Gateway đã verify onboardingToken và đảm bảo `phone` khớp token): validate `fullName`, `phone`, `email`, `password` (6..72), `licenseNumber`, `vehicle{plateNumber,vehicleType,brand?,model?,color?}`. Kiểm tra trùng `license_bidx`/`plate_bidx` → 409. Gọi `Auth.CreateDriverAccount`. Transaction: tạo `driver_profiles(PENDING_REVIEW, OFFLINE)`, `vehicles`, `driver_applications(PENDING_REVIEW)` (license/plate mã hóa + blind index). Lỗi sau khi đã tạo account → `Auth.SetAccountStatus(REJECTED)` best-effort. Trả `{applicationId, driverId, status:"PENDING_REVIEW"}`.
- **ListApplications / GetApplication** (chỉ ADMIN): list lọc theo `status`, phân trang theo `submitted_at DESC`, không kèm license; detail trả license đã giải mã + vehicle + driver.
- **ApproveApplication** (chỉ ADMIN; application phải `PENDING_REVIEW` nếu không → 409): trong 1 transaction cập nhật application `APPROVED` (`reviewed_at`, `reviewed_by`), profile `verification_status=APPROVED`, gọi `Auth.SetAccountStatus(ACTIVE)`; commit; khởi tạo Redis `driver:{id}:state` = `{workStatus:OFFLINE, availability:AVAILABLE}` (nếu chưa có); **publish `driver.approved`**.
- **RejectApplication{reason 5..500}** (chỉ ADMIN): `REJECTED` + `reject_reason`, `Auth.SetAccountStatus(REJECTED)`, publish `driver.rejected`.

**Trạng thái làm việc & vị trí** (driver xác định bằng `x-user-id` → `driver_profiles.user_id`; role phải DRIVER)
- **SetWorkStatus{status}**: chỉ `verification=APPROVED` mới được `ONLINE` (nếu không → 403 `FORBIDDEN`). Đặt `OFFLINE` khi `availability=BUSY` → **409 `DRIVER_BUSY`**. Cập nhật `driver_profiles.work_status` + Redis `workStatus`; nếu giá trị thực sự đổi thì ghi `driver_state_history`.
- **UpdateLocation{lat,lng}**: validate tọa độ (sai → 400 `INVALID_COORDINATES`); chỉ driver APPROVED. `GEOADD drivers:geo lng lat driverId`; `HSET driver:{id}:location lat lng updatedAt`; đảm bảo có `driver:{id}:state`. **Không EXPIRE, không TTL, không lastSeen/stale-check.**
- **SearchNearbyDrivers{lat,lng,radiusKm(mặc định 1, >0, ≤50),page,limit,workStatus?,availability?}**: `GEOSEARCH drivers:geo FROMLONLAT lng lat BYRADIUS r km ASC WITHDIST` (dùng `redis.call`), lấy `driver:{id}:state` (pipeline), join DB để chỉ giữ driver `verification=APPROVED` + vehicle; áp filter `workStatus`/`availability` nếu có; `distanceMeters = round(km*1000)`, sắp xếp tăng dần; **phân trang trong Driver Service** (trả `total`). Driver không có location thì không xuất hiện.
- **GetDriver{driverId | userId}**: không thấy → 404; kèm vehicle (plate giải mã) và location nếu có.

**Giữ chỗ tài xế (atomic, Lua)** — `KEYS[1]=driver:{id}:state`
```lua
-- TryAssign: AVAILABLE -> BUSY khi ONLINE
if redis.call('HGET',KEYS[1],'workStatus')=='ONLINE' and redis.call('HGET',KEYS[1],'availability')=='AVAILABLE' then
  redis.call('HSET',KEYS[1],'availability','BUSY','currentBookingId',ARGV[1]); return 1 end
return 0
-- Release: chỉ khi currentBookingId khớp
if redis.call('HGET',KEYS[1],'currentBookingId')==ARGV[1] then
  redis.call('HSET',KEYS[1],'availability','AVAILABLE'); redis.call('HDEL',KEYS[1],'currentBookingId','currentTripId'); return 1 end
return 0
```
`TryAssignDriver` trả `{assigned, driverUserId, vehicleId}`; `ReleaseDriver` idempotent (`released` true/false). Availability chỉ có AVAILABLE/BUSY (không RESERVED).

### 8.4 Booking Service
**CreateBooking{idempotencyKey,pickup,destination}** (role CUSTOMER; `customer_id = x-user-id`):
1. Validate tọa độ (lat −90..90, lng −180..180, là số) → sai 400 `INVALID_COORDINATES`.
2. `requestHash = sha256(JSON.stringify({pickup:{lat,lng,address|null}, destination:{...}}))` (số đã ép kiểu, địa chỉ trim). Tra `idempotency_keys(user_id,'POST /bookings',key)`: **cùng hash** → trả lại `response_code/response_body` đã lưu với `replayed=true` (không tạo Booking/Payment mới); **khác hash** → 422 `IDEMPOTENCY_KEY_REUSED`.
3. `distanceKm` = Haversine (R=6371 km) làm tròn 2 chữ số; `fare = Math.round(distanceKm * PRICE_PER_KM)`. `fare <= 0` → 400 `INVALID_COORDINATES`. Client không gửi amount.
4. Insert booking `status=PAYMENT_PENDING` (commit) → gọi `Payment.CreatePayment{bookingId,customerId,amount:fare}`.
   - Lỗi → update booking `PAYMENT_FAILED`, trả **503 `PAYMENT_SERVICE_UNAVAILABLE`** (không lưu idempotency).
   - OK → lưu `payment_id` vào booking; insert `idempotency_keys` (`expires_at = now+24h`, `response_code=201`, body `{bookingId,status:"PAYMENT_PENDING",distanceKm,fare,paymentId,paymentUrl}`); trả body đó. Nếu insert idempotency vi phạm UNIQUE (race) → đọc lại bản đã lưu và trả về.

**Consumer `payment.completed`**: chỉ nếu `UPDATE bookings SET status='SEARCHING_DRIVER' WHERE id=$1 AND status='PAYMENT_PENDING'` ảnh hưởng 1 dòng thì mới matching; nếu booking đã `CANCELED` (hoặc trạng thái khác) → **bỏ qua**, ack, không tạo offer (Payment vẫn COMPLETED, không refund).
Matching: `Driver.SearchNearbyDrivers{pickup, radiusKm=MATCH_RADIUS_KM, workStatus=ONLINE, availability=AVAILABLE, page=1, limit=MATCH_MAX_OFFERS}`.
- Không có driver → `UPDATE ... SET status='NO_DRIVER_FOUND' WHERE status='SEARCHING_DRIVER'`.
- Có → insert `booking_offers(PENDING, expires_at = now()+OFFER_TTL_SECONDS)` cho từng driver (tối đa `MATCH_MAX_OFFERS`); sau commit **publish một `booking.offer.created` cho mỗi offer** (`driverUserId` lấy từ kết quả search).

**Consumer `payment.failed`**: `PAYMENT_PENDING → PAYMENT_FAILED`; không tạo offer. **Consumer `trip.completed`**: `DRIVER_ASSIGNED → COMPLETED`. **Consumer `trip.canceled`**: `DRIVER_ASSIGNED → CANCELED` (`canceled_at`, `cancel_reason`=reason; không publish thêm `booking.canceled`).

**ListMyOffers** (role DRIVER): `Driver.GetDriver{userId=x-user-id}` → driverId; trả các offer `status=PENDING` mà booking đang `SEARCHING_DRIVER`, kèm pickup/destination/distanceKm/fare/expiresAt, mới nhất trước.

**AcceptOffer{offerId}** (role DRIVER):
1. Resolve driverId; offer không tồn tại → 404; offer của driver khác → 403.
2. offer phải `PENDING` (không → 409); `expires_at > now()` (không → **410 `OFFER_EXPIRED`**); booking phải `SEARCHING_DRIVER` (không → 409).
3. `Driver.TryAssignDriver{driverId,bookingId}`; `assigned=false` → 409.
4. Transaction: `UPDATE bookings SET status='DRIVER_ASSIGNED', driver_id, assigned_at WHERE id AND status='SEARCHING_DRIVER'` — 0 dòng → rollback, gọi `Driver.ReleaseDriver`, 409. Offer thắng `ACCEPTED` (+`responded_at`); các offer `PENDING` khác của booking → `SUPERSEDED` (thu lại danh sách driverId).
5. Sau commit: lấy `driverUserId` của các driver SUPERSEDED (`Driver.GetDriver`), **publish `booking.assigned`** (kèm `vehicleId`, `paymentId`, `paidAt`, `supersededDriverUserIds`). `paidAt` lấy bằng cách gọi `Payment.GetPayment{paymentId}` (gọi service-to-service, **không** chuyển tiếp `x-user-id`/`x-user-role`, xem §3.6). Trả `{bookingId, status:"DRIVER_ASSIGNED"}`.

**RejectOffer**: offer của driver này, phải `PENDING` (không → 409) → `REJECTED` + `responded_at` + `reject_reason`. Không có xử lý tìm tài xế bổ sung.

**CancelBooking{bookingId,reason(5..200),confirm}** (chỉ chủ booking, role CUSTOMER; ADMIN → 403): `confirm !== true` → 400 `CONFIRM_REQUIRED`. Chỉ cho `PAYMENT_PENDING | SEARCHING_DRIVER`, trạng thái khác → 409 (`DRIVER_ASSIGNED` thì dùng trip cancel). Transaction: `UPDATE ... SET status='CANCELED',canceled_at,cancel_reason WHERE id AND status IN (...)` (0 dòng → 409); offers `PENDING → SUPERSEDED`. Sau commit publish `booking.canceled{bookingId,customerId,driverUserIds,reason}` (driverUserIds = driver có offer vừa bị SUPERSEDED, có thể rỗng). **Không refund, Payment giữ nguyên trạng thái.**

**GetBooking / ListBookings**: Customer chỉ thấy booking của mình (booking người khác → 403); Admin xem tất cả (list có thể lọc `customerId`). `ListBookings` lọc `status?`, sắp xếp `created_at DESC`, trả `pagination.total/totalPages`. GetBooking kèm `driver` (safe info, từ `Driver.GetDriver`) khi `driver_id != null`.

### 8.5 Payment Service (chỉ MOCK)
- **CreatePayment{bookingId,customerId,amount}** (chỉ gọi nội bộ): `amount > 0`; nếu đã có payment cho `booking_id` → trả bản cũ (idempotent). Tạo `payments(PENDING, provider=MOCK, currency=VND)`, `payment_url = "mock://pay/{paymentId}"`. Trả `{paymentId, paymentUrl, status}`.
- **HandleCallback{paymentId,amount,result(SUCCESS|FAIL)}** (endpoint public, mock đơn giản):
  1. Hệ thống tự sinh `providerTxnId = "MOCK-" + paymentId`; client không cần gửi mã giao dịch hoặc chữ ký.
  2. Payment không tồn tại → 404.
  3. `status != PENDING`: nếu `provider_txn_id == "MOCK-" + paymentId` → trả kết quả cũ `{status, replayed:true}` **không publish lần hai**.
  4. `amount != payments.amount` → 400 `INVALID_AMOUNT`.
  5. `UPDATE ... WHERE id AND status='PENDING'`: SUCCESS → `COMPLETED`, `paid_at`, lưu `provider_txn_id`; FAIL → `FAILED`, `failed_at`, `failure_code='MOCK_PAYMENT_FAILED'`. (0 dòng → đọc lại và xử lý như replay.) Sau commit publish `payment.completed{paymentId,bookingId,customerId,amount,paidAt}` hoặc `payment.failed{paymentId,bookingId,customerId,failureCode}`.
- **GetPayment**: Customer chỉ xem payment của mình (`customer_id == x-user-id`), Admin xem tất cả; còn lại 403.

### 8.6 Trip Service
- **Consumer `booking.assigned`**: `INSERT INTO trips(... status='DRIVER_ARRIVING', payment_status='PAID', payment_id, paid_at, fare, vehicle_id ...) ON CONFLICT (booking_id) DO NOTHING`. **Không bao giờ tạo Trip trước accept.**
- Xác định driver: `Driver.GetDriver{userId=x-user-id}` → `driverId`; so với `trip.driver_id`. Khi publish event, lấy `driverUserId` bằng `Driver.GetDriver{driverId}`.
- **Arrive** (assigned driver): `DRIVER_ARRIVING → DRIVER_ARRIVED`, `arrived_at`, publish `trip.arrived`. **Start**: `DRIVER_ARRIVED → IN_PROGRESS`, `started_at`, publish `trip.started`. Sai trạng thái → 409 `STATE_CONFLICT`; không phải assigned driver → 403.
- **UpdateTripLocation{lat,lng}** (assigned driver, chỉ khi `IN_PROGRESS`, nếu không 409): ghi đè `last_lat,last_lng,location_updated_at`; không lưu lịch sử.
- **Complete**: chỉ `IN_PROGRESS` → `COMPLETED`, `completed_at`, copy `last_lat/lng → end_lat/end_lng` (nếu có). **Không tính lại cước, không bước thu tiền.** Sau commit gọi `Driver.ReleaseDriver{driverId,bookingId}` (BUSY→AVAILABLE) rồi publish `trip.completed`.
- **Cancel{reason 5..200, confirm}** (participant: chủ trip là Customer hoặc assigned Driver; ADMIN → 403): `confirm !== true` → 400 `CONFIRM_REQUIRED`; chỉ khi `DRIVER_ARRIVING | DRIVER_ARRIVED`, nếu `IN_PROGRESS`/khác → 409 `TRIP_CANNOT_BE_CANCELED`. Cập nhật `CANCELED`, `canceled_by = CUSTOMER|DRIVER` (suy từ vai trò người gọi), `canceled_at`, `cancel_reason`; `ReleaseDriver`; publish `trip.canceled`. **Không refund.**
- **GetTrip / GetTripByBooking**: Customer chủ trip, Driver được gán, hoặc Admin; còn lại 403; không có → 404. Trả `status, paymentId, paymentStatus("PAID"), paidAt, fare, lastLat/lastLng/locationUpdatedAt, endLat/endLng`, các mốc thời gian.

### 8.7 Notify Service
Chỉ consume RabbitMQ và lưu DB; **không** email/SMS/WebSocket. Ghi bằng `INSERT ... ON CONFLICT (recipient_id,event_id,type) DO NOTHING`. `event_id` = `eventId` của envelope. Notification **không phải source of truth**.

| Event | Recipient(s) | type | title / body (ví dụ) | data |
|---|---|---|---|---|
| booking.offer.created | `driverUserId` (DRIVER) | BOOKING_OFFER | "Có chuyến mới" / "Điểm đón: {pickup.address hoặc lat,lng}. Cước: {fare} VND" | offerId, bookingId |
| booking.assigned | customerId (CUSTOMER) | BOOKING_ASSIGNED | "Đã có tài xế nhận chuyến" | bookingId, driverId |
| booking.assigned | `driverUserId` (DRIVER) | BOOKING_ASSIGNED | "Bạn đã nhận chuyến" | bookingId |
| booking.assigned | mỗi `supersededDriverUserIds` | OFFER_CLOSED | "Chuyến đã có tài xế khác nhận" | bookingId |
| booking.canceled | customerId + mỗi `driverUserIds` | BOOKING_CANCELED | "Chuyến đã bị hủy" | bookingId, reason |
| payment.completed / payment.failed | customerId | PAYMENT_COMPLETED / PAYMENT_FAILED | "Thanh toán thành công / thất bại" | paymentId, bookingId |
| trip.arrived / trip.started / trip.completed | customerId | TRIP_ARRIVED / TRIP_STARTED / TRIP_COMPLETED | tiêu đề tương ứng | tripId, bookingId? |
| trip.canceled | customerId **và** `driverUserId` | TRIP_CANCELED | "Chuyến đã bị hủy" | tripId, canceledBy, reason |
| driver.approved / driver.rejected | `userId` (DRIVER) | DRIVER_APPROVED / DRIVER_REJECTED | "Hồ sơ đã được duyệt / bị từ chối" | driverId, reason? |

API: `ListNotifications` (chỉ của người gọi, lọc `unread=true`, phân trang, mới nhất trước), `MarkRead` (không tồn tại → 404; của người khác → 403), `MarkAllRead`.

---
## 9. API Gateway

### 9.1 Trách nhiệm (không chứa business logic)
Entry point REST duy nhất; verify JWT; RBAC theo endpoint; rate limit; sinh `x-correlation-id`; validate shape bằng zod; map REST ↔ gRPC; map lỗi (§3.5); gom health. Thứ tự middleware: `correlationId → helmet → express.json(limit 100kb) → rateLimit → auth(JWT) → rbac → validate → controller`. Route không tồn tại → 404 `NOT_FOUND`; JSON hỏng → 400 `VALIDATION_ERROR`.

### 9.2 Xác thực
- Header `Authorization: Bearer <jwt>`. `jwt.verify(token, JWT_SECRET, { algorithms:['HS256'] })` (từ chối `alg=none`, kiểm tra `exp`). Sai/hết hạn/thiếu → **401 `INVALID_TOKEN`**. Lấy `sub`, `role` **từ token đã verify**, gắn vào metadata gRPC.
- `POST /drivers/applications` dùng **onboardingToken** (cùng cơ chế verify, bắt buộc `payload.purpose === "DRIVER_ONBOARDING"`); Gateway kiểm `body.phone` (chuẩn hóa) khớp `payload.phone`, sai → 400. Token đăng nhập thường **không** dùng được ở endpoint này và ngược lại.

### 9.3 Rate limit (Redis, fixed window `RATE_LIMIT_WINDOW_SECONDS`)
`INCR` + `EXPIRE` ở lần đầu. Mặc định `RATE_LIMIT_DEFAULT_PER_MIN` theo **IP** (mọi route trừ health); `POST /auth/login` `RATE_LIMIT_LOGIN_PER_MIN` theo IP; `POST /bookings` `RATE_LIMIT_BOOKING_PER_MIN` theo **userId**. Vượt ngưỡng → **429 `RATE_LIMITED`** + header `Retry-After` (giây còn lại). Redis lỗi → bỏ qua limit (fail-open), không làm sập API.

### 9.4 Bảng route + RBAC
`Public` = không cần JWT. Với "Own" service vẫn kiểm tra ownership.

| Method | Path (sau `/api/v1`) | Ai gọi | RPC | Ghi chú / lỗi chính |
|---|---|---|---|---|
| GET | /health, /ready, /health/services | Public | (Health) | §4.4 |
| POST | /auth/register | Public | Auth.RegisterCustomer | 201 `{userId,status}`; 400, 409, 503 |
| POST | /auth/login | Public | Auth.Login | 200; 400, 401 `INVALID_CREDENTIALS`, 403 `ACCOUNT_NOT_ACTIVE` |
| POST | /auth/otp/request | Public | Auth.RequestOtp | 200 `{ok,otp}`; 400, 429 |
| POST | /auth/otp/verify | Public | Auth.VerifyOtp | 200 `{onboardingToken}`; 400 `INVALID_OTP` |
| GET | /customers/me | CUSTOMER | Customer.GetCustomer | |
| PATCH | /customers/me | CUSTOMER | Customer.UpdateCustomer | body `{displayName}` |
| GET | /customers/:id | CUSTOMER(own: `:id`=sub), ADMIN(all) | Customer.GetCustomer | `:id` là **Auth user id**; customer khác → 403; DRIVER → 403 |
| GET | /drivers/:id | Mọi user đăng nhập | Driver.GetDriver | `:id` = driverId; chỉ safe fields |
| POST | /drivers/applications | onboardingToken | Driver.SubmitApplication | body: `{email,password,phone,fullName,licenseNumber,vehicle{...}}`; 201 `PENDING_REVIEW` |
| GET | /admin/driver-applications | ADMIN | Driver.ListApplications | `?status&page&limit` |
| GET | /admin/driver-applications/:id | ADMIN | Driver.GetApplication | |
| POST | /admin/driver-applications/:id/approve | ADMIN | Driver.ApproveApplication | 409 nếu không PENDING_REVIEW |
| POST | /admin/driver-applications/:id/reject | ADMIN | Driver.RejectApplication | body `{reason}` |
| PUT | /drivers/me/status | DRIVER | Driver.SetWorkStatus | body `{status}`; 409 `DRIVER_BUSY` |
| PUT | /drivers/me/location | DRIVER | Driver.UpdateLocation | body `{lat,lng}` |
| GET | /drivers/nearby | Mọi user đăng nhập | Driver.SearchNearbyDrivers | `?lat&lng&radiusKm=1&page=1&limit=10&workStatus&availability` |
| POST | /bookings | CUSTOMER | Booking.CreateBooking | **bắt buộc** header `Idempotency-Key` (1..120 ký tự, thiếu → 400); 201; replay → header `Idempotent-Replayed: true` |
| GET | /bookings/:id | CUSTOMER(own), ADMIN | Booking.GetBooking | |
| GET | /bookings | CUSTOMER(own), ADMIN | Booking.ListBookings | `?status&page&limit` (admin thêm `customerId`) |
| POST | /bookings/:id/cancel | CUSTOMER(own) | Booking.CancelBooking | body `{reason,confirm}` |
| GET | /booking-offers/me | DRIVER | Booking.ListMyOffers | |
| POST | /booking-offers/:id/accept | DRIVER | Booking.AcceptOffer | 403, 409, 410 |
| POST | /booking-offers/:id/reject | DRIVER | Booking.RejectOffer | body `{reason?}` |
| GET | /trips/:id | CUSTOMER/DRIVER(participant), ADMIN | Trip.GetTrip | |
| GET | /trips/by-booking/:bookingId | CUSTOMER/DRIVER(participant), ADMIN | Trip.GetTripByBooking | 404 trước khi accept |
| POST | /trips/:id/arrive | DRIVER(assigned) | Trip.Arrive | |
| POST | /trips/:id/start | DRIVER(assigned) | Trip.Start | |
| PUT | /trips/:id/location | DRIVER(assigned) | Trip.UpdateTripLocation | body `{lat,lng}` |
| POST | /trips/:id/complete | DRIVER(assigned) | Trip.Complete | |
| POST | /trips/:id/cancel | CUSTOMER/DRIVER(participant) | Trip.Cancel | body `{reason,confirm}`; ADMIN → 403 |
| POST | /payments/mock/callback | Public | Payment.HandleCallback | body `{paymentId,amount,result}`; 400 `INVALID_AMOUNT`, 404 |
| GET | /payments/:id | CUSTOMER(own), ADMIN | Payment.GetPayment | |
| POST | /reviews | CUSTOMER | Customer.CreateReview | body `{tripId,rating,comment?}` |
| GET | /reviews?tripId= | Mọi user đăng nhập | Customer.ListReviews | thiếu `tripId` → 400 |
| GET | /notifications | Mọi user đăng nhập (own) | Notify.ListNotifications | `?unread=true&page&limit` |
| POST | /notifications/:id/read | own | Notify.MarkRead | |
| POST | /notifications/read-all | own | Notify.MarkAllRead | |

Ma trận quyền tóm tắt: Customer — bookings/payments/reviews/trip-cancel của mình; Driver — status/location/offers/trip lifecycle; Admin — tra cứu + duyệt driver, **không** override trip cancel. Customer gọi API của Driver (vd `PUT /drivers/me/status`) → **403 `FORBIDDEN`**, body không chứa dữ liệu.

---

## 10. Luồng chuẩn và máy trạng thái

### 10.1 Luồng đặt xe end-to-end
1. Customer `POST /bookings` (+`Idempotency-Key`) → Booking `PAYMENT_PENDING`, gọi `Payment.CreatePayment` (gRPC) → response `{bookingId,status,distanceKm,fare,paymentId,paymentUrl}`.
2. `POST /payments/mock/callback` SUCCESS → Payment `COMPLETED` → publish `payment.completed` → Booking `SEARCHING_DRIVER`, tìm tài xế, tạo offers, publish `booking.offer.created` (mỗi offer) → Notify tạo `BOOKING_OFFER` cho đúng driver.
3. Driver `GET /notifications?unread=true` → `GET /booking-offers/me` → `POST /booking-offers/:id/accept` → Booking `DRIVER_ASSIGNED` → publish `booking.assigned` → Trip tạo `DRIVER_ARRIVING`; Notify tạo `BOOKING_ASSIGNED`/`OFFER_CLOSED`.
4. Driver `arrive → start → PUT location → complete` → Trip `COMPLETED` → Driver `AVAILABLE` → `trip.completed` → Booking `COMPLETED`.
5. Customer `POST /reviews`.
Callback FAIL → Payment `FAILED` → Booking `PAYMENT_FAILED`, **không** có offer.

### 10.2 Chuyển trạng thái hợp lệ
| Đối tượng | Chuyển |
|---|---|
| Booking | PAYMENT_PENDING→{SEARCHING_DRIVER, PAYMENT_FAILED, CANCELED}; SEARCHING_DRIVER→{DRIVER_ASSIGNED, NO_DRIVER_FOUND, CANCELED}; DRIVER_ASSIGNED→{COMPLETED, CANCELED(qua trip.canceled)} |
| Payment | PENDING→{COMPLETED, FAILED} (không đổi nữa) |
| Offer | PENDING→{ACCEPTED, REJECTED, SUPERSEDED} |
| Trip | DRIVER_ARRIVING→DRIVER_ARRIVED→IN_PROGRESS→COMPLETED; DRIVER_ARRIVING/DRIVER_ARRIVED→CANCELED |
| Driver | work: OFFLINE⇄ONLINE (BUSY không được OFFLINE); availability: AVAILABLE⇄BUSY |

### 10.3 Tình huống ngoại lệ
| Tình huống | Xử lý |
|---|---|
| `Payment.CreatePayment` lỗi | Booking→PAYMENT_FAILED, 503 `PAYMENT_SERVICE_UNAVAILABLE`, không matching |
| Callback FAIL | Payment FAILED, Booking PAYMENT_FAILED, không offer |
| Callback lặp (cùng paymentId và result) | trả kết quả cũ, không publish lần hai |
| Chữ ký sai | 400 `INVALID_SIGNATURE`; Payment vẫn PENDING, Booking vẫn PAYMENT_PENDING, không offer |
| Không có driver phù hợp | Booking→NO_DRIVER_FOUND ngay |
| Offer hết hạn khi accept | 410 `OFFER_EXPIRED` (không worker nền) |
| 2 driver accept đồng thời | Lua atomic + conditional UPDATE: một thắng; bên thua 409 (và release nếu cần) |
| Customer cancel cùng lúc accept | conditional UPDATE quyết định; bên thua 409 |
| Hủy Booking khi Payment đã COMPLETED | Booking CANCELED; Payment giữ COMPLETED; không refund |
| Callback SUCCESS đến sau khi Booking đã CANCELED | Payment→COMPLETED; Booking bỏ qua event, không matching, không offer |
| Notify down | nghiệp vụ chính vẫn đúng; notification có khi service healthy lại (queue durable) |
| Driver chưa có location | không xuất hiện trong nearby/matching |
| Tọa độ sai | 400 `INVALID_COORDINATES` |

---

## 11. Business Rules bắt buộc (BR)
- **BR01** Matching chỉ chọn driver `APPROVED` + `ONLINE` + `AVAILABLE` + có member trong `drivers:geo`.
- **BR02** Location không TTL, không stale check; chỉ đổi khi `PUT /drivers/me/location` hoặc seed.
- **BR03** availability chỉ AVAILABLE/BUSY.
- **BR04/05** `customerId` = Auth user_id mọi nơi; `driverId` = `driver_profiles.id`; `driverUserId` = `driver_profiles.user_id`.
- **BR06** `POST /bookings` bắt buộc `Idempotency-Key`; `fare = round(Haversine km × PRICE_PER_KM)`; client không gửi amount.
- **BR07** Booking phải nhận `Payment.CreatePayment` thành công trước khi trả response; lỗi → PAYMENT_FAILED + 503.
- **BR08** Payment chưa COMPLETED thì không matching.
- **BR09** `MATCH_RADIUS_KM` mặc định 3; tối đa `MATCH_MAX_OFFERS`=3 offer đồng thời.
- **BR10** `OFFER_TTL_SECONDS`=120; chỉ kiểm tra hết hạn lúc accept.
- **BR11** Mỗi offer ↔ một `booking.offer.created`; Notify tạo `BOOKING_OFFER` đúng `driverUserId`.
- **BR12** Trip chỉ tạo sau accept thành công + `booking.assigned`.
- **BR13** Một Booking tối đa một Driver (Redis atomic + SQL conditional update).
- **BR14** Chỉ assigned driver mới arrive/start/location/complete; START sau ARRIVED; COMPLETE khi IN_PROGRESS.
- **BR15** Trip luôn `payment_status=PAID`; không thu tiền sau Trip; không tính lại fare.
- **BR16** Cancel Booking chỉ ở PAYMENT_PENDING/SEARCHING_DRIVER; không refund.
- **BR17** Trip cancel chỉ trước IN_PROGRESS; `canceled_by` ∈ CUSTOMER|DRIVER.
- **BR18/19** Provider chỉ MOCK; amount phải khớp; mã giao dịch mock được sinh ổn định; callback lặp không publish lần hai.
- **BR20** Review chỉ cho Trip COMPLETED, đúng customer, unique (trip, customer).
- **BR21** Không service nào query DB service khác. **BR22** Publish sau COMMIT; consumer kiểm tra state hiện tại.
- **BR23** Không refund, phí, timeout payment, worker nền, refresh token, outbox, processed_events, DLQ, retry, circuit breaker, mTLS, WebSocket.

---

## 12. Dữ liệu seed (`scripts/seed.js`)

Chạy từ host: `node scripts/seed.js` **sau khi** khởi động bằng `docker compose -f docker-compose.yml -f docker-compose.debug.yml up --build` và các service đã tạo bảng. Seed kết nối từng DB bằng `X_DB_USER`/`X_DB_PASSWORD` (host `SEED_PG_HOST`, port `X_DB_DEBUG_PORT` tương ứng: auth→`AUTH_DB_DEBUG_PORT`, ...), Redis bằng `SEED_REDIS_URL`. **Idempotent**: UUID cố định, `INSERT ... ON CONFLICT (id) DO UPDATE`, Redis ghi đè cùng key. Dùng cùng thuật toán mã hóa/blind index/bcrypt như service (đặt bản sao trong `scripts/lib`). Prefix UUID: `00000000-0000-0000-0000-000000000XXX`.

### 12.1 Tài khoản (Auth `users`, mật khẩu bcrypt, email mã hóa)
| Vai trò | Email | Password | user_id (XXX) | profile/driver_id (XXX) | Trạng thái |
|---|---|---|---|---|---|
| Admin | admin@example.test | Admin@123 | 001 | - | ADMIN / ACTIVE |
| Customer 1 | customer1@example.test | Customer@123 | 101 | 111 (profile, nội bộ) | CUSTOMER / ACTIVE |
| Customer 2 | customer2@example.test | Customer@123 | 102 | 112 (profile, nội bộ) | CUSTOMER / ACTIVE |
| Driver 1 | driver1@example.test | Driver@123 | 201 | 211 | APPROVED, ONLINE, AVAILABLE |
| Driver 2 | driver2@example.test | Driver@123 | 202 | 212 | APPROVED, ONLINE, AVAILABLE |
| Driver 3 | driver3@example.test | Driver@123 | 203 | 213 | APPROVED, ONLINE, **BUSY** |
| Driver 4 | driver4@example.test | Driver@123 | 204 | 214 | APPROVED, **OFFLINE** |
| Driver 5 | driver5@example.test | Driver@123 | 205 | 215 | APPROVED, ONLINE, AVAILABLE (2-3 km) |
| Driver 6 | driver6@example.test | Driver@123 | 206 | 216 | APPROVED, **OFFLINE, BUSY** (gần Customer 1) |
| Driver 7 | driver7@example.test | Driver@123 | 207 | 217 | PENDING_REVIEW (account PENDING), **chưa có location** |

Mỗi driver có 1 `vehicles` (id 801..807) và 1 `driver_applications` (id 901..907; 1-6 `APPROVED`, 7 `PENDING_REVIEW`), biển số/GPLX giả khác nhau.

### 12.2 Vị trí tài xế (Redis, không TTL) — gốc `SEED_BASE_LAT=10.762622`, `SEED_BASE_LNG=106.660172`
| Driver | Lệch so với gốc | ≈ Khoảng cách | Redis state |
|---|---|---|---|
| 1 (211) | lat +0.003 | 0.33 km | ONLINE / AVAILABLE |
| 2 (212) | lng +0.005 | 0.55 km | ONLINE / AVAILABLE |
| 3 (213) | lat −0.004 | 0.45 km | ONLINE / BUSY |
| 4 (214) | lat +0.004, lng +0.004 | 0.62 km | OFFLINE / AVAILABLE |
| 5 (215) | lat +0.022 | 2.45 km | ONLINE / AVAILABLE |
| 6 (216) | lat +0.002, lng +0.002 | 0.31 km | OFFLINE / BUSY |
| 7 (217) | (không có) | - | không có GEO |

Kết quả matching mong đợi (`MATCH_RADIUS_KM=3`): Driver 1, 2, 5 nhận offer (đúng `MATCH_MAX_OFFERS=3`); Driver 3 (BUSY), 4 (OFFLINE), 6 (OFFLINE/BUSY), 7 (PENDING_REVIEW, không location) không nhận.

### 12.3 Booking/Payment/Trip/Review lịch sử
| STT | booking_id (XXX) | customer | pickup → destination | km | fare | status | driver | payment (XXX / status) | trip (XXX / status) | created_at |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 301 | 101 | 10.7626,106.6602 → 10.7800,106.6720 | 2.40 | 12000 | COMPLETED | 211 | 401 / COMPLETED | 501 / COMPLETED | 2026-09-30 03:00Z |
| 2 | 302 | 101 | 10.7626,106.6602 → 10.7900,106.6800 | 4.10 | 20500 | COMPLETED | 212 | 402 / COMPLETED | 502 / COMPLETED | 2026-09-30 06:00Z |
| 3 | 303 | 101 | 10.7626,106.6602 → 10.7700,106.6740 | 1.80 | 9000 | CANCELED | 211 | 403 / COMPLETED | 503 / CANCELED | 2026-09-30 09:00Z |
| 4 | 304 | 101 | 10.7626,106.6602 → 10.7830,106.6780 | 3.00 | 15000 | CANCELED | NULL | 404 / COMPLETED | - | 2026-09-30 12:00Z |
| 5 | 305 | 101 | 10.7626,106.6602 → 10.8000,106.6900 | 5.20 | 26000 | NO_DRIVER_FOUND | NULL | 405 / COMPLETED | - | 2026-09-30 15:00Z |
| 6 | 306 | 101 | 10.7626,106.6602 → 10.7820,106.6700 | 2.70 | 13500 | PAYMENT_FAILED | NULL | 406 / FAILED | - | 2026-09-30 18:00Z |
| 7 | 307 | **102** | 10.7626,106.6602 → 10.7770,106.6700 | 2.10 | 10500 | COMPLETED | 212 | 407 / COMPLETED | 507 / COMPLETED | 2026-09-30 04:00Z |

- `customer_id` trong **mọi** bảng (bookings, payments, trips, reviews) = Auth user_id (101/102), **không** dùng 111/112.
- Trip 503: `CANCELED`, `canceled_by=CUSTOMER`, `cancel_reason="Khách thay đổi kế hoạch"`. Booking 304 bị hủy khi SEARCHING_DRIVER sau khi Payment COMPLETED nên không có Trip.
- Payment amount = fare; payment `COMPLETED` có `paid_at` (cùng ngày booking), `provider_txn_id` giả duy nhất (vd `SEED-TXN-401`); payment 406 `FAILED` + `failure_code`.
- Trip seed: 501 (301/cus 101/drv 211/vehicle 801/payment 401), 502 (302/101/212/802/402), 503 (303/101/211/801/403), 507 (307/102/212/802/407); `payment_status=PAID`, `paid_at` khớp payment.
- `booking_offers` seed (status ACCEPTED): 701→301/211, 702→302/212, 703→303/211, 704→307/212.
- Review seed: id 601, trip 501, customer 101, driver 211, rating 5.
- Không seed booking đang hoạt động (PAYMENT_PENDING/SEARCHING_DRIVER/DRIVER_ASSIGNED).
- Kỳ vọng TC14: Customer1 `GET /bookings?page=1&limit=3` → `total=6, totalPages=2`, 3 dòng mới nhất; `?status=COMPLETED` → 2 dòng; Customer1 `GET /bookings/307` → 403. **Chạy TC14 trước khi tạo booking mới cho Customer1** (muốn chạy lại: `docker compose down -v` rồi up + seed lại).

---
## 13. Bảo mật (tiêu chí 24-30) - checklist cài đặt

| Hạng mục | Yêu cầu cài đặt |
|---|---|
| TC24 Mã hóa dữ liệu lưu trữ | Password bcrypt (cost ≥10). Email, phone, biển số, GPLX mã hóa AES-256-GCM dạng `v1:<iv>:<tag>:<cipher>`; lookup bằng blind index HMAC-SHA256 (`BLIND_INDEX_KEY` riêng). Khóa chỉ từ env (`ENCRYPTION_KEY_V1`, `ENCRYPTION_ACTIVE_KEY_ID`, `BLIND_INDEX_KEY`, `JWT_SECRET`), không hard-code, không commit. Xoay khóa: thêm `ENCRYPTION_KEY_V2` + đổi `ACTIVE_KEY_ID=v2` cho dữ liệu mới; decrypt đọc prefix chọn khóa. README mô tả cách xoay khóa. |
| TC25 SQL Injection | Validate input bằng zod + 100% parameterized query. Login với `identifier="' OR 1=1 --"` → 400 `VALIDATION_ERROR` hoặc 401 `INVALID_CREDENTIALS`; không lộ lỗi DB. |
| TC26 XSS | `escapeHtml` trước khi lưu (displayName, fullName, address, comment, reason...); Helmet ở Gateway. Gửi `<script>alert('hack')</script>` → lưu/trả `&lt;script&gt;alert(&#39;hack&#39;)&lt;/script&gt;`. |
| TC27 JWT tampering | HS256 whitelist, kiểm `exp`, từ chối `alg=none`; sửa payload (sub/role) giữ signature cũ → 401 `INVALID_TOKEN`. |
| TC28 Unauthorized | RBAC ở Gateway + ownership ở service. Customer gọi `PUT /drivers/me/status` → 403 `FORBIDDEN`, không có data. |
| TC29 Rate limit | §9.3. Spam → 429 `RATE_LIMITED` + `Retry-After`; sau đó `GET /health` vẫn 200. |
| TC30 Replay/Idempotency | `Idempotency-Key` ở `POST /bookings` (cùng key+body → cùng bookingId/paymentId + `Idempotent-Replayed: true`; khác body → 422). Callback lặp cùng `paymentId` không publish lần hai. |

Khác: service gRPC kiểm `x-service-token`; không lộ stack trace; không log secret/PII; `.env` không commit.

---

## 14. Sản phẩm kiểm thử cần sinh

### 14.1 Postman
- `postman/CABSYSTEM_API.postman_collection.json` + `CABSYSTEM_API.postman_environment.json`.
- Biến environment: `baseUrl=http://localhost:3000/api/v1`, `PAYMENT_CALLBACK_SECRET`, `adminToken`, `customerToken`, `customer2Token`, `driver1Token`, `driver2Token`, `bookingId`, `paymentId`, `fare`, `offerId`, `tripId`, `idemKey`...
- Mỗi request có script `pm.test` kiểm status/field chính và lưu id vào biến. Thứ tự folder: Health → Auth/Customer → Driver onboarding/Admin → Driver status/location/nearby → Booking+Payment → Offer/Accept → Trip → Review → Cancel → Payment FAIL → Seed paging (TC14) → Security (TC24-30).
- Callback mock chỉ cần body `{ "paymentId": "...", "amount": 12000, "result": "SUCCESS" }`; hệ thống tự sinh mã giao dịch mock.
- Lưu ý rate limit khi chạy Runner: login giới hạn 5/phút/IP và mặc định 100 req/phút/IP → thêm delay giữa request (≥ 700 ms; login cách nhau ≥ 12 s) hoặc tạm tăng giá trị trong `.env` khi chạy full collection, rồi trả về mặc định khi test TC29. README ghi rõ điều này.

### 14.2 `huong-dan-test/TCxx.md`
Mỗi file (TC01...TC30) gồm: **Mục tiêu**, **Điều kiện trước** (seed/token), **Các bước** (request cụ thể: method, URL, header, body, hoặc lệnh `docker compose ...`/SQL kiểm tra), **Kết quả mong đợi**, **Cách chụp minh chứng**. Dùng dữ liệu seed ở §12.

### 14.3 Danh sách 30 tiêu chí và kết quả mong đợi
| TC | Tiêu chí | Endpoint / thao tác | Kết quả mong đợi |
|---|---|---|---|
| 01 | Mô tả kiến trúc source | cây thư mục §2 | Đúng cấu trúc, trách nhiệm từng thư mục |
| 02 | .gitignore & .env | xem file | `.env` bị ignore; `.env.example` có mẫu |
| 03 | Nhiệm vụ Gateway | §9 | Giải thích routing, JWT, RBAC, rate limit, REST↔gRPC |
| 04 | IPC microservice | §5, §6 | Nêu đúng RPC đồng bộ vs event bất đồng bộ |
| 05 | Compose + container | `docker compose ps` | gateway, 7 service, **7 container DB**, redis, rabbitmq (17 container) đều Up/healthy |
| 06 | Health check | GET /health, /ready, /health/services | 200 healthy/ready + danh sách component; dừng 1 service → 503 |
| 07 | RabbitMQ | UI :15672 | Thấy exchange `ride.events`, 3 queue + binding; offer/assigned event được consume |
| 08 | Mọi request qua Gateway | `localhost:3000` vs `localhost:50051..50057` (và port DB khi chạy chế độ thường) | 3000 OK; 50051-50057 connection refused (kể cả khi chạy debug); DB không truy cập được ở chế độ thường |
| 09 | Đăng ký Customer | POST /auth/register | 201 `status=ACTIVE`; login được |
| 10 | Login Customer | POST /auth/login | 200 `accessToken`; sai mật khẩu 401 |
| 11 | Lấy Customer theo mã | GET /customers/:id | Owner/Admin 200; customer khác 403 |
| 12 | Lấy Driver theo mã | GET /drivers/:id | 200 safe fields (không licenseNumber/userId) |
| 13 | Nearby drivers | GET /drivers/nearby?radiusKm=1 | Driver 1-4 trong 1 km, có `distanceMeters` tăng dần, paging/limit đúng |
| 14 | List Booking | GET /bookings?status&page&limit | Customer1 total=6; page limit=3 → totalPages=2; COMPLETED=2; xem 307 → 403 |
| 15 | Đặt xe | POST /bookings + callback | PAYMENT_PENDING → (callback SUCCESS) → SEARCHING_DRIVER + offers |
| 16 | Driver nhận chuyến | notifications → offers → accept | BOOKING_OFFER → accept → DRIVER_ASSIGNED; response accept trả `tripId`, Trip được tạo bất đồng bộ |
| 17 | Trip lifecycle | arrive → start → location → complete | Đúng trình tự; `payment_status=PAID`; vị trí cuối lưu |
| 18 | Hủy chuyến | /bookings/:id/cancel, /trips/:id/cancel | CANCELED; driver release; 2 bên có notification; không refund |
| 19 | Thanh toán giả lập | POST /payments/mock/callback | PENDING→COMPLETED; Booking bắt đầu matching; chữ ký sai 400 |
| 20 | Review | POST /reviews; GET /reviews | rating 1..5 lưu theo trip/customer; review trùng 409 |
| 21 | Đăng ký Driver OTP | otp request trả OTP → verify + POST /drivers/applications | `PENDING_REVIEW` |
| 22 | Duyệt Driver | admin list/detail/approve/reject | Status đổi; driver nhận DRIVER_APPROVED/REJECTED |
| 23 | ONLINE/OFFLINE | PUT /drivers/me/status | Đổi được; BUSY → OFFLINE trả 409 `DRIVER_BUSY` |
| 24 | Encryption at rest | `SELECT` trực tiếp trong `auth-db`/`driver-db` (`docker compose exec auth-db psql ...` hoặc port debug) | password bcrypt; PII là ciphertext `v1:...` |
| 25 | SQL injection | login `' OR 1=1 --` | 400/401, không bypass, không lộ lỗi DB |
| 26 | XSS | `<script>` trong displayName/comment | Trả về dạng đã escape |
| 27 | JWT tampering | token sửa payload | 401 `INVALID_TOKEN` |
| 28 | Unauthorized | Customer gọi API Driver | 403 `FORBIDDEN`, không data |
| 29 | Rate limit | spam request | 429 `RATE_LIMITED` + `Retry-After`; `/health` vẫn 200 |
| 30 | Replay/idempotency | replay POST /bookings & callback | cùng bookingId/paymentId + `Idempotent-Replayed:true`; khác body 422; callback lặp không publish lần hai |

---

## 15. Thứ tự build và tiêu chí hoàn thành

### 15.1 Thứ tự
1. Khung dự án: `.gitignore`, `.env`, `.env.example`, `docker-compose.yml`, `contracts/proto`.
2. Hạ tầng: 7 container Postgres riêng (DB/user tạo bằng biến môi trường), redis, rabbitmq + healthcheck; viết `docker-compose.debug.yml`.
3. Auth + Gateway: register/login/JWT/OTP, RBAC, rate limit, health.
4. Customer: profile + reviews.
5. Driver: application/approval/status/location/nearby + `TryAssignDriver`/`ReleaseDriver`.
6. Payment: `CreatePayment`, `GetPayment`, `HandleCallback` (mock callback tối giản, events).
7. Booking: idempotency, Haversine×5000, PAYMENT_PENDING, gọi Payment, consume payment events, matching + offers + accept/reject/cancel.
8. Notify: consume events → notifications.
9. Trip: consume `booking.assigned`, lifecycle, cancel.
10. Seed idempotent, Postman collection, `huong-dan-test/TC01..TC30`, README; chạy toàn bộ smoke test.

### 15.2 Definition of Done
- [ ] `docker compose up --build` chạy sạch; `docker compose ps` đủ **17 container** (gateway, 7 service, 7 DB, redis, rabbitmq), healthy; 7 database tự được tạo.
- [ ] `docker compose -f docker-compose.yml -f docker-compose.debug.yml up` map 7 DB (+ redis) ra các port host khác nhau (5433-5439, 6379), kết nối được bằng DBeaver/psql.
- [ ] Chế độ thường chỉ publish gateway `3000` và RabbitMQ UI `15672`; DB/Redis chỉ publish khi dùng file debug; 50051-50057 không bao giờ truy cập được từ host.
- [ ] `/health`, `/ready`, `/health/services` đúng như §4.4.
- [ ] Seed chạy lặp lại không lỗi; TC14 đúng số liệu.
- [ ] Luồng đặt xe đầy đủ (§10.1) chạy bằng Postman; FAIL path và cancel path đúng.
- [ ] Không có WebSocket, refresh token, refund, outbox, DLQ, retry, worker nền, cổng thanh toán ngoài.
- [ ] Không secret trong git; `.env.example` đủ biến.
- [ ] 30 file `huong-dan-test/TCxx.md` + Postman collection khớp §14.3.
- [ ] Mỗi service chia lớp `grpc/services/repositories/events/config`, không hard-code.

---

## 16. Quyết định bổ sung và làm rõ (nghiệp vụ gốc còn thiếu)

Các điểm dưới đây nguồn nghiệp vụ chưa nêu rõ; **đã chốt ở đây, Codex làm đúng như vậy**:

1. **Đăng ký Driver cần credentials**: `POST /drivers/applications` bổ sung `email` và `password` (6..72) để Driver đăng nhập được sau khi duyệt.
2. **Mật khẩu tối thiểu 6 ký tự** (smoke test TC24 dùng mật khẩu `123400`).
3. **Event bổ sung trường** (để Notify không phải gọi service khác): `trip.arrived/started/completed/canceled` thêm `driverUserId`; `booking.assigned` thêm `supersededDriverUserIds[]`. Trip lấy `driverUserId` qua `Driver.GetDriver`.
4. **`Driver.GetDriver` nhận `driverId` hoặc `userId`** (Booking/Trip cần đổi `x-user-id` → `driverId`).
5. **Định danh người gọi dùng metadata**, không truyền trong body; cuộc gọi không có `x-user-id` là nội bộ tin cậy (bỏ qua ownership).
6. **`paidAt` cho `booking.assigned`**: Booking gọi `Payment.GetPayment` lúc accept.
7. **`UpdateTripLocation` chỉ hợp lệ khi trip `IN_PROGRESS`** (khớp thứ tự smoke test arrive → start → location → complete).
8. **Booking có `fare <= 0`** (điểm đón ≈ điểm đến) → 400 `INVALID_COORDINATES` (vì Payment yêu cầu amount > 0).
9. **Onboarding token** là JWT HS256 `{purpose:"DRIVER_ONBOARDING", phone}`; Auth sinh OTP ngẫu nhiên 6 chữ số và **trả OTP về client để demo**.
10. **Account chưa ACTIVE** (driver PENDING/REJECTED) login đúng mật khẩu → 403 `ACCOUNT_NOT_ACTIVE`.
11. **Health DB của Gateway**: do mỗi DB là container riêng, Gateway kiểm tra bằng kết nối TCP tới `X_DB_ADDR` (không credential); `SELECT 1` do gRPC Health của từng service thực hiện.
12. **Migration** là `migrations/schema.sql` idempotent chạy khi service khởi động (không dùng thư viện migration).
13. **Seed chạy từ host** qua các port trong `docker-compose.debug.yml` (5433-5439 cho DB, 6379 cho Redis); không thêm container seed. Không còn `init-postgres.sh`: DB/user do biến môi trường của từng container Postgres tạo ra.
14. **Mã lỗi nghiệp vụ** truyền qua gRPC trailer `error-code` (§3.5); xung đột trạng thái dùng `ABORTED`.
15. **Ví dụ số trong tài liệu gốc mang tính minh họa** (ví dụ `distanceKm=4.60, fare=23000`); phải tính thật bằng Haversine.
16. **Reject offer** không kích hoạt tìm tài xế bổ sung; booking giữ `SEARCHING_DRIVER` (không worker nền).
17. **Admin list booking** có thể lọc thêm `customerId`; Driver không có quyền truy cập `/bookings`.
