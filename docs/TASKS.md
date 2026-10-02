# TASKS.md - Kế hoạch build CABSYSTEM_API (chia nhỏ để Codex không hết context)

> Đọc `AGENTS.md` trước. File này là **bản đồ làm việc + sổ ghi tiến độ**. Nội dung nghiệp vụ nằm ở `SPEC.md`.
> Số dòng SPEC ghi trong ngoặc là **gần đúng** (tra theo tiêu đề `§`, nếu lệch thì tìm bằng `grep -n '^### 8.4' SPEC.md`).

---

## 0. TRẠNG THÁI HIỆN TẠI (Codex cập nhật khối này sau MỖI task)

```
Task đang làm   : (không có)
Task đã xong    : T00, T01, T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12, T13, T14, T15, T16, T17, T18
Task kế tiếp    : T19
Dở dang / BLOCKED: (không có)
Lệnh dev đã đổi tạm (phải trả lại ở T36): khuyến nghị cục bộ `RATE_LIMIT_LOGIN_PER_MIN=100` khi phát triển; giữ mặc định 5 trong `.env.example`.
Giả định đã ghi README: thêm `id` vào CustomerProfile (proto) theo yêu cầu checklist T10; Auth T11 kiểm độ dài displayName sau escape nhưng gửi giá trị gốc để Customer escape đúng một lần trước khi lưu; Gateway đặt `trust proxy=false` nên `req.ip` là địa chỉ socket Docker, login chỉ qua `loginLimiter` và default limiter bỏ qua health bằng so khớp path chính xác; `.env` từng có giá trị bí mật không đủ mạnh, đã sinh lại không in giá trị và reset Docker volume dev; T18: proto3 không phân biệt `radiusKm` không gửi với `0`, nên theo checklist T18 chọn `0` (và giá trị mặc định proto khi không gửi) là `INVALID_ARGUMENT`, còn radius hợp lệ là `(0,50]`
```

---

## 1. Quy tắc phiên làm việc (BẮT BUỘC)

**Mặc định: 1 task = 1 phiên Codex.** Hết task thì dừng, chờ người dùng bảo "làm tiếp".

Vòng lặp của mỗi phiên:
1. Đọc `AGENTS.md`, khối **§0 Trạng thái hiện tại**, và ~20 dòng cuối **§5 Nhật ký**.
2. Chọn task đầu tiên chưa tick trong **§2 Bảng tiến độ** (hoặc task đang `DỞ DANG`).
3. **Chỉ đọc** các mục SPEC ghi ở dòng `Đọc` của task đó, bằng `sed -n 'A,Bp' SPEC.md`. Không đọc cả SPEC. Không mở code của service khác, trừ file được ghi rõ.
4. Làm đúng danh sách `Làm`. Không làm thêm, không sửa task đã xong (trừ khi nghiệm thu phát hiện lỗi thật, khi đó ghi log).
5. Chạy **toàn bộ** `Nghiệm thu`. Tick từng ô `- [ ]` ngay khi đạt.
6. Khi tất cả đạt: (a) tick dòng task ở **§2**, (b) thêm 1 mục vào **§5 Nhật ký**, (c) cập nhật **§0**, (d) `git add -A && git commit -m "Txx: <tên task>"` (nếu có git).
7. Dừng.

**Chống hết context:**
- Không dán lại file dài vào câu trả lời; chỉ nêu đường dẫn + tóm tắt 1-2 dòng.
- Không chạy lệnh in log dài; dùng `docker compose logs --tail=30 <svc>`.
- Task sắp vượt ~15 file mới hoặc ~600 dòng code → chia `Txx-a`/`Txx-b`, ghi log, làm `a` trước.
- Xong mỗi cụm file lớn trong task thì ghi **Checkpoint** vào log (1 dòng), để phiên sau biết đã làm tới đâu.
- Nếu hết ngân sách giữa chừng: ghi log trạng thái `DỞ DANG` (đã làm gì, còn gì, file nào chạm dở) rồi dừng. Phiên sau tiếp tục từ đó, không làm lại từ đầu.
- Cùng một lỗi nghiệm thu thất bại **3 lần** → ghi `BLOCKED` kèm nguyên nhân nghi ngờ, dừng. Không tự đổi SPEC.

**Công cụ nghiệm thu dùng chung** (không commit các lệnh tạm):
- `[curl]`: `curl -s -X POST localhost:3000/api/v1/... -H 'Content-Type: application/json' -d '{...}'`. Lấy token một lần, lưu vào biến shell/`/tmp`, đừng login lặp (login giới hạn 5/phút; khi dev có thể tăng `RATE_LIMIT_LOGIN_PER_MIN` trong `.env` và ghi vào §0, trả lại ở T36).
- `[psql]`: `docker compose exec <x>-db psql -U <x>_user -d <x>_db -c "SELECT ..."`.
- `[redis]`: `docker compose exec redis redis-cli ...`.
- `[gRPC-call]` (gọi RPC nội bộ khi chưa có route Gateway), chạy trong container của service đích; proto được mount ở `/app/contracts/proto`:
  ```
  docker compose exec <svc> node -e "const g=require('@grpc/grpc-js'),l=require('@grpc/proto-loader');
  const d=g.loadPackageDefinition(l.loadSync('/app/contracts/proto/<file>.proto',{keepCase:false,longs:Number,enums:String,defaults:true,oneofs:true}));
  const c=new d.cab.<svc>.v1.<Service>('localhost:<port>',g.credentials.createInsecure());
  const m=new g.Metadata();m.set('x-service-token',process.env.INTERNAL_SERVICE_TOKEN);/*m.set('x-user-id','..');m.set('x-user-role','..')*/
  c.<Rpc>({...},m,(e,r)=>console.log(e&&e.code,e&&e.details,e&&e.metadata&&e.metadata.get('error-code'),JSON.stringify(r)))"
  ```
- `[rmq-tmp]` (xem event khi chưa có consumer): UI `http://localhost:15672` (user `cab`) → tạo queue tạm `tmp.q`, bind vào `ride.events` với routing key cần xem, dùng "Get messages"; xong thì xóa queue.

---

## 2. BẢNG TIẾN ĐỘ (tick khi task nghiệm thu xong)

**A. Khung & hạ tầng**
- [x] T00 Khung repo, `.gitignore`, `.env`, `.env.example`
- [x] T01 Proto contracts (9 file)
- [x] T02 Skeleton service dùng chung (làm mẫu trên auth-service)
- [x] T03 Nhân bản skeleton cho 6 service còn lại
- [x] T04 `docker-compose.yml` + `docker-compose.debug.yml` + gateway stub (TC05, TC08)

**B. Gateway, Auth, Customer**
- [x] T05 Gateway core (middleware, gRPC client, map lỗi)
- [x] T06 Gateway health `/health` `/ready` `/health/services` (TC06)
- [x] T07 Utils bảo mật (crypto, blind index, escapeHtml)
- [x] T08 Auth: users + Login + GetUser + SetAccountStatus + CreateDriverAccount
- [x] T09 Auth: OTP (Redis)
- [x] T10 Customer: profile (Create/Get/Update)
- [x] T11 Auth: RegisterCustomer (gọi Customer)
- [x] T12 Gateway: JWT + RBAC + zod + route auth/customers (TC09-11, 25-28)
- [x] T13 Gateway: rate limit (TC29)

**C. Driver**
- [x] T14 Driver: schema + SubmitApplication + Get/ListApplications
- [x] T15 Driver: Approve/Reject + publish event
- [x] T16 Driver: SetWorkStatus + UpdateLocation + GetDriver
- [x] T17 Seed phần A (auth, customer, driver, Redis)
- [x] T18 Driver: SearchNearby + TryAssign/ReleaseDriver (Lua)
- [ ] T19 Gateway: route driver/admin (TC12, 13, 21-23)

**D. Payment, Booking, Notify**
- [ ] T20 Payment service + route payment (TC19)
- [ ] T21 Booking: schema + CreateBooking (idempotency) + Get/List + route
- [ ] T22 Booking: consumer payment.* + matching + offers
- [ ] T23 Notify service + route notifications (TC07)
- [ ] T24 Booking: ListMyOffers/Accept/Reject/Cancel + route (TC15, 16, 18)

**E. Trip, Review**
- [ ] T25 Trip: schema + consumer booking.assigned + Get/GetByBooking + route
- [ ] T26 Trip: Arrive/Start/UpdateLocation/Complete + event (TC17)
- [ ] T27 Trip: Cancel + Booking consume trip.completed/canceled (TC18)
- [ ] T28 Customer: Reviews + route (TC20)

**F. Seed B, test, tài liệu, nghiệm thu cuối**
- [ ] T29 Seed phần B (booking, payment, trip, review) (TC14)
- [ ] T30 Postman phần 1 (Health → Booking+Payment)
- [ ] T31 Postman phần 2 (Offer → Security)
- [ ] T32 `huong-dan-test/TC01..TC10.md`
- [ ] T33 `huong-dan-test/TC11..TC20.md`
- [ ] T34 `huong-dan-test/TC21..TC30.md`
- [ ] T35 README
- [ ] T36 Hồi quy toàn bộ + Definition of Done §15.2

---

## 3. CHI TIẾT TỪNG TASK

### A. Khung & hạ tầng

#### T00 - Khung repo, `.gitignore`, `.env`, `.env.example`
- **Đọc:** §0 (8-19), §2 (42-75), §4.3 (223-292).
- **Làm:**
  - Tạo cây thư mục đúng §2 (thư mục rỗng thêm `.gitkeep`).
  - `.gitignore` đúng danh sách tối thiểu ở §2.
  - `.env`: giá trị dev chạy được ngay, secret sinh bằng `openssl rand` (JWT_SECRET, INTERNAL_SERVICE_TOKEN, BLIND_INDEX_KEY, PAYMENT_CALLBACK_SECRET, mật khẩu 7 DB; `ENCRYPTION_KEY_V1` = `openssl rand -base64 32`). **Viết giá trị đầy đủ, không dùng `${...}` lồng nhau.**
  - Các dòng gộp 2 biến (vd `AUTH_GRPC_PORT=... AUTH_GRPC_ADDR=...`) **phải tách thành mỗi biến một dòng**.
  - Đủ bộ biến cho cả 7 service: `X_DB_NAME/USER/PASSWORD/ADDR/DEBUG_PORT`, `X_DATABASE_URL`, `X_GRPC_PORT/ADDR`.
  - `.env.example`: cùng danh sách biến, giá trị mẫu.
- **Nghiệm thu:**
  - [x] `git check-ignore .env` in ra `.env`.
  - [x] `diff <(grep -oE '^[A-Z0-9_]+=' .env | sort) <(grep -oE '^[A-Z0-9_]+=' .env.example | sort)` rỗng.
  - [x] Cây thư mục khớp §2 (`find . -maxdepth 3 -type d | sort`).
  - [x] Không có dòng nào chứa 2 biến.

