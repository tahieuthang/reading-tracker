# Triển khai trên VPS

Frontend Vue được build thành file tĩnh và phục vụ qua Nginx. Nginx chuyển tiếp `/api` tới Express; MySQL chỉ nằm trong mạng nội bộ của Docker Compose. API chạy bằng `pm2-runtime`, và migration Prisma phải hoàn tất trước khi API khởi động.

`migrate` là job chạy một lần khi được Compose khởi động hoặc tạo lại. Trạng thái `Exited (0)` sau khi migration hoàn tất là bình thường; service này không chạy nền liên tục.

## Luồng triển khai hiện tại

Việc triển khai đang thực hiện **thủ công trên VPS**. Sau khi đưa mã nguồn lên repository, người vận hành đăng nhập VPS, lấy phiên bản mới và chạy Docker Compose. Repository chưa có pipeline CI/CD tự động build hoặc deploy. Gia hạn chứng chỉ và sao lưu cũng cần được đặt lịch riêng trên VPS.

## Chuẩn bị VPS

1. Cài Docker Engine và Docker Compose plugin.
2. Trỏ bản ghi DNS A của domain về VPS. Chỉ thêm bản ghi AAAA khi VPS đã cấu hình IPv6. Cho phép kết nối TCP đến cổng 80 và 443 trên firewall; bảo đảm không có dịch vụ khác chiếm hai cổng này.
3. Clone repository lên VPS. Sao chép `deploy/production.env.example` thành `.env.production` ở thư mục gốc, thay domain, email và mật khẩu mẫu. Giới hạn quyền đọc file bằng `chmod 600 .env.production`.
4. Đặt `DATABASE_URL` trùng tên database, username và password trong các biến `MYSQL_*`; dùng host `db`, port `3306`. Mã hóa phần trăm các ký tự đặc biệt trong username/password của URL. Không publish cổng MySQL ra Internet.

Ứng dụng không có đăng nhập: bất kỳ ai truy cập được domain đều dùng và có thể sửa cùng một tủ sách. Nếu chỉ dùng cá nhân, hãy giới hạn IP truy cập tại firewall hoặc reverse proxy.

## Triển khai lần đầu và cấp HTTPS

Certbot cấp chứng chỉ lần đầu bằng chế độ `standalone`, nên cổng 80 của VPS cần trống trong lúc chạy lệnh thứ hai.

```sh
docker compose --env-file .env.production -f compose.prod.yaml up -d db
docker compose --env-file .env.production -f compose.prod.yaml run --rm --service-ports certbot
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
```

Certbot lấy `DOMAIN` và `LETSENCRYPT_EMAIL` từ `.env.production`. Lệnh cuối build image, đợi MySQL sẵn sàng, chạy migration, đợi API healthy rồi khởi động Nginx. Kiểm tra `https://<domain>/api/health` trả HTTP 200 và mở thử giao diện.

## Các lần triển khai sau

Đăng nhập VPS, vào thư mục repository rồi chạy:

```sh
git pull --ff-only
docker compose --env-file .env.production -f compose.prod.yaml build migrate api web
docker compose --env-file .env.production -f compose.prod.yaml stop web api
docker compose --env-file .env.production -f compose.prod.yaml up -d --no-build
```

Build xong trước khi dừng ứng dụng để giảm thời gian gián đoạn. Sau đó web/API tạm dừng trong lúc migration chạy. Khi image hoặc cấu hình của `migrate` thay đổi, Compose tạo lại service này; API chỉ được khởi động sau khi migration hoàn tất thành công và MySQL healthy, rồi web mới khởi động. Prisma chỉ áp dụng những migration chưa được áp dụng. Nếu migration lỗi, giữ API/web ở trạng thái dừng và kiểm tra `docker compose --env-file .env.production -f compose.prod.yaml logs migrate` trước khi thử lại.

## Gia hạn chứng chỉ HTTPS

Nginx phục vụ đường dẫn ACME challenge trên HTTP và chuyển các request HTTP còn lại sang HTTPS. Đặt lịch chạy các lệnh sau trên VPS, ví dụ mỗi ngày một lần; Certbot chỉ gia hạn chứng chỉ khi đến hạn.

```sh
docker compose --env-file .env.production -f compose.prod.yaml run --rm certbot renew --webroot -w /var/www/certbot
docker compose --env-file .env.production -f compose.prod.yaml exec -T web nginx -s reload
```

Nginx cần được reload để đọc file chứng chỉ mới. Hiện repository chưa tự tạo lịch gia hạn.

## Sao lưu và khôi phục MySQL

Tạo bản sao lưu nén trong thư mục `backups/` (đã được Git bỏ qua):

```bash
set -euo pipefail
mkdir -p backups
umask 077
docker compose --env-file .env.production -f compose.prod.yaml exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump --user=root --databases "$MYSQL_DATABASE" --single-transaction --routines --triggers --events --add-drop-table' | gzip > "backups/reading-tracker-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
```

Đặt lịch sao lưu phù hợp và giữ thêm một bản ở ngoài VPS. Khi cần khôi phục, thay tên file bên dưới bằng bản sao lưu cần dùng. Việc import sẽ thay các bảng tương ứng bằng dữ liệu trong bản sao lưu:

```bash
set -euo pipefail
BACKUP_FILE=backups/reading-tracker-YYYYMMDDTHHMMSSZ.sql.gz
gzip -t "$BACKUP_FILE"
docker compose --env-file .env.production -f compose.prod.yaml stop api
gzip -dc "$BACKUP_FILE" | docker compose --env-file .env.production -f compose.prod.yaml exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql --user=root'
docker compose --env-file .env.production -f compose.prod.yaml up -d api web
```

## Kiểm tra vận hành

- Xem trạng thái service: `docker compose --env-file .env.production -f compose.prod.yaml ps`.
- Xem log API: `docker compose --env-file .env.production -f compose.prod.yaml logs -f api`.
- Kiểm tra API và kết nối database qua Nginx tại `/api/health`.
- Dữ liệu MySQL nằm trong named volume `mysql_data`. Không chạy `docker compose down -v` trên production vì lệnh này xóa volume đó.
- Repository chưa có thông tin VPS/domain thật; DNS, cấp chứng chỉ, firewall, sao lưu/khôi phục và kiểm tra sau restart phải được thực hiện trên VPS đích.
