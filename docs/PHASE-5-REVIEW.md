# Review Giai đoạn 5 — Đóng gói và triển khai VPS

## Phạm vi đã chuẩn bị

- Thêm Dockerfile multi-stage cho API; runtime image chỉ cài production dependencies, chạy bằng user non-root và dùng `pm2-runtime`.
- Thêm Dockerfile build Vue production và phục vụ static files bằng Nginx.
- Thêm Nginx SPA fallback, reverse proxy `/api`, HTTP to HTTPS redirect và ACME challenge path.
- Thêm `compose.prod.yaml` với MySQL volume riêng, healthcheck cho DB/API, migration one-shot trước API; chỉ web publish port 80/443.
- Thêm mẫu `.env.production`, hướng dẫn lấy/renew Let’s Encrypt certificate và quy trình backup/restore MySQL.
- Sửa API start script theo output thực tế của TypeScript build: `dist/src/server.js`.

## Xác minh

- `docker compose ... config -q`: đạt với mẫu production env.
- Build các image `api`, `migrate`, `web`: đạt. API image cài OpenSSL để Prisma nhận đúng OpenSSL 3 trên Debian Bookworm.
- Smoke test Compose cô lập: MySQL healthy, cả hai migrations được áp dụng, API chạy bằng `pm2-runtime`, `/api/health` trả 200 và báo database ok. Mô phỏng deploy lần sau bằng build, dừng API rồi `up --no-build`: `migrate` chạy lại, Prisma báo không có migration chờ áp dụng, API healthy. Đã dọn container, network và volume kiểm thử.
- Nginx render cấu hình với domain mẫu; `nginx -t` đạt khi dùng chứng chỉ tự ký trong container dùng một lần.
- `npm run build`, `npm run typecheck`, `npm run lint` và `git diff --check`: đạt. Docker smoke test và không có test suite triển khai riêng.
- `npm audit --omit=dev --workspace=@reading-tracker/api` hiện báo 1 moderate và 7 high advisory ở cây dependency `js-yaml`, `deepmerge-ts`, `mariadb`, `mysql2`. `npm audit fix --force` đề xuất hạ major Prisma/PM2; chưa áp dụng tự động vì có thể phá tương thích.
- Chưa kiểm tra DNS, chứng chỉ Let's Encrypt thật, firewall, backup/restore hoặc dữ liệu sau restart trên VPS thật vì chưa có domain/VPS.

## Điều kiện trước khi triển khai thật

- Cấu hình domain trỏ tới VPS và mở inbound TCP 80/443.
- Tạo `.env.production` với mật khẩu riêng đủ mạnh; đặt `DATABASE_URL` cùng thông tin với `MYSQL_*` và URL-encode ký tự đặc biệt.
- Chạy quy trình cấp chứng chỉ lần đầu trong [deploy/README.md](../deploy/README.md), sau đó chạy Compose và xác nhận `/api/health` trả HTTP 200.
- Thiết lập lịch backup định kỳ và lưu bản sao ngoài VPS; thử restore trước khi dựa vào bản backup production.
- Quyết định phạm vi truy cập domain vì ứng dụng không có đăng nhập và mọi khách truy cập cùng sửa một tủ sách.
- Rà soát và xử lý advisory dependency trước khi công khai dịch vụ ra Internet.