#### T01 - Proto contracts
- **Đọc:** §5 (310-358), §3.3 enum (94-108), §3.1 loader options (85).
- **Làm:** Tạo `contracts/proto/{common,health,auth,customer,driver,booking,trip,payment,notify}.proto`.
  - `package cab.<service>.v1`; `common.proto`: `Empty, Location{lat,lng,address}, PageRequest, PageInfo{page,limit,total,total_pages}`.
  - `health.proto` = chuẩn `grpc.health.v1` (Check).
  - Đủ **mọi RPC** ở bảng §5 với message request/response đúng field; `DriverInfo`, `DriverNearby`; timestamp là `string`, tiền là `int64`; field `snake_case`.
  - Không có `userId` của người gọi trong request (trừ chỗ bảng ghi rõ, vd `GetDriver{user_id}`, `CreateCustomerProfile{user_id}`, `GetCustomer{user_id}`).
- **Nghiệm thu:**
  - [x] Nạp được toàn bộ proto: `docker run --rm -v "$PWD/contracts:/c" -w /tmp node:20-alpine sh -c "npm i @grpc/proto-loader >/dev/null 2>&1 && node -e \"const l=require('@grpc/proto-loader');for(const f of ['common','health','auth','customer','driver','booking','trip','payment','notify'])l.loadSync('/c/proto/'+f+'.proto',{keepCase:false,longs:Number,enums:String,defaults:true,oneofs:true});console.log('OK')\""` in `OK`.
  - [x] Đếm RPC khớp bảng §5: Auth 7, Customer 5, Driver 11, Booking 8 (+MarkTripCompleted/Canceled = 9), Trip 7, Payment 3, Notify 3 (`grep -c 'rpc ' contracts/proto/*.proto`).

#### T02 - Skeleton service dùng chung (làm mẫu trên `auth-service`)
- **Đọc:** §3.1 (79-87), §3.6 (135-140), §3.8 (149-151), §4.1 dòng healthcheck (180-182), §4.4 phần gRPC Health (300-301), §6 cách consumer/producer (362-367).
- **Làm:** trong `services/auth-service/`:
  - `package.json` (đúng dependency §3.1), `Dockerfile` (`node:20-alpine`, chỉ copy code service; proto sẽ **mount** `/app/contracts/proto` từ compose).
  - `src/config/index.js` (đọc env, thiếu biến bắt buộc → báo rõ + `process.exit(1)`).
  - `src/utils/{logger,errors,grpcAuth,proto}.js`: log JSON một dòng; `makeError(grpcCode, errorCode, message)` đặt trailer `error-code`; interceptor kiểm `x-service-token` (UNAUTHENTICATED); loader proto đúng options §3.1.
  - `src/db/pg.js` (Pool, retry ~30 lần/2s, `runMigrations()` đọc `migrations/schema.sql`), `src/db/redis.js`, `src/events/rabbit.js` (connect+retry, `publish(routingKey, payload, correlationId)` đúng envelope §6, helper `consume(queue, bindings, handler)` với prefetch 10, manual ack, nack requeue=false).
  - `src/grpc/health.js` (SERVING chỉ khi Postgres `SELECT 1` OK, + Redis/RabbitMQ nếu service dùng), `src/server.js` (retry deps → migrate → listen `X_GRPC_PORT` → start consumer; SIGTERM tắt êm), `src/healthcheck.js` (gọi Health/Check vào chính nó kèm token), `migrations/schema.sql` (tạm là comment).
- **Nghiệm thu:**
  - [x] `node --check` mọi file `.js` của service không lỗi.
  - [x] `docker build -t auth-test services/auth-service` thành công.
  - [x] Đọc lại: không có URL/port/secret hard-code trong `src/` (`grep -rnE 'localhost|5432|50051' services/auth-service/src` rỗng).
  - Ghi log: danh sách file helper (để T03 nhân bản đúng).

#### T03 - Nhân bản skeleton cho 6 service còn lại
- **Đọc:** §3.1 (dependency từng service, 83-85), §4.1 bảng (160-169). Mở **chỉ** `services/auth-service/` để copy.
- **Làm:** tạo `customer, driver, booking, trip, payment, notify-service` từ mẫu T02; chỉ đổi: tên service trong log, `X_GRPC_PORT`, `X_DATABASE_URL`.
  - Dependency theo §3.1: `ioredis` chỉ auth+driver; `amqplib` chỉ driver, booking, trip, payment, notify; `bcryptjs`+`jsonwebtoken` chỉ auth.
  - Xóa helper không dùng (vd customer không cần redis/rabbit, auth không cần rabbit).
  - Health Check mỗi service chỉ kiểm dependency của chính nó.
  - Handler RPC chưa làm trả `UNIMPLEMENTED`.
- **Nghiệm thu:**
  - [x] `for s in customer driver booking trip payment notify; do docker build -t $s-test services/$s-service || echo FAIL $s; done` không FAIL.
  - [x] `node --check` toàn bộ `.js` mới.
  - [x] `grep -L amqplib services/*/package.json` chỉ ra đúng auth và customer.

#### T04 - `docker-compose.yml` + `docker-compose.debug.yml` + gateway stub
- **Đọc:** §4.1 (157-184), §4.2 (186-201), §4.2.1 (203-221), §2 quy tắc repo (70-73).
- **Làm:**
  - `gateway/` stub tối thiểu: `package.json`, `Dockerfile`, `src/server.js` chỉ có `GET /health` → 200 `{"status":"healthy"}`, healthcheck compose cho gateway.
  - `docker-compose.yml`: đủ **17 container**; 7 Postgres (`postgres:16-alpine`, tự tạo DB/user bằng `POSTGRES_*`, volume riêng, `pg_isready`), redis, rabbitmq (chỉ publish `15672`), 7 service, gateway (`3000:3000`). `depends_on: condition: service_healthy`. Mỗi service chỉ nhận env của chính nó. Mount `./contracts/proto:/app/contracts/proto:ro` cho gateway và 7 service. Không publish port gRPC/DB/Redis.
  - `docker-compose.debug.yml`: chỉ **thêm `ports`** cho 7 DB + redis (`${X_DB_DEBUG_PORT}:5432`, `${REDIS_DEBUG_PORT}:6379`).
- **Nghiệm thu:**
  - [x] `docker compose config -q` OK; `docker compose up -d --build` chạy sạch.
  - [x] `docker compose ps` đủ 17 container, tất cả `healthy`/`running` (chờ tối đa ~2 phút).
  - [x] `curl -s localhost:3000/health` → `{"status":"healthy"}`.
  - [x] Chế độ thường: `nc -zv localhost 5433` và `nc -zv localhost 6379` thất bại; `nc -zv localhost 50051` ... `50057` thất bại; `15672` mở.
  - [x] Chế độ debug (`-f docker-compose.yml -f docker-compose.debug.yml up -d`): 5433-5439 và 6379 mở; `50051-50057` vẫn **đóng**.
  - [x] `[psql]` vào `auth-db` thấy database `auth_db`.
  - Lưu ý: kể từ đây dùng `docker compose up -d --build <svc>` để rebuild riêng từng service.

### B. Gateway, Auth, Customer

#### T05 - Gateway core
- **Đọc:** §3.4 (110-116), §3.5 (118-133), §3.6 (135-140), §9.1 (748-749), §3.7 dòng zod (147).
- **Làm:** trong `gateway/src/`:
  - `config/index.js`; middleware `correlationId` (UUID, header `x-correlation-id` trên mọi response), `helmet`, `express.json({limit:'100kb'})`, error handler (JSON hỏng → 400 `VALIDATION_ERROR`; route lạ → 404 `NOT_FOUND`; lỗi không rõ → 500 không lộ chi tiết).
  - `utils/response.js` (`{data}`, `{data,pagination}`, `{error:{code,message,correlationId}}`).
  - `grpc-clients/` (factory tạo client cho 7 service, build metadata §3.6, deadline `GRPC_DEADLINE_MS`, promisify) + `utils/grpcError.js` map **đúng bảng §3.5** (đọc trailer `error-code` trước, rồi theo status code; thêm `Retry-After` cho 429).
  - `utils/validate.js` (zod helper, lỗi → 400 `VALIDATION_ERROR`; helper phân trang `page≥1`, `limit≤50`).
  - Mount router rỗng ở `/api/v1`; thứ tự middleware đúng §9.1 (các bước chưa làm chừa chỗ).
- **Nghiệm thu:**
  - [x] `curl -si localhost:3000/api/v1/khong-co` → 404, body `error.code=NOT_FOUND` có `correlationId`, có header `x-correlation-id`.
  - [x] `curl -s -X POST localhost:3000/api/v1/auth/login -H 'Content-Type: application/json' -d '{bad'` → 400 `VALIDATION_ERROR`.
  - [x] Test bảng map lỗi bằng `node -e` gọi hàm map với các cặp (status, error-code) trong §3.5; mọi dòng đúng HTTP + code.

#### T06 - Gateway health
- **Đọc:** §4.4 (294-304), §4.5 (306-307).
- **Làm:** `GET /health`, `/ready`, `/health/services` ở **cả** `/` và `/api/v1`. `/health/services` + `/ready` kiểm 7 service qua gRPC Health (kèm token), 7 DB bằng **TCP connect** tới `X_DB_ADDR` (timeout ngắn, không credential), Redis `PING`, RabbitMQ mở/đóng connection. Đủ 16 component name như §4.4, có `latencyMs`. Unhealthy → 503 (`/ready` trả `NOT_READY`). Không rate limit.
- **Nghiệm thu:**
  - [x] `/health`, `/ready`, `/health/services` (cả hai prefix) → 200, `/health/services` liệt kê đúng 16 component, tất cả healthy.
  - [x] `docker compose stop notify-service` → `/ready` 503 `NOT_READY`, `/health/services` 503 và `notify-service` unhealthy; `docker compose start notify-service` → trở lại 200.
  - [x] `docker compose stop notify-db` → component `notify-db` unhealthy; bật lại → healthy.
  - [x] Tắt/bật `redis`, `rabbitmq` tương tự (mỗi cái 1 lần).

#### T07 - Utils bảo mật
- **Đọc:** §3.7 (142-147), §13 hàng TC24 (924).
- **Làm:** trong `services/auth-service/src/utils/`: `crypto.js` (AES-256-GCM, IV 12 byte, định dạng `v1:<iv_b64>:<tag_b64>:<cipher_b64>`, chọn khóa theo prefix `ENCRYPTION_KEY_V1/V2`, ghi bằng `ENCRYPTION_ACTIVE_KEY_ID`), `blindIndex.js` (HMAC-SHA256 hex 64, chuẩn hóa email/phone/plate/license như §3.7), `escapeHtml.js` (`& < > " '`).
- **Nghiệm thu** (`node -e` trong container, không commit):
  - [x] encrypt→decrypt trả đúng bản rõ; 2 lần encrypt cùng input cho ciphertext khác nhau; bắt đầu bằng `v1:`.
  - [x] Sửa 1 ký tự ciphertext → decrypt ném lỗi.
  - [x] `blindIndex(' A@B.com ') === blindIndex('a@b.com')`, dài 64 ký tự; phone `+84 90-123` chuẩn hóa bỏ khoảng trắng/dấu `-`.
  - [x] `escapeHtml("<script>alert('hack')</script>")` = `&lt;script&gt;alert(&#39;hack&#39;)&lt;/script&gt;`.
  - [x] Đặt `ENCRYPTION_KEY_V2` + `ACTIVE_KEY_ID=v2` thử: ghi mới ra `v2:`, vẫn giải mã được bản `v1:`.

