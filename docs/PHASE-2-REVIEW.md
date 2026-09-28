# Review Giai đoạn 2 — Open Library và tìm kiếm

## Phạm vi đã hoàn thành

- Adapter backend gọi Search API, Work API, Editions API, Authors API và Covers API.
- Chuẩn hóa tên, tác giả, năm xuất bản, ảnh bìa, mô tả, subjects và edition/page count; dữ liệu thiếu được trả thành `null` hoặc mảng rỗng.
- Search nhận `q` và `page`, giới hạn 20 kết quả/trang, kiểm tra input bằng Zod và giới hạn 30 request/phút cho mỗi API process.
- Search truy vấn MySQL một lần cho toàn bộ work ID của trang để thêm `inShelf` và `hasArchivedProgress`.
- Backend cache search 60 giây và cache work/edition/author 5 phút; Open Library request timeout sau 5 giây.
- Ảnh bìa chỉ được tải qua `GET /api/covers/:coverId`; frontend không gọi trực tiếp Open Library.
- Lỗi upstream, timeout, validation, not-found và rate limit dùng error envelope chung.

## Endpoint

| Method | Path | Thành công |
| --- | --- | --- |
| `GET` | `/api/books?q=<keyword>&page=1` | `200`, trả `items`, `total`, `page`, `pageSize` |
| `GET` | `/api/books/:workId` | `200`, trả metadata và editions |
| `GET` | `/api/covers/:coverId` | `200`, ảnh JPEG và cache một ngày |

## Đã xác minh

- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build` — đạt.
- Tìm kiếm thực tế với `The Hobbit`, trang 1 và 2 — `200`, 20 mục/trang; kết quả có metadata và cờ tủ sách.
- Chi tiết `OL27482W` — `200`, có mô tả, tác giả, subjects và editions với page count khi được Open Library cung cấp.
- Ảnh bìa — `200 image/jpeg` qua backend; ID không tồn tại trả `404`.
- Query sai và work ID sai định dạng — `400 VALIDATION_ERROR`.
- Work ID hợp lệ nhưng không tồn tại — `404 BOOK_NOT_FOUND`.
- Request vượt giới hạn tìm kiếm — `429 SEARCH_RATE_LIMITED` kèm `Retry-After`.
- Frontend source không chứa URL trực tiếp tới Open Library.

## Chưa thuộc Giai đoạn 2

Chưa dựng giao diện tìm kiếm/chi tiết; chưa triển khai thao tác thêm sách, tủ sách hoặc quy tắc tiến độ. Các phần đó thuộc các giai đoạn sau và chưa được bắt đầu.

## Giới hạn cần biết

Rate limiter dùng bộ nhớ của một API process. Khi chạy nhiều PM2 worker/replica, mỗi worker có bộ đếm riêng; nếu cần giới hạn toàn cụm thì chuyển sang store dùng chung. Open Library có thể thiếu tác giả, ảnh bìa hoặc page count; API giữ các trường đó ở dạng rỗng để UI xử lý.
