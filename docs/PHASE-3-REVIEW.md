# Review Giai đoạn 3 — Tủ sách và quy tắc nghiệp vụ

## Phạm vi đã hoàn thành

- Thêm `shelf-routes.ts` cho list/filter, stats, create/restore, patch và soft delete.
- Thêm `shelf-service.ts` cho nghiệp vụ và `shelf-repository.ts` làm ranh giới duy nhất giữa module nghiệp vụ và Prisma.
- Chuyển các truy vấn `inShelf`/`hasArchivedProgress` trong BooksService qua repository; BooksService cũng không gọi Prisma trực tiếp.
- Chống thêm trùng bằng kiểm tra service và unique constraint trong MySQL; lỗi race condition `P2002` được chuyển thành `409 BOOK_ALREADY_IN_SHELF`.
- Lưu snapshot metadata vào MySQL, chọn edition/page count từ API hoặc nhập tổng trang thủ công.
- Áp dụng quy tắc ngày bắt đầu/kết thúc, nhảy trang, tự hoàn thành, mở lại sách đã đọc, rating/note và reset về muốn đọc.
- Xóa mềm bằng `deletedAt`; thêm lại khôi phục nguyên trạng thái, trang, rating, note và ngày đọc.
- Thêm 10 unit test cho các quy tắc tiến độ.

## Endpoint

| Method | Path | Hành vi |
| --- | --- | --- |
| `GET` | `/api/shelf?status=` | Danh sách sách chưa xóa mềm; lọc status tùy chọn |
| `GET` | `/api/shelf/stats` | Tổng sách, đang đọc, đã đọc |
| `POST` | `/api/shelf` | `201` khi thêm mới, `200` khi khôi phục, `409` nếu đang có trong tủ |
| `PATCH` | `/api/shelf/:id` | Cập nhật tiến độ/trạng thái/tổng trang/rating/note |
| `DELETE` | `/api/shelf/:id` | Xóa mềm, trả `204` |

## Xác minh

- `npm test`: 10/10 test quy tắc tiến độ đạt.
- `npm run lint`, `npm run format:check`, `npm run typecheck`, `npm run build`: đạt.
- Smoke test API trên MySQL local và Open Library: thêm tác phẩm với edition 306 trang; trang 102 cho tiến độ 33%; trang 306 tự chuyển `READ`; giảm về 102 chuyển lại `READING` và bỏ `finishedAt`.
- Smoke test xác nhận thêm trùng trả `409`, rating/note cập nhật được, xóa mềm làm cờ archived bật, thêm lại trả `restored: true` và giữ nguyên tiến độ cũ.
- Fixture smoke test đã được dọn khỏi MySQL; sau cleanup, sách không còn trong tủ và không còn cờ archived.

Unit test có thể chạy bằng `npm test`. Smoke test MySQL/Open Library vừa rồi chạy trên database local hiện có; chưa thêm database hoặc harness tích hợp riêng cho CI.

## Ranh giới tầng

```text
Express route -> shelf-service -> shelf-repository -> Prisma/MySQL
books-service ----------------> shelf-repository -> Prisma/MySQL
```

`shelf-service.ts`, `shelf-rules.ts` và `books-service.ts` không import Prisma Client. Truy vấn health check trong `app.ts` vẫn gọi Prisma trực tiếp vì đó là kiểm tra kết nối hạ tầng.

## Chưa thuộc Giai đoạn 3

Chưa dựng màn hình tủ sách hoặc giao diện thêm sách; các luồng UI thuộc Giai đoạn 4. Chưa triển khai deploy production.