#### T08 - Auth: users + Login + GetUser + SetAccountStatus + CreateDriverAccount
- **Đọc:** §7.1 (404-422), §8.1 các mục Login, CreateDriverAccount, SetAccountStatus/GetUser (641, 644-645), §3.2 (89-92).
- **Làm:** `migrations/schema.sql` (bảng `users` + index); `repositories/userRepo.js` (SQL parameterized); `services/authService.js` (Login: tra `email_bidx`/`phone_bidx`, cùng thông điệp lỗi cho sai user/sai mật khẩu, `status != ACTIVE` → 403 `ACCOUNT_NOT_ACTIVE`, JWT HS256 `{sub,role,iat,exp}`, **không refresh**; CreateDriverAccount; SetAccountStatus chỉ `ACTIVE|REJECTED`; GetUser); `grpc/` handlers. Mật khẩu 6..72, bcrypt cost từ env.
- **Nghiệm thu** (`[gRPC-call]` vào auth-service):
  - [x] CreateDriverAccount → `status=PENDING`; Login đúng mật khẩu → `PERMISSION_DENIED` + `error-code=ACCOUNT_NOT_ACTIVE`.
  - [x] SetAccountStatus ACTIVE → Login trả `accessToken`, `tokenType=Bearer`, `expiresIn=3600`; token decode có `sub`, `role=DRIVER`, `exp`.
  - [x] Sai mật khẩu và email không tồn tại → cùng `UNAUTHENTICATED` + `INVALID_CREDENTIALS`.
  - [x] `[psql]` auth-db: `email_enc` bắt đầu `v1:`, `password_hash` bắt đầu `$2`, `email_bidx` dài 64.
  - [x] SetAccountStatus với `PENDING` → `INVALID_ARGUMENT`. Gọi không có token nội bộ → `UNAUTHENTICATED`.

#### T09 - Auth: OTP (Redis)
- **Đọc:** §8.1 RequestOtp/VerifyOtp (642-643), §7.1 dòng Redis OTP (422), §4.3 nhóm OTP (242-245), §16 mục 9 (1031).
- **Làm:** `RequestOtp{phone}` sinh OTP ngẫu nhiên 6 chữ số, lưu HASH `otp:{phoneBidx}` `{otpHash=sha256(otp),attempts=0,purpose}` với `EXPIRE OTP_TTL_SECONDS`, trả `{ok:true,otp}` để demo; gọi lại sinh mã mới và reset key. `VerifyOtp{phone,otp}` (không key / sai → `INVALID_ARGUMENT`+`INVALID_OTP`; sai đủ `OTP_MAX_ATTEMPTS` thì xóa key; đúng → xóa key, trả `onboardingToken` JWT HS256 `{purpose:"DRIVER_ONBOARDING",phone}` hạn `ONBOARDING_TOKEN_EXPIRES_IN_SECONDS`). Validate phone `^\+?[0-9]{8,15}$` sau chuẩn hóa.
- **Nghiệm thu:**
  - [x] RequestOtp trả `ok=true` và OTP 6 chữ số; `[redis] HGETALL otp:<bidx>` có `otpHash=sha256(otp)`, `attempts=0`; `TTL` ≤ 300, không lưu OTP rõ; gọi lại trả mã mới.
  - [x] VerifyOtp sai → `INVALID_OTP`, `attempts=1`.
  - [x] VerifyOtp đúng với OTP từ response → trả token; decode có `purpose=DRIVER_ONBOARDING`, `phone` đã chuẩn hóa; key bị xóa.
  - [x] VerifyOtp khi không có key → `INVALID_OTP`. Sai đủ 5 lần → key bị xóa.

#### T10 - Customer: profile
- **Đọc:** §7.2 (424-446), §8.2 mục CreateCustomerProfile/GetCustomer/UpdateCustomer (648), §3.7 escapeHtml (145).
- **Làm:** schema `customer_profiles` **và** `reviews` (tạo đủ cả hai bảng); copy `escapeHtml.js`; `CreateCustomerProfile` (idempotent theo `user_id`), `GetCustomer{userId}` (CUSTOMER chỉ xem chính mình; ADMIN xem tất cả; không có → 404), `UpdateCustomer` (chỉ `displayName` của chính mình, `escapeHtml`, 1..120). `CreateReview/ListReviews` để `UNIMPLEMENTED` (làm ở T28).
- **Nghiệm thu** (`[gRPC-call]` vào customer-service):
  - [x] Create 2 lần cùng `userId` → cùng `id`, `[psql]` chỉ 1 dòng.
  - [x] GetCustomer với `x-user-id` khác `userId` (role CUSTOMER) → `PERMISSION_DENIED`; role ADMIN → OK; không tồn tại → `NOT_FOUND`.
  - [x] Update `displayName="<b>x</b>"` → DB lưu `&lt;b&gt;x&lt;/b&gt;`.
  - [x] `[psql]` thấy đủ 2 bảng `customer_profiles`, `reviews`.

#### T11 - Auth: RegisterCustomer
- **Đọc:** §8.1 RegisterCustomer (640), §3.6 dòng chuyển tiếp metadata (140).
- **Làm:** `RegisterCustomer{email,password,displayName,phone?}`: validate (email ≤255, password 6..72, displayName 1..120, phone), trùng email/phone theo blind index → `ALREADY_EXISTS`; tạo user `CUSTOMER/PENDING` → gọi `Customer.CreateCustomerProfile{userId,displayName}` (chuyển tiếp `x-correlation-id`, đặt `x-service-token`) → `ACTIVE`; Customer lỗi → **xóa user vừa tạo**, trả `UNAVAILABLE`.
- **Nghiệm thu** (`[gRPC-call]`):
  - [x] Register hợp lệ → `status=ACTIVE`; `[psql]` customer-db có profile với `user_id` = userId trả về.
  - [x] Trùng email → `ALREADY_EXISTS`; trùng phone → `ALREADY_EXISTS`; password 5 ký tự → `INVALID_ARGUMENT`.
  - [x] `docker compose stop customer-service` → Register → `UNAVAILABLE` và `[psql]` auth-db **không còn** user đó; bật lại service.

#### T12 - Gateway: JWT + RBAC + zod + route auth/customers
- **Đọc:** §9.2 (751-753), §9.4 các hàng health/auth/customers (761-770), §3.6 (135-136), §3.4 (110-116).
- **Làm:** `middlewares/auth.js` (`jwt.verify(..., {algorithms:['HS256']})`, thiếu/sai/hết hạn → 401 `INVALID_TOKEN`, gắn `sub/role` vào metadata), `middlewares/rbac.js` (khai báo role theo route), onboardingToken guard (dành cho T19), zod schema; routes+controllers: `POST /auth/register` (201), `/auth/login`, `/auth/otp/request`, `/auth/otp/verify`, `GET/PATCH /customers/me`, `GET /customers/:id`. Endpoint public không gắn `x-user-id`.
- **Nghiệm thu** (`[curl]`):
  - [x] TC09: register → 201 `{data:{userId,status:"ACTIVE"}}`; login được. TC10: login 200 có `accessToken`; sai mật khẩu 401 `INVALID_CREDENTIALS`.
  - [x] TC11: `GET /customers/<mình>` 200; customer khác gọi → 403; chưa có token → 401 `INVALID_TOKEN`.
  - [x] TC25: login `identifier="' OR 1=1 --"` → 400 hoặc 401, không lộ lỗi DB.
  - [x] TC26: `PATCH /customers/me {"displayName":"<script>alert('hack')</script>"}` → trả về dạng escape.
  - [x] TC27: sửa payload token (đổi `role`), giữ chữ ký cũ → 401 `INVALID_TOKEN`; token `alg=none` → 401.
  - [x] Body sai kiểu/thiếu field → 400 `VALIDATION_ERROR`; `POST /auth/otp/request` lưu `data.otp`, rồi dùng mã đó để `verify` đúng → 200 có `onboardingToken`.

#### T13 - Gateway: rate limit
- **Đọc:** §9.3 (755-756), §4.3 nhóm rate limit (255-259), §4.4 dòng không rate limit (304).
- **Làm:** middleware rate limit Redis fixed window (`INCR` + `EXPIRE` lần đầu): mặc định theo IP (mọi route trừ health), `POST /auth/login` theo IP, `POST /bookings` theo `userId` (viết sẵn, gắn route ở T21). Vượt → 429 `RATE_LIMITED` + `Retry-After`. Redis lỗi → bỏ qua (fail-open). Key có prefix `ratelimit:`.
- **Nghiệm thu:**
  - [x] TC29: login sai 6 lần liên tiếp trong 1 phút → lần thứ 6 trả 429 `RATE_LIMITED` có header `Retry-After`; ngay sau đó `GET /health` vẫn 200.
  - [x] Vòng lặp >100 request/phút vào 1 route thường → 429.
  - [x] `docker compose stop redis` → login vẫn trả lỗi nghiệp vụ (không 500/429); bật lại redis.
  - [x] Xóa key giới hạn bằng `[redis]` (`--scan --pattern 'ratelimit:*'` rồi `DEL`) — **không** `FLUSHALL`.
  - Ghi §0: từ giờ nên tăng `RATE_LIMIT_LOGIN_PER_MIN` khi dev.

### C. Driver

#### T14 - Driver: schema + SubmitApplication + Get/ListApplications
- **Đọc:** §7.3 (448-497), §8.3 mục Onboarding Submit/List/Get (654-655), §16 mục 1 (1023).
- **Làm:** schema 4 bảng (`driver_profiles, vehicles, driver_applications, driver_state_history`); copy `crypto/blindIndex/escapeHtml` từ auth; auth-client gọi `Auth.CreateDriverAccount` (chuyển tiếp correlation id + token); `SubmitApplication` (validate; trùng `license_bidx`/`plate_bidx` → `ALREADY_EXISTS`; transaction tạo profile/vehicle/application; lỗi sau khi tạo account → `Auth.SetAccountStatus(REJECTED)` best-effort); `ListApplications` (ADMIN, lọc `status`, `submitted_at DESC`, **không** kèm license); `GetApplication` (ADMIN, license giải mã).
- **Nghiệm thu** (`[gRPC-call]` vào driver-service; ADMIN = metadata `x-user-role=ADMIN`):
  - [x] Submit → `status=PENDING_REVIEW`; `[psql]` driver-db: `license_number_enc`, `plate_number_enc` bắt đầu `v1:`; auth-db có user `DRIVER/PENDING`.
  - [x] Submit lại cùng license hoặc biển số → `ALREADY_EXISTS`.
  - [x] List (ADMIN) có `status` filter + phân trang; không thấy license. Get (ADMIN) thấy license đã giải mã. Gọi bằng role khác → `PERMISSION_DENIED`.
  - [x] `fullName="<i>a</i>"` lưu dạng escape.

#### T15 - Driver: Approve/Reject + publish event
- **Đọc:** §8.3 Approve/Reject (656-657), §6 envelope (369-374) + dòng `driver.*` (378-379), §3.3 (99).
- **Làm:** `ApproveApplication` (ADMIN, chỉ `PENDING_REVIEW` nếu không `ABORTED` `STATE_CONFLICT`): transaction cập nhật application+profile, gọi `Auth.SetAccountStatus(ACTIVE)`, commit, khởi tạo Redis `driver:{id}:state={workStatus:OFFLINE,availability:AVAILABLE}` nếu chưa có, **sau commit** publish `driver.approved`. `RejectApplication{reason 5..500}` (escapeHtml reason) + `SetAccountStatus(REJECTED)` + publish `driver.rejected`.
- **Nghiệm thu:**
  - [x] Approve → application và profile `APPROVED`; auth user `ACTIVE`; `[redis] HGETALL driver:<id>:state` đúng.
  - [x] Approve lần 2 → `ABORTED`/`STATE_CONFLICT`. Reject reason 3 ký tự → `INVALID_ARGUMENT`.
  - [x] `[rmq-tmp]` bind `driver.*`: thấy message `driver.approved` đúng envelope (`eventId, eventType, occurredAt, correlationId, producer=driver-service, aggregateId, payload{driverId,userId}`); reject có `reason`.
  - [x] Exchange `ride.events` loại topic, durable trong UI.

#### T16 - Driver: SetWorkStatus + UpdateLocation + GetDriver
- **Đọc:** §8.3 mục Trạng thái & vị trí (659-663, bỏ qua SearchNearby), §7.3 bảng Redis (498-503), §3.3 (100-101).
- **Làm:** `SetWorkStatus` (driver xác định bằng `x-user-id`→`driver_profiles.user_id`, role DRIVER; chỉ APPROVED mới ONLINE, nếu không `PERMISSION_DENIED`; OFFLINE khi `BUSY` → `ABORTED` `DRIVER_BUSY`; ghi `driver_state_history` khi thực sự đổi); `UpdateLocation` (validate tọa độ → `INVALID_COORDINATES`; `GEOADD drivers:geo`, `HSET driver:{id}:location`, đảm bảo có `state`; **không EXPIRE/TTL**); `GetDriver{driverId|userId}` (kèm vehicle plate giải mã + location).
- **Nghiệm thu** (dùng driver vừa approve ở T15, hoặc approve thêm 1 driver):
  - [x] ONLINE khi chưa APPROVED → `PERMISSION_DENIED`; sau approve → ONLINE OK, `[psql]` có 1 dòng history OFFLINE→ONLINE; đặt ONLINE lần 2 không thêm history.
  - [x] `[redis]` `HSET driver:<id>:state availability BUSY` rồi SetWorkStatus OFFLINE → `DRIVER_BUSY`; trả lại `AVAILABLE`.
  - [x] UpdateLocation lat=100 → `INVALID_COORDINATES`; hợp lệ → `ZSCORE drivers:geo <id>` có giá trị; `TTL driver:<id>:location` = `-1`.
  - [x] GetDriver theo `driverId` và theo `userId` trả cùng DriverInfo; không tồn tại → `NOT_FOUND`.

#### T17 - Seed phần A (auth, customer, driver, Redis)
- **Đọc:** §12 phần đầu + §12.1 + §12.2 (868-897), §4.2.1 (203-221), §16 mục 13 (1035).
- **Làm:** `scripts/package.json` (pg, ioredis, bcryptjs; ngoại lệ tối thiểu, ghi README), `scripts/lib/` (bản sao crypto/blindIndex/bcrypt + helper kết nối DB theo `X_DB_USER/PASSWORD/DEBUG_PORT` host `SEED_PG_HOST`, Redis `SEED_REDIS_URL`), `scripts/seed.js` chia hàm `seedAuth(), seedCustomer(), seedDriver(), seedRedis()` (**để T29 thêm `seedBooking()` v.v.**). UUID cố định `00000000-0000-0000-0000-000000000XXX`, `INSERT ... ON CONFLICT (id) DO UPDATE`, Redis ghi đè cùng key. Dữ liệu đúng §12.1/12.2: 9 user, 2 customer profile, 6 driver + vehicle (801-806) + application (901-906), Redis geo/state/location (Driver 6 không có GEO).
- **Nghiệm thu** (chạy compose kèm debug):
  - [x] `cd scripts && npm i && node seed.js` chạy 2 lần liên tiếp đều không lỗi.
  - [x] `[psql]` đếm: auth `users`=9, customer `customer_profiles`=2, driver `driver_profiles`=6, `vehicles`=6, `driver_applications`=6.
  - [x] `[redis]` `ZCARD drivers:geo`=5; `HGETALL driver:00000000-0000-0000-0000-000000000213:state` có `BUSY`; Driver 214 `OFFLINE`; Driver 216 không có GEO.
  - [x] `[gRPC-call]` Auth.Login `customer1@example.test`/`Customer@123` → token; `driver6` login → `ACCOUNT_NOT_ACTIVE`.

#### T18 - Driver: SearchNearby + TryAssign/ReleaseDriver (Lua)
- **Đọc:** §8.3 SearchNearbyDrivers (662), Giữ chỗ tài xế + Lua (665-676), §5 DriverNearby (356-358).
- **Làm:** `SearchNearbyDrivers` (`GEOSEARCH ... BYRADIUS r km ASC WITHDIST`, đọc `state` bằng pipeline, join DB chỉ giữ APPROVED + vehicle, lọc `workStatus`/`availability` nếu có, `distanceMeters=round(km*1000)`, tăng dần, **phân trang trong service** trả `total`; radius mặc định 1, >0 và ≤50); `TryAssignDriver` + `ReleaseDriver` dùng **đúng 2 script Lua** của §8.3 (Release idempotent, chỉ khi `currentBookingId` khớp).
- **Nghiệm thu** (`[gRPC-call]`, gốc 10.762622,106.660172):
  - [ ] radius 1 km: có Driver 1,2,3,4 (đúng thứ tự khoảng cách tăng dần, `distanceMeters` ≈ 330/450/550/620), **không** có 5 (2.45 km) và 6.
  - [ ] radius 3 + `workStatus=ONLINE`+`availability=AVAILABLE`, limit 3 → Driver 1,2,5; `total` đúng; page=2 limit=1 → phần tử thứ 2.
  - [ ] radius=0 hoặc 51 → `INVALID_ARGUMENT`.
  - [ ] TryAssign Driver 1 với booking X → `assigned=true`, `[redis]` `availability=BUSY, currentBookingId=X`; gọi lần 2 (booking Y) → `assigned=false`; Driver 3 (BUSY) và 4 (OFFLINE) → `false`.
  - [ ] Release với booking Y (sai) → `released=false`; với X → `true`, state về AVAILABLE; Release lần nữa → `false`.

#### T19 - Gateway: route driver/admin
- **Đọc:** §9.2 dòng onboardingToken (753), §9.4 các hàng drivers/admin (771-779), §5 cuối (358: safe fields).
- **Làm:** routes: `POST /drivers/applications` (guard onboardingToken `purpose=DRIVER_ONBOARDING`, `body.phone` chuẩn hóa phải khớp `payload.phone` → 400; token thường không dùng được và ngược lại), `GET /admin/driver-applications[/:id]`, `POST .../approve`, `POST .../reject`, `PUT /drivers/me/status`, `PUT /drivers/me/location`, `GET /drivers/nearby` (query zod), `GET /drivers/:id` (**safe fields**: driverId, fullName, workStatus, availability, vehicle{plateNumber,vehicleType,brand,model,color}; không `userId`/`licenseNumber`).
- **Nghiệm thu** (`[curl]` với seed):
  - [ ] TC21: request OTP (lưu `data.otp`) → verify bằng mã đó → `POST /drivers/applications` bằng onboardingToken → 201 `PENDING_REVIEW`; dùng token đăng nhập thường ở endpoint này → 401; phone body khác phone token → 400.
  - [ ] TC22: admin list (`?status=PENDING_REVIEW`) → có Driver 6 + driver mới; approve/reject đổi trạng thái; customer gọi `/admin/...` → 403. Sau approve, login của driver mới OK.
  - [ ] TC23: driver1 `PUT /drivers/me/status {"status":"OFFLINE"}` OK rồi ONLINE lại; customer gọi → 403 `FORBIDDEN` (TC28) body không có data.
  - [ ] TC12: `GET /drivers/<211>` → 200 chỉ safe fields. TC13: `GET /drivers/nearby?lat=10.762622&lng=106.660172&radiusKm=1` → 4 driver tăng dần; `limit=2&page=2` đúng; `limit=51` → 400.
  - [ ] `PUT /drivers/me/location` driver1 lat=100 → 400 `INVALID_COORDINATES`.

### D. Payment, Booking, Notify

#### T20 - Payment service + route payment
- **Đọc:** §7.6 (592-611), §8.5 (709-717), §6 dòng `payment.*` (380-381), §9.4 hàng payments (794-795), §13 TC30 (930).
- **Làm:** schema `payments`; `CreatePayment` (nội bộ; `amount>0`; trùng `booking_id` → trả bản cũ; `payment_url=mock://pay/{id}`), `GetPayment` (CUSTOMER chỉ của mình, ADMIN tất cả, nếu không `PERMISSION_DENIED`; request không có `x-user-id` = nội bộ), `HandleCallback` đúng 5 bước §8.5 (HMAC `timingSafeEqual`, `PAYMENT_SKIP_SIGNATURE`, replay, `INVALID_AMOUNT`, conditional UPDATE, publish `payment.completed|failed` **sau commit**). Gateway: `POST /payments/mock/callback` (public), `GET /payments/:id`.
- **Nghiệm thu:**
  - [ ] `[gRPC-call]` CreatePayment (booking giả) → `PENDING`, `paymentUrl=mock://pay/<id>`; gọi lại cùng bookingId → cùng `paymentId`; amount 0 → `INVALID_ARGUMENT`.
  - [ ] Chữ ký sai: `[curl]` callback → 400 `INVALID_SIGNATURE`, `[psql]` payment vẫn `PENDING`, `[rmq-tmp]` không có event. Chữ ký đúng (`printf '%s' "$PID|TXN1|$AMT|SUCCESS" | openssl dgst -sha256 -hmac "$PAYMENT_CALLBACK_SECRET" -hex`) → 200 `COMPLETED`, có `paid_at`, event `payment.completed` đúng payload.
  - [ ] Callback lặp cùng `providerTxnId` → `replayed:true`, **không** thêm event; txn khác → 409; `amount` sai (payment khác) → 400 `INVALID_AMOUNT`; `providerTxnId` đã dùng cho payment khác → 409.
  - [ ] Payment khác với `result=FAIL` → `FAILED`, `failure_code=MOCK_PAYMENT_FAILED`, event `payment.failed`. `paymentId` không tồn tại → 404.

#### T21 - Booking: schema + CreateBooking (idempotency) + Get/List + route
- **Đọc:** §7.4 (505-560), §8.4 CreateBooking + GetBooking/ListBookings (679-686, 707), §9.4 hàng bookings (780-782), §3.7 escapeHtml (145), §11 BR06-07 (849-850).
- **Làm:** schema 3 bảng (`bookings, booking_offers, idempotency_keys`); copy `escapeHtml`; payment-client (chuyển tiếp correlation id+token, **không** chuyển `x-user-id`); `CreateBooking` đúng 4 bước §8.4 (validate tọa độ, `requestHash`, replay/422, Haversine R=6371 làm tròn 2 số, `fare=round(km*PRICE_PER_KM)`, `fare<=0` → `INVALID_COORDINATES`, insert `PAYMENT_PENDING` → CreatePayment, lỗi → `PAYMENT_FAILED` + `UNAVAILABLE`/503 `PAYMENT_SERVICE_UNAVAILABLE` và không lưu idempotency, race UNIQUE → đọc lại); `GetBooking`, `ListBookings` (customer chỉ của mình; admin lọc `customerId`; `created_at DESC`; `total/totalPages`). Gateway: `POST /bookings` (bắt buộc header `Idempotency-Key` 1..120, thiếu → 400; replay → header `Idempotent-Replayed: true`; gắn rate limit theo user), `GET /bookings/:id`, `GET /bookings`.
- **Nghiệm thu** (`[curl]`, customer1 token):
  - [ ] `POST /bookings` thiếu `Idempotency-Key` → 400. Có key → 201 `{bookingId,status:"PAYMENT_PENDING",distanceKm,fare,paymentId,paymentUrl}`; `fare = round(distanceKm*5000)`, kiểu **number**.
  - [ ] Gửi lại cùng key+body → cùng `bookingId/paymentId` + `Idempotent-Replayed: true`, `[psql]` booking-db và payment-db không thêm dòng. Cùng key, body khác → 422 `IDEMPOTENCY_KEY_REUSED`.
  - [ ] pickup = destination → 400 `INVALID_COORDINATES`; lat=95 → 400 `INVALID_COORDINATES`.
  - [ ] `docker compose stop payment-service` → tạo booking → 503 `PAYMENT_SERVICE_UNAVAILABLE`, booking đó `PAYMENT_FAILED`; bật lại.
  - [ ] `GET /bookings/:id` chủ → 200; customer2 → 403; admin → 200. `GET /bookings?page=1&limit=2` có `pagination`. Vòng lặp tạo >10 booking/phút → 429 (rate limit theo user).

#### T22 - Booking: consumer `payment.*` + matching + offers
- **Đọc:** §8.4 consumer payment (687-692), §6 bảng queue (392-396) + dòng `booking.offer.created` (382), §10.1 bước 2 (810), §11 BR01, BR08-11 (845-854).
- **Làm:** `booking.q` bind `payment.completed, payment.failed, trip.completed, trip.canceled` (handler trip.* làm ở T27, tạm ack/log); `payment.completed`: chỉ khi `UPDATE ... SET status='SEARCHING_DRIVER' WHERE id AND status='PAYMENT_PENDING'` ảnh hưởng 1 dòng mới matching (booking đã `CANCELED`/khác → bỏ qua, ack); matching bằng `Driver.SearchNearbyDrivers{radiusKm=MATCH_RADIUS_KM, ONLINE, AVAILABLE, page=1, limit=MATCH_MAX_OFFERS}`; không driver → `NO_DRIVER_FOUND` (có điều kiện `status='SEARCHING_DRIVER'`); có → insert offers `PENDING` (`expires_at=now+OFFER_TTL_SECONDS`), sau commit publish **1 `booking.offer.created` cho mỗi offer** (có `driverUserId`). `payment.failed`: `PAYMENT_PENDING → PAYMENT_FAILED`, không offer.
- **Nghiệm thu** (seed; callback bằng HMAC):
  - [ ] Booking mới từ điểm gốc seed + callback SUCCESS → booking `SEARCHING_DRIVER`; `[psql]` có **3 offer PENDING** cho driver 211, 212, 215 (không có 213/214/216); `[rmq-tmp]` bind `booking.offer.created` thấy 3 message đúng `driverUserId`.
  - [ ] Callback SUCCESS lặp → không thêm offer. Booking khác với callback FAIL → `PAYMENT_FAILED`, 0 offer.
  - [ ] Đặt tạm tất cả driver OFFLINE bằng `[redis]` (hoặc đổi điểm đón thật xa) → callback SUCCESS → booking `NO_DRIVER_FOUND`; khôi phục state seed bằng `node scripts/seed.js`.
  - [ ] Cập nhật tay booking sang `CANCELED` trước khi callback SUCCESS đến → callback vẫn 200, payment `COMPLETED`, booking vẫn `CANCELED`, 0 offer.

#### T23 - Notify service + route notifications
- **Đọc:** §7.7 (613-632), §8.7 (728-743), §6 bảng queue (392-396), §9.4 hàng notifications (798-800), §3.3 notification type (107-108).
- **Làm:** schema `notifications`; `notify.q` bind `driver.*, payment.*, booking.*, trip.*`; consumer tạo notification theo **bảng recipient §8.7** (INSERT ... `ON CONFLICT (recipient_id,event_id,type) DO NOTHING`, `event_id`=envelope `eventId`); `ListNotifications` (của người gọi, `unread=true`, phân trang, mới nhất trước), `MarkRead` (404/403), `MarkAllRead`. Gateway: `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`.
- **Nghiệm thu:**
  - [ ] TC07: UI RabbitMQ thấy exchange `ride.events` (topic), queue `booking.q, trip.q, notify.q` (trip.q ở T25 mới có; ghi log nếu chưa) và binding đúng.
  - [ ] Tạo booking + callback SUCCESS (như T22): customer1 `GET /notifications` có `PAYMENT_COMPLETED`; driver1, driver2, driver5 mỗi người có **đúng 1** `BOOKING_OFFER` (driver3/4 không có). Replay cùng event không tạo trùng.
  - [ ] `GET /notifications?unread=true` lọc đúng; `POST /notifications/:id/read` → READ; người khác đọc → 403; id lạ → 404; `read-all` xong `unread=true` rỗng.
  - [ ] Approve một driver (T19) → driver đó nhận `DRIVER_APPROVED`.
  - [ ] `docker compose stop notify-service`, tạo event, `start` lại → notification xuất hiện (queue durable).

#### T24 - Booking: ListMyOffers/Accept/Reject/Cancel + route
- **Đọc:** §8.4 ListMyOffers/AcceptOffer/RejectOffer/CancelBooking (694-705), §6 dòng `booking.assigned`/`booking.canceled` (383-384), §9.4 hàng booking-offers + cancel (783-786), §10.3 (825-840), §3.5 dòng 410 (124).
- **Làm:** `ListMyOffers` (resolve driverId bằng `Driver.GetDriver{userId}`; offer `PENDING` của booking đang `SEARCHING_DRIVER`, mới nhất trước); `AcceptOffer` đúng 5 bước §8.4 (404/403/409/410 `OFFER_EXPIRED` = `FAILED_PRECONDITION`, `TryAssignDriver`, transaction conditional UPDATE + `ACCEPTED` + `SUPERSEDED` còn lại, thua → rollback + `ReleaseDriver` + 409; sau commit lấy `driverUserId` của driver bị SUPERSEDED, gọi `Payment.GetPayment` (không chuyển `x-user-id`) lấy `paidAt`, publish `booking.assigned`); `RejectOffer` (reason escape, không tìm thêm tài xế); `CancelBooking{reason 5..200, confirm}` (`CONFIRM_REQUIRED`, chỉ `PAYMENT_PENDING|SEARCHING_DRIVER`, ADMIN → 403, offers PENDING→SUPERSEDED, publish `booking.canceled`, **không refund**). Gateway routes tương ứng.
- **Nghiệm thu:**
  - [ ] TC16: driver1 `GET /notifications?unread=true` → `GET /booking-offers/me` → `POST /booking-offers/:id/accept` → 200 `DRIVER_ASSIGNED`; booking có `driver` (safe fields); `[redis]` driver1 `BUSY`; `[rmq-tmp]` thấy `booking.assigned` có `supersededDriverUserIds` (2 phần tử), `paidAt`, `vehicleId`; driver2/5 nhận `OFFER_CLOSED`, customer nhận `BOOKING_ASSIGNED`.
  - [ ] Driver2 accept offer của mình sau đó → 409; driver2 accept offer của driver khác → 403; offer quá hạn (sửa `expires_at` trong `[psql]`) → 410 `OFFER_EXPIRED`.
  - [ ] Reject: driver5 reject → `REJECTED`, booking vẫn `SEARCHING_DRIVER`; reject lần 2 → 409.
  - [ ] Cancel (TC18 phần booking): booking `SEARCHING_DRIVER` → thiếu `confirm` → 400 `CONFIRM_REQUIRED`; đủ → `CANCELED`; offer thành `SUPERSEDED`; `booking.canceled` có `driverUserIds`; payment vẫn `COMPLETED`; cancel booking `DRIVER_ASSIGNED` → 409; admin cancel → 403.
  - [ ] Accept song song 2 driver (2 lệnh curl chạy `&`) → đúng 1 thắng, 1 nhận 409; booking chỉ 1 `driver_id`.
  - [ ] Driver gọi `GET /bookings` → 403.
  - Lưu ý: chuyến `DRIVER_ASSIGNED` này sẽ dùng tiếp ở T25-T26 (chưa có Trip thì mới thấy event `booking.assigned` chờ trong `trip.q` sau T25).

### E. Trip, Review

#### T25 - Trip: schema + consumer `booking.assigned` + Get/GetByBooking + route
- **Đọc:** §7.5 (562-590), §8.6 consumer + xác định driver + GetTrip (720-721, 726), §6 `trip.q` (395), §9.4 hàng trips GET (787-788), §11 BR12 (855).
- **Làm:** schema `trips`; `trip.q` bind `booking.assigned` → `INSERT ... ON CONFLICT (booking_id) DO NOTHING` (status `DRIVER_ARRIVING`, `payment_status=PAID`, `paid_at`, `fare`, `vehicle_id`, `payment_id`); `GetTrip`, `GetTripByBooking` (chủ trip / driver được gán / admin; còn lại 403; không có → 404; trả đủ field §8.6). Driver service được xác định bằng `Driver.GetDriver{userId}`. Gateway: `GET /trips/:id`, `GET /trips/by-booking/:bookingId`.
- **Nghiệm thu:**
  - [ ] `GET /trips/by-booking/:bookingId` **trước** accept → 404; sau accept (flow T24) → 200 `DRIVER_ARRIVING`, `paymentStatus="PAID"`, `fare` là number.
  - [ ] Phát lại event (`[rmq-tmp]`/accept mới) không tạo Trip thứ hai (`[psql]` đếm theo booking_id).
  - [ ] Customer khác / driver khác xem trip → 403; admin → 200; driver được gán → 200.
  - [ ] UI RabbitMQ thấy đủ 3 queue `booking.q, trip.q, notify.q` (hoàn tất TC07).

#### T26 - Trip: Arrive/Start/UpdateTripLocation/Complete + event
- **Đọc:** §8.6 Arrive/Start/UpdateTripLocation/Complete (722-724), §6 dòng `trip.*` (385-388), §16 mục 3, 7 (1025, 1029), §9.4 hàng trips POST/PUT (789-792).
- **Làm:** `Arrive` (`DRIVER_ARRIVING→DRIVER_ARRIVED`), `Start` (`→IN_PROGRESS`), `UpdateTripLocation` (chỉ `IN_PROGRESS`, ghi đè `last_lat/lng/location_updated_at`, 409 nếu sai trạng thái, validate tọa độ), `Complete` (chỉ `IN_PROGRESS`, copy `last→end`, **không tính lại cước**, sau commit `Driver.ReleaseDriver` rồi publish `trip.completed`). Chỉ driver được gán (403 nếu khác; sai trạng thái → `ABORTED` `STATE_CONFLICT`). Publish `trip.arrived/started/completed` kèm `driverUserId` (lấy bằng `Driver.GetDriver{driverId}`). Gateway routes.
- **Nghiệm thu** (tiếp chuyến từ T24):
  - [ ] Start trước arrive → 409; location khi chưa `IN_PROGRESS` → 409; driver khác arrive → 403.
  - [ ] TC17: arrive → start → `PUT location` → complete đúng trình tự; `GET /trips/:id` `status=COMPLETED`, `endLat/endLng` = vị trí cuối, `paymentStatus=PAID`.
  - [ ] `[redis]` driver trở lại `AVAILABLE`, `currentBookingId` bị xóa.
  - [ ] `[rmq-tmp]` thấy `trip.arrived/started/completed` có `driverUserId`; customer có notification `TRIP_ARRIVED/STARTED/COMPLETED`.
  - [ ] Complete khi chưa `IN_PROGRESS` → 409.

#### T27 - Trip: Cancel + Booking consume `trip.completed/canceled`
- **Đọc:** §8.6 Cancel (725), §8.4 dòng consumer trip (692), §6 dòng trip.canceled (388), §9.4 hàng cancel (793), §11 BR17 (860).
- **Làm:** `Cancel{reason 5..200, confirm}` (participant: customer chủ trip hoặc driver được gán; ADMIN → 403; `confirm!==true` → `CONFIRM_REQUIRED`; chỉ `DRIVER_ARRIVING|DRIVER_ARRIVED`, nếu khác → `ABORTED` `TRIP_CANNOT_BE_CANCELED`; `canceled_by` suy từ role; escapeHtml reason; `ReleaseDriver`; publish `trip.canceled`). Booking consumer: `trip.completed` → `DRIVER_ASSIGNED→COMPLETED`; `trip.canceled` → `DRIVER_ASSIGNED→CANCELED` (`canceled_at`, `cancel_reason`, không publish thêm). Notify `trip.canceled` gửi cho **cả customer và driverUserId**.
- **Nghiệm thu:**
  - [ ] Sau complete (T26) `GET /bookings/:id` → `COMPLETED`.
  - [ ] TC18 phần trip: tạo flow mới tới `DRIVER_ASSIGNED`, customer `POST /trips/:id/cancel` thiếu confirm → 400; đủ → trip `CANCELED`, `canceled_by=CUSTOMER`, booking `CANCELED`, driver `AVAILABLE`, **cả hai bên** có `TRIP_CANCELED`, payment vẫn `COMPLETED`.
  - [ ] Flow khác: driver cancel → `canceled_by=DRIVER`. Cancel khi `IN_PROGRESS` → 409 `TRIP_CANNOT_BE_CANCELED`; admin cancel → 403.
  - [ ] Event `trip.completed/canceled` lặp lại không làm đổi trạng thái lần hai.

#### T28 - Customer: Reviews + route
- **Đọc:** §8.2 CreateReview/ListReviews (649-650), §9.4 hàng reviews (796-797), §3.6 dòng Customer→Trip.GetTrip (140), §11 BR20 (862).
- **Làm:** `CreateReview{tripId,rating 1..5,comment ≤500}` (role CUSTOMER; gọi `Trip.GetTrip` **chuyển tiếp** `x-user-id/x-user-role`; 404; `trip.customerId != x-user-id` → 403; trip chưa `COMPLETED` → 409 `STATE_CONFLICT`; trùng → 409 `ALREADY_EXISTS`; lưu `customer_id=x-user-id`, `driver_id=trip.driverId`; escapeHtml comment); `ListReviews{tripId}` (thiếu → 400, phân trang). Gateway: `POST /reviews`, `GET /reviews?tripId=`.
- **Nghiệm thu:**
  - [ ] TC20: review trip `COMPLETED` rating 5 → 201; lặp lại → 409; rating 6 → 400; trip chưa completed → 409; customer khác → 403; driver gọi `POST /reviews` → 403.
  - [ ] `GET /reviews?tripId=<id>` có review, có `pagination`; thiếu `tripId` → 400.
  - [ ] `comment="<script>alert('hack')</script>"` lưu/trả dạng escape (TC26).

### F. Seed B, test, tài liệu, nghiệm thu cuối

#### T29 - Seed phần B (booking, payment, trip, review)
- **Đọc:** §12.3 (899-917), §12 phần đầu (868-870).
- **Làm:** thêm vào `scripts/seed.js` các hàm `seedBooking(), seedPayment(), seedTrip(), seedReview()` đúng bảng §12.3: 7 booking (301-307), payments 401-407 (`provider_txn_id` dạng `SEED-TXN-4xx`, 406 `FAILED`), trips 501/502/503/507, offers ACCEPTED 701-704, review 601. `customer_id` = Auth user_id (101/102). `created_at` đúng mốc. Không seed booking đang hoạt động. Idempotent `ON CONFLICT (id) DO UPDATE`.
- **Nghiệm thu** (compose debug + `docker compose down -v` rồi up lại để dữ liệu sạch):
  - [ ] `node scripts/seed.js` chạy 2 lần không lỗi; `[psql]` đếm bookings=7, payments=7, trips=4, booking_offers=4, reviews=1.
  - [ ] TC14: customer1 `GET /bookings?page=1&limit=3` → `total=6`, `totalPages=2`, 3 dòng mới nhất; `?status=COMPLETED` → 2 dòng; `GET /bookings/00000000-0000-0000-0000-000000000307` → 403; customer2 xem 307 → 200.
  - [ ] `GET /trips/<503>` `CANCELED`, `canceledBy=CUSTOMER`; `GET /reviews?tripId=<501>` có review 601.
  - Ghi log: **không tạo booking mới cho customer1 trước khi chạy xong TC14** (như SPEC §12.3).

#### T30 - Postman phần 1 (Health → Booking + Payment)
- **Đọc:** §14.1 (938-950), §14.3 (955-987), §9.4 (761-802) chỉ để lấy URL/body.
- **Làm:** `postman/CABSYSTEM_API.postman_environment.json` (biến §14.1) + khởi tạo `CABSYSTEM_API.postman_collection.json` với các folder: Health → Auth/Customer → Driver onboarding/Admin → Driver status/location/nearby → Booking+Payment. Mỗi request có `pm.test` kiểm status + field chính và lưu id vào biến (`bookingId, paymentId, fare, idemKey...`). Callback dùng Pre-request Script HMAC như §14.1.
- **Nghiệm thu:**
  - [ ] File JSON hợp lệ (`node -e "JSON.parse(require('fs').readFileSync('postman/CABSYSTEM_API.postman_collection.json'))"`).
  - [ ] Chạy các folder bằng `newman` (`npx newman run ... -e ... --delay-request 800`): tất cả test pass (nếu không có newman, ghi log và kiểm bằng curl tương đương).

#### T31 - Postman phần 2 (Offer → Security)
- **Đọc:** §14.1 thứ tự folder (941), §14.3 hàng TC15-TC30 (970-987).
- **Làm:** bổ sung folder: Offer/Accept → Trip → Review → Cancel → Payment FAIL → Seed paging (TC14) → Security (TC24-30: SQLi, XSS, JWT tamper, unauthorized, rate limit, replay). Thêm delay giữa request theo §14.1 (≥700 ms; login cách ≥12 s) hoặc ghi chú tăng limit.
- **Nghiệm thu:**
  - [ ] JSON hợp lệ; thứ tự folder đúng §14.1.
  - [ ] `newman` chạy toàn collection trên DB sạch + seed: không test nào fail (TC14 chạy trước khi tạo booking mới cho customer1 — kiểm tra thứ tự trong collection).
  - [ ] Folder Security thể hiện đủ 7 tiêu chí TC24-TC30.

#### T32 - `huong-dan-test/TC01..TC10.md`
- **Đọc:** §14.2 (952-953), §14.3 hàng TC01-TC10 (958-967), §2, §4.1, §4.4, §4.5.
- **Làm:** 10 file, mỗi file có 5 mục: **Mục tiêu, Điều kiện trước, Các bước** (request cụ thể hoặc lệnh `docker compose ...`/SQL), **Kết quả mong đợi, Cách chụp minh chứng**. Dùng dữ liệu seed §12. Mọi lệnh phải **chạy thử thật** trước khi ghi.
- **Nghiệm thu:**
  - [ ] Đủ 10 file `TC01.md ... TC10.md`, mỗi file đủ 5 mục (`grep -c '^## ' huong-dan-test/TC*.md`).
  - [ ] Chạy thử các lệnh của TC05, TC06, TC08, TC09, TC10 đúng như file mô tả, kết quả khớp.

#### T33 - `huong-dan-test/TC11..TC20.md`
- **Đọc:** §14.2, §14.3 hàng TC11-TC20 (969-978), §12.3 (kỳ vọng TC14).
- **Làm / Nghiệm thu:** như T32 cho TC11-TC20 (mọi bước có token/biến cụ thể, TC14 ghi rõ phải chạy trước khi tạo booking mới cho customer1 và cách reset: `docker compose down -v` + up + seed).
  - [ ] Đủ 10 file, đủ 5 mục.
  - [ ] Chạy thử TC13, TC14, TC15, TC16, TC19 đúng như mô tả.

#### T34 - `huong-dan-test/TC21..TC30.md`
- **Đọc:** §14.2, §14.3 hàng TC21-TC30 (978-987), §13 (920-932).
- **Làm / Nghiệm thu:** như T32 cho TC21-TC30. TC24 dùng `docker compose exec auth-db psql ...` (hoặc port debug); TC29 nhắc trả `.env` về giá trị mặc định rate limit.
  - [ ] Đủ 10 file, đủ 5 mục.
  - [ ] Chạy thử TC24, TC25, TC27, TC29, TC30 đúng như mô tả.

#### T35 - README
- **Đọc:** §0 (8-19), §3.8, §4, §13 hàng TC24 (924), §14.1 dòng lưu ý rate limit (950), §16.
- **Làm:** `README.md`: giới thiệu + sơ đồ kiến trúc ngắn, yêu cầu (Docker), cách chạy một lệnh, cách chạy debug + seed (`cd scripts && npm i && node seed.js`), bảng tài khoản seed, cách chạy Postman/newman và lưu ý rate limit, cách xoay khóa mã hóa (V2), cách reset (`down -v`), mục **"Giả định"** (gom từ log), và `mount proto` tại `/app/contracts/proto`.
- **Nghiệm thu:**
  - [ ] Làm theo README từ máy sạch (`docker compose down -v` trước) chạy được tới khi gọi `/health/services` OK.
  - [ ] README có đủ các mục trên; mục "Giả định" khớp log.

#### T36 - Hồi quy toàn bộ + Definition of Done §15.2
- **Đọc:** §15.2 (1005-1015), §14.3 (955-987), §13 (920-932).
- **Làm:** `docker compose down -v` → `docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d --build` → seed → chạy toàn bộ collection Postman (newman) → rà từng ô DoD. **Trả lại** mọi giá trị `.env` đã đổi tạm (xem §0 dòng "Lệnh dev đã đổi tạm"). Sửa lỗi phát hiện (ghi log từng lỗi).
- **Nghiệm thu (tick đúng như SPEC §15.2):**
  - [ ] `docker compose up --build` sạch; `docker compose ps` đủ **17 container** healthy; 7 database tự tạo.
  - [ ] Debug mode map 7 DB (5433-5439) + redis 6379; kết nối được bằng `psql`.
  - [ ] Chế độ thường chỉ publish `3000` và `15672`; `50051-50057` không truy cập được từ host.
  - [ ] `/health`, `/ready`, `/health/services` đúng §4.4.
  - [ ] Seed chạy lặp không lỗi; TC14 đúng số liệu.
  - [ ] Luồng đặt xe đầy đủ §10.1; FAIL path và cancel path đúng.
  - [ ] `grep -rniE 'socket\.io|refresh|refund|outbox|dlq|processed_events' services gateway --include=*.js` không có code nghiệp vụ liên quan (chỉ comment/text nếu có).
  - [ ] `git ls-files | grep -E '(^|/)\.env$'` rỗng; `.env.example` đủ biến.
  - [ ] 30 file `huong-dan-test/TCxx.md` + Postman khớp §14.3.
  - [ ] Mỗi service có đủ `grpc/services/repositories/events/config` (service nào không dùng events thì không bắt buộc), không hard-code.
  - [ ] Điền kết luận cuối vào §5 Nhật ký: "HOÀN THÀNH".

---

## 4. Mẫu mục nhật ký (copy khi ghi log)

```
### [YYYY-MM-DD HH:MM] Txx - <tên task> - <HOÀN THÀNH | DỞ DANG | BLOCKED>
- Đã làm: <file/cụm chính, 1-3 dòng>
- Nghiệm thu: <đạt x/y; ô nào không đạt và vì sao>
- Checkpoint: <(tuỳ chọn) mốc giữa chừng nếu task dài>
- Giả định / quyết định: <điều chọn khi SPEC mơ hồ; sẽ đưa vào README>
- Lệnh dev đổi tạm: <vd RATE_LIMIT_LOGIN_PER_MIN=1000 | không>
- Còn lại / việc cho phiên sau: <nếu DỞ DANG: còn gì, file nào đang dở>
- Commit: <hash hoặc "chưa commit">
```

---

## 5. NHẬT KÝ (chỉ **thêm vào cuối**, không sửa mục cũ)

<!-- Codex ghi từ đây xuống. -->

### [2026-10-01 00:00] T00 - Khung repo, `.gitignore`, `.env`, `.env.example` - HOÀN THÀNH
- Đã làm: tạo khung thư mục §2 với `.gitkeep`; thêm `.gitignore`, `.env` local và `.env.example` cùng danh sách biến.
- Nghiệm thu: đạt 4/4.
- Giả định / quyết định: `openssl` không thể chạy trong môi trường Windows này (signal pipe); dùng `crypto.randomBytes` của Node.js để sinh các secret local ngẫu nhiên tương đương.
- Lệnh dev đổi tạm: không.
- Commit: `T17: Seed phần A`.

### [2026-10-01 17:50] T01 - Proto contracts - HOÀN THÀNH
- Đã làm: tạo 9 file `common, health, auth, customer, driver, booking, trip, payment, notify.proto`; khai báo toàn bộ RPC §5, message, enum chuẩn và trường `snake_case`.
- Nghiệm thu: đạt 2/2. Docker Desktop daemon và executable không có trên máy Windows; dùng lệnh Node.js tương đương với `@grpc/proto-loader` cài tạm ngoài workspace, cùng `loadSync` và loader options, nhận `OK`; số RPC: Auth 7, Customer 5, Driver 11, Booking 9, Trip 7, Payment 3, Notify 3.
- Lệnh dev đổi tạm: không.
- Commit: `T01: Proto contracts` (đã commit).

### [2026-10-01 17:59] T02 - Skeleton service dùng chung - HOÀN THÀNH
- Đã làm: dựng mẫu `auth-service` gồm Dockerfile, package dependencies, config, PostgreSQL/Redis, gRPC Health, healthcheck, server khởi động/tắt êm, migration placeholder và RabbitMQ helper dùng lazy-load cho T03.
- Nghiệm thu: đạt 3/3: `node --check` mọi file JS không lỗi; `docker build -t auth-test services/auth-service` thành công; quét `localhost|5432|50051` trong `src/` không có kết quả. Git Bash bị `Bash/Service/CreateInstance/E_ACCESSDENIED`, nên dùng các lệnh PowerShell tương đương; Docker Buildx cần quyền truy cập lock và build thành công.
- Helper cho T03: `src/config/index.js`; `src/utils/{logger,errors,grpcAuth,proto}.js`; `src/db/{pg,redis}.js`; `src/events/rabbit.js`; `src/grpc/health.js`; `src/{server,healthcheck}.js`; `migrations/schema.sql`.
- Lệnh dev đổi tạm: không.
- Commit: `T02: Skeleton service dùng chung` (đã commit).

### [2026-10-01 18:10] T03 - Nhân bản skeleton cho 6 service còn lại - HOÀN THÀNH
- Đã làm: tạo skeleton độc lập cho `customer, driver, booking, trip, payment, notify-service`; cấu hình, dependency, health check và dependency runtime đúng từng service. RPC nghiệp vụ hiện trả `UNIMPLEMENTED`.
- Nghiệm thu: đạt 3/3; `node --check` toàn bộ JS mới sạch, build đủ 6 image thành công, và chỉ `auth-service` cùng `customer-service` không có `amqplib`.
- Lệnh dev đổi tạm: không.
- Commit: `T03: Nhân bản skeleton 6 service` (đã commit).

### [2026-10-01 18:30] T04 - `docker-compose.yml` + `docker-compose.debug.yml` + gateway stub - HOÀN THÀNH
- Đã làm: thêm compose đủ 17 container, 7 DB volume riêng, healthcheck/dependency đúng service, mount proto read-only; thêm debug override chỉ map DB/Redis; tạo gateway stub `GET /health`.
- Nghiệm thu: đạt 6/6; normal mode chỉ mở 3000/15672, debug mode mở 5433-5439/6379 và mọi cổng gRPC vẫn đóng; `auth_db` truy cập được bằng psql.
- Lệnh dev đổi tạm: không.
- Commit: `T04: docker compose + debug + gateway stub` (đã commit).

### [2026-10-01 18:45] T05 - Gateway core - HOÀN THÀNH
- Đã làm: thêm Gateway config, correlation/helmet/JSON parser, response+zod helpers, router rỗng, gRPC client factory với metadata/deadline và mapper lỗi ưu tiên trailer `error-code`.
- Nghiệm thu: đạt 3/3; 404/JSON hỏng đúng format + correlation header; file test tạm trong Gateway kiểm toàn bộ các cặp mapper §3.5 trả `OK`.
- Lệnh dev đổi tạm: không.
- Commit: `T05: Gateway core` (đã commit).

### [2026-10-01 19:10] T06 - Gateway health `/health` `/ready` `/health/services` - HOÀN THÀNH
- Đã làm: thêm health/readiness cả hai prefix; kiểm 7 gRPC Health, 7 TCP DB, Redis PING, RabbitMQ connect/close; trả đủ 16 component với `latencyMs`.
- Nghiệm thu: đạt 4/4; đã dừng/bật notify-service, notify-db, redis, rabbitmq theo từng lượt và luôn xác nhận stack 17 container healthy trước lượt tiếp theo.
- Sửa lỗi phát hiện trong nghiệm thu: `notify-service` từ skeleton T02 exit khi Postgres bị ngắt do Pool thiếu listener `error`; thêm listener chỉ log để service báo unhealthy và tự hồi phục sau DB khởi động lại.
- Lệnh dev đổi tạm: không.
- Commit: `T06: Gateway health` (đã commit).

### [2026-10-01 19:20] Sửa lỗi xuyên task: pool/rabbit/redis error handler - HOÀN THÀNH
- Đã làm: bổ sung listener `error` cho PostgreSQL pool của 6 service từ T03; bổ sung listener `error`/`close` cho RabbitMQ connection/channel của booking, driver, trip, payment, notify; bổ sung listener `error` cho Redis của auth và driver.
- Nghiệm thu: build lại đủ 7 service và `node --check` sạch; dừng riêng `driver-db` rồi `payment-db` 15 giây, service tương ứng vẫn `Up` không restart; sau khi khởi động lại DB, đủ 17 container healthy.
- Lệnh dev đổi tạm: không.
- Commit: `fix: error handler kết nối cho mọi service`.

### [2026-10-01 19:40] T07 - Utils bảo mật - HOÀN THÀNH
- Đã làm: thêm AES-256-GCM với IV 12 byte và key rotation v1/v2, HMAC-SHA256 blind index, escapeHtml; đưa khóa cần thiết vào auth-service config và Compose environment.
- Nghiệm thu: `node --check` và Compose config sạch; script tạm ngoài repo chạy trong auth-service đạt toàn bộ kiểm tra v1, ciphertext bị sửa, blind index/escapeHtml, và v2 vẫn giải mã ciphertext v1.
- Lệnh dev đổi tạm: không; khóa V2 ngẫu nhiên chỉ truyền cho một lệnh `docker compose exec`.
- Commit: `T07: Utils bảo mật` (đã commit).

### [2026-10-01 19:55] T08 - Auth users + Login - HOÀN THÀNH
- Đã làm: schema `users` cùng index; repository SQL có tham số; Auth gRPC cho Login/GetUser/SetAccountStatus/CreateDriverAccount; AES-GCM + blind index cho email/phone, bcrypt theo `BCRYPT_COST`, JWT HS256 và biến JWT chỉ trong auth-service Compose.
- Nghiệm thu: tạo Driver `PENDING` bị chặn login; ACTIVE trả Bearer JWT 3600 giây với `sub`, `role=DRIVER`, `exp`; hai nhánh credential sai cùng `UNAUTHENTICATED/INVALID_CREDENTIALS`; DB có ciphertext `v1:`, bcrypt `$2`, blind index 64 ký tự; status PENDING và thiếu service token trả đúng lỗi.
- Lệnh dev đổi tạm: không.
- Commit: `T08: Auth users + Login`.

### [2026-10-01 20:05] T09 - Auth OTP (Redis) - HOÀN THÀNH
- Đã làm: thêm `otpService` cho RequestOtp/VerifyOtp với Redis HASH, TTL, đếm lần sai, so sánh hash timing-safe, xóa key chống race và onboarding JWT HS256; thêm bốn biến OTP chỉ vào auth-service Compose.
- Nghiệm thu: đạt 4/4 checklist T09 cùng kiểm tra bổ sung phone không hợp lệ, thiếu service token, TTL không reset, token không có `sub`/`role`, và dọn key Redis cụ thể.
- Lệnh dev đổi tạm: không.
- Commit: `T09: Auth OTP (Redis)`.

### [2026-10-01 20:20] T09-fix - RequestOtp trả OTP - HOÀN THÀNH
- Đã làm: thay đổi thiết kế có chủ đích so với SPEC cũ: Auth sinh OTP ngẫu nhiên 6 chữ số, chỉ trả cho client demo và chỉ lưu SHA-256 trong Redis. Đã sửa `otpService`, config/Compose/env, Auth proto, SPEC và TASKS; Gateway/Postman/hướng dẫn/scripts chưa có route hay request OTP để cập nhật.
- Nghiệm thu: RequestOtp nhiều lần trả OTP khác nhau; Redis hash/TTL/attempts đúng, OTP cũ và OTP sai bị từ chối, OTP đúng trả onboarding token rồi xóa key; sai 5 lần xóa key; toàn bộ 17 container healthy.
- Lệnh dev đổi tạm: không.
- Commit: `T09-fix: RequestOtp trả OTP`.

### [2026-10-01 20:30] T10 - Customer profile - DỞ DANG
- Chưa code: phát hiện `contracts/proto/customer.proto` có `CustomerProfile` không chứa `id`, trong khi nghiệm thu yêu cầu hai lần CreateCustomerProfile trả cùng `id`.
- Cần quyết định: cho phép thêm `id` vào proto, hoặc giữ proto và xác minh tính idempotent bằng DB.

### [2026-10-01 20:45] T10 - Customer profile - HOÀN THÀNH
- Đã làm: thêm schema `customer_profiles`/`reviews`, `escapeHtml`, Create/Get/Update Customer và `CustomerProfile.id = 4`; CreateReview/ListReviews giữ `UNIMPLEMENTED`.
- Nghiệm thu: đạt 6/6, gồm Create idempotent cùng `id` và một dòng DB, RBAC/NOT_FOUND, escape/validation, RPC/token và đủ hai bảng; đã xóa dữ liệu thử, 17 container healthy.
- Giả định / quyết định: thêm `id` vào CustomerProfile (proto) theo yêu cầu checklist T10.
- Lệnh dev đổi tạm: không.
- Commit: `T10: Customer profile`.

### [2026-10-01 21:00] T11 - Auth RegisterCustomer - HOÀN THÀNH
- Đã làm: Customer gRPC client có deadline/metadata correlation, RegisterCustomer tạo CUSTOMER/PENDING, tạo profile rồi chuyển ACTIVE; Customer lỗi thì rollback user theo id.
- Nghiệm thu: đạt 5/5 — ACTIVE/profile, encryption+bcrypt+Login, duplicate/validation/escape, rollback khi Customer dừng, token; đã dọn dữ liệu thử và 17 container healthy.
- Giả định / quyết định: Auth kiểm độ dài displayName sau escape nhưng gửi giá trị gốc để Customer escape đúng một lần trước khi lưu.
- Lệnh dev đổi tạm: không.
- Commit: `T11: Auth RegisterCustomer`.

### [2026-10-01 21:15] T12 - Gateway JWT + RBAC + route auth/customers - HOÀN THÀNH
- Đã làm: JWT/RBAC/onboarding guard, schema zod và các route Auth/Customer với metadata gRPC, deadline và mapper lỗi chuẩn.
- Nghiệm thu: đạt 8/8 gồm TC09-11, TC25-27, body/OTP/onboarding, correlation ID và cleanup; 17 container healthy.
- Lệnh dev đổi tạm: không.
- Commit: `T12: Gateway JWT RBAC routes`.

### [2026-10-02 08:00] T13 - Gateway rate limit - BLOCKED
- Đã làm: tạo `gateway/src/middlewares/rateLimit.js` (Lua INCR/TTL/EXPIRE, fail-open), thêm limiter/config/Compose và vị trí middleware Gateway.
- Còn lại: rebuild Gateway và toàn bộ nghiệm thu TC29, default limiter, Redis stop/start, cleanup key.
- BLOCKED: Docker Desktop Linux engine không truy cập được `npipe:////./pipe/dockerDesktopLinuxEngine` sau 3 lần thử; file dở: rateLimit.js, config/index.js, server.js, routes/auth.js, docker-compose.yml, TASKS.md.

### [2026-10-02 14:50] T13 - Gateway rate limit - HOÀN THÀNH
- Đã làm: Redis fixed-window Lua, default/login/booking limiter, fail-open, `Retry-After`, exact health bypass và `trust proxy=false`.
- Nghiệm thu: đạt 6/6 — login 5×401 rồi 429, request 100/101, reset key, Redis stop/start fail-open, body/header 429 và cleanup key; 17 container healthy.
- Giả định / quyết định: login chỉ đi qua login limiter, default bỏ qua health theo path chính xác; dùng IP socket Docker vì không có reverse proxy tin cậy.
- Lệnh dev đổi tạm: không.
- Commit: `T13: Gateway rate limit`.

### [2026-10-02 15:00] T14 - Driver onboarding - HOÀN THÀNH
- Đã làm: schema 4 bảng, crypto/blind-index, Auth client và Submit/List/Get Application; các RPC còn lại giữ UNIMPLEMENTED.
- Nghiệm thu: Submit PENDING + ciphertext/index, duplicate, List/Get ADMIN (license chỉ detail), escape và UNIMPLEMENTED; đã dọn dữ liệu thử, 17 container healthy.
- Lệnh dev đổi tạm: không.
- Commit: `T14: Driver onboarding`.

### [2026-10-02 15:20] T14 - Kiểm tra bổ sung - HOÀN THÀNH
- Nghiệm thu: Submit tạo `DRIVER/PENDING` khớp profile; duplicate license/plate/email là `ALREADY_EXISTS` và không sinh hàng DB; validation là `INVALID_ARGUMENT`, thiếu token là `UNAUTHENTICATED`.
- Nghiệm thu: CHECK constraint tạm thời làm transaction lỗi sau CreateDriverAccount; Auth user là `REJECTED`, driver-db không có hàng dở. List/Get ADMIN OK, role khác/thiếu role `PERMISSION_DENIED`, filter `PENDING_REVIEW` page=1 limit=1 trả total=2 totalPages=2, List không có license.
- Dọn dữ liệu: xóa theo ID 2 application/profile/vehicle và 3 Auth user; psql còn driver tables=0, auth users=2; 17 container healthy.
- Lệnh dev đổi tạm: không (constraint tạm đã gỡ).
- Commit: `T14: bổ sung nghiệm thu`.

### [2026-10-02 15:45] T15 - Driver Approve/Reject + event - HOÀN THÀNH
- Đã làm: thêm transaction `SELECT ... FOR UPDATE` cho duyệt/từ chối, đồng bộ trạng thái Auth trước COMMIT, Redis state sau COMMIT và publisher envelope `driver.approved`/`driver.rejected` persistent.
- Nghiệm thu: đạt toàn bộ; concurrent Approve chỉ 1 thành công/1 `STATE_CONFLICT`, event đúng envelope/deliveryMode=2, RabbitMQ dừng thì DB Approve vẫn `APPROVED`.
- Sửa lỗi phát hiện: ánh xạ DB `REJECTED` sang enum proto `DRIVER_REJECTED`; enum này đã có từ T01 nên nếu trả chuỗi DB trực tiếp gRPC sẽ rơi về `PENDING_REVIEW`.
- Dọn dữ liệu: xóa 4 application/profile/vehicle/user và 3 Redis key theo ID; queue tạm auto-delete; 17 container healthy.
- Lệnh dev đổi tạm: không.
- Commit: `T15: Driver Approve/Reject + event`.

### [2026-10-02 16:00] T16 - Driver work status + location - HOÀN THÀNH
- Đã làm: SetWorkStatus có transaction/history, UpdateLocation GEO/HASH không TTL, GetDriver theo driverId/userId.
- Nghiệm thu: đạt toàn bộ; BUSY trả `DRIVER_BUSY`, tọa độ sai `INVALID_COORDINATES`, GEO đúng lng/lat và TTL=-1.
- Giả định / quyết định: proto `Location` chưa có `updatedAt`; giữ timestamp trong Redis và trả qua field `address` để không tự đổi proto ngoài task.
- Dọn dữ liệu: xóa 2 driver/user/application/vehicle/history và Redis GEO/key theo ID; 17 container healthy.
- Commit: `T16: Driver work status + location`.

### [2026-10-02 16:35] T17 - Seed phần A (auth, customer, driver, Redis) - HOÀN THÀNH
- Đã làm: thêm `scripts/generate-env.js` để tạo `.env` local từ mẫu, dùng `crypto.randomBytes`, luôn ghi lại URL DB/RabbitMQ dẫn xuất; sửa loader của `scripts/seed.js` để đọc giá trị sau dấu `=` thay vì tra sai trong `process.env`.
- Nghiệm thu: seed chạy liên tiếp 2 lần; auth `users`=9, customer profile=2, driver/vehicle/application=6/6/6; Redis GEO=5, Driver 3 BUSY, Driver 4 OFFLINE, Driver 6 không có GEO; đăng nhập Admin/Customer 1/Driver 1 thành công và Driver 6 là `ACCOUNT_NOT_ACTIVE`.
- Bảo mật/reset dev: không có biến bí mật nào là `undefined`; phát hiện `RABBITMQ_DEFAULT_PASS` không đủ dài/ngẫu nhiên, đã sinh lại bí mật mạnh và reset `docker compose ... down -v`; 17 container healthy. Login sai mật khẩu, token payload sửa và `alg=none` đều bị từ chối; gRPC Health với service token thiếu/sai là `UNAUTHENTICATED`.
- Giả định / quyết định: `.env` từng chứa giá trị bí mật không hợp lệ theo yêu cầu bảo mật, đã sinh lại không in giá trị và reset volume dev.
- Lệnh dev đổi tạm: không.
- Commit: chưa commit.

### [2026-10-02 16:55] T17 - Bổ sung nghiệm thu - HOÀN THÀNH
- Sửa lỗi phát hiện: validator UUID Driver chỉ chấp nhận UUID RFC version/variant, trong khi ID seed cố định §12 có version/variant bằng `0`; mở rộng validator để nhận UUID seed, nhờ đó Driver 6 chưa duyệt bị `PERMISSION_DENIED` khi `UpdateLocation` thay vì `NOT_FOUND`.
- Nghiệm thu: Auth Login seed trả token cho Customer 1/Driver 1/Admin (Admin role `ADMIN`), Driver 6 trả `PERMISSION_DENIED` + `ACCOUNT_NOT_ACTIVE`; cipher/blind index/bcrypt seed đúng định dạng; Redis state/GEO/TTL đúng; seed lần 3 vẫn 9/2/6/6/6 và GEO=5.
- RabbitMQ: URL dẫn xuất khớp user/password local; Driver submit/approve thử publish `driver.approved` tới queue tạm; queue và dữ liệu Driver/Auth thử đã xóa, đếm lại đúng seed.
- Commit: `T17: bổ sung nghiệm thu`.

### [2026-10-02 17:15] T18 - Driver SearchNearby + Lua - HOÀN THÀNH
- Đã làm: `SearchNearbyDrivers` dùng Redis GEOSEARCH + pipeline state, một query DB cho driver APPROVED/vehicle, lọc/phân trang tại service; TryAssign/Release dùng đúng Lua atomic.
- Rà soát UUID: đã thay validator RFC version/variant bằng helper 8-4-4-4-12 hex ở `driver-service` và `customer-service`; không còn validator UUID chặt trong `services/` hoặc `gateway/`.
- Nghiệm thu: bán kính 1 km trả 211/213/212/214 với 334/445/547/624m; lọc ONLINE+AVAILABLE 3km trả 211/212/215, total=3; race 20 TryAssign chỉ 1 thắng; validation/token sai trả đúng gRPC code/trailer.
- Khôi phục dữ liệu: chạy lại seed, Redis `ZCARD drivers:geo=5`, Driver 211/212 ONLINE+AVAILABLE, 213 BUSY và 214 OFFLINE.
- Commit: `T18: Driver SearchNearby + TryAssign/Release`.
- Bổ sung rà soát UUID: thêm helper hex 8-4-4-4-12 cho Auth `GetUser`/`SetAccountStatus` và Gateway `GET /customers/:id`; seed user 101 qua cả Auth, Customer và Gateway không bị từ chối định dạng.
