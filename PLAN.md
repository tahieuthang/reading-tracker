# Kế hoạch triển khai Reading Tracker

## 1. Mục tiêu và phạm vi

Ứng dụng web một tủ sách chung, không có tài khoản đăng nhập. Người dùng tìm sách qua Open Library, xem chi tiết, thêm vào tủ và theo dõi tiến độ. Frontend không gọi trực tiếp Open Library, kể cả ảnh bìa. Dữ liệu tủ sách lưu trong MySQL và còn sau khi khởi động lại ứng dụng.

Ba màn hình cần hoàn thành:

1. Tìm kiếm sách: tìm theo tên/tác giả, 20 kết quả mỗi trang, phân trang, ảnh bìa, tên, tác giả, năm, badge đã thêm, loading/rỗng/lỗi.
2. Chi tiết sách: ảnh, tên, tác giả, mô tả, số trang nếu có, chủ đề, năm; thêm vào tủ với trạng thái ban đầu.
3. Tủ sách: ba tab trạng thái, thống kê, tiến độ, cập nhật trang, trạng thái, điểm 1–5, ghi chú, xoá có xác nhận.

**Phạm vi đọc sách:** bản đầu là ứng dụng **theo dõi tiến độ đọc**, không hiển thị nội dung từng trang sách. `current_page` là số trang người dùng tự cập nhật theo cuốn sách họ đang đọc; nút tăng/giảm nếu có chỉ chỉnh con số này, không lật nội dung sách. Ba API Open Library trong đề bài cung cấp metadata và ảnh bìa, không cung cấp nội dung trang để xây trình đọc. Không tạo các trang trắng hay hiệu ứng lật giả làm nội dung sách.

Ngoài phạm vi bản đầu: trình đọc sách trong app, đăng nhập, nhiều tủ sách, đồng bộ với tài khoản Open Library, nhập sách ngoài Open Library, lịch sử nhiều lần đọc và tính năng xã hội. Trình đọc thật được ghi ở roadmap giai đoạn 6; bản đầu không phụ thuộc vào khả năng lấy nội dung số.

## 2. Quyết định kiến trúc

- **Backend modular monolith:** một Express 5 API, chia `books` và `shelf` thành hai module. `books` làm việc với Open Library; `shelf` xử lý dữ liệu và quy tắc nghiệp vụ trong MySQL.
- **Frontend:** Vue 3, TypeScript, Vite, Tailwind CSS, Vue Router và TanStack Vue Query. Dữ liệu server không được lưu làm nguồn chính trong localStorage/Pinia.
- **Backend:** Node.js + TypeScript, Express 5, Zod cho input, `pino` + `pino-http` cho log, error middleware duy nhất để chuẩn hoá lỗi. Dùng `express.json()` và giới hạn kích thước body.
- **Database:** MySQL + Prisma ORM major 7 và Prisma Migrate. Ghim major tương thích MySQL khi tạo dự án.
- **Deploy:** Docker Compose gồm `web` (Nginx phục vụ Vue và reverse proxy `/api`), `api` (Node qua `pm2-runtime`) và `db` (MySQL, volume bền vững). Chỉ Nginx mở cổng công khai; API và MySQL ở mạng nội bộ Compose.
- **Một người dùng:** không có `user_id`. Mọi trình duyệt truy cập được ứng dụng cùng thao tác trên một tủ sách; cấu hình phạm vi truy cập VPS theo cách sử dụng thực tế.

## 3. Mô hình sách và quy tắc trang

Open Library tìm kiếm theo **work** (tác phẩm), còn số trang thuộc **edition** (ấn bản). Chống trùng theo `workId`; một work chỉ có một mục trong tủ. Chi tiết sách có thể cho chọn edition có số trang. Nếu không có số trang phù hợp, người dùng nhập `totalPages` thủ công. Lưu `editionId` khi chọn edition và nguồn số trang (`EDITION` hoặc `MANUAL`) để hiển thị minh bạch.

`totalPages` được phép `null`; khi đó vẫn thêm sách được, nhưng không nhập `currentPage > 0` và không hiển thị phần trăm tiến độ. Khi người dùng bổ sung tổng số trang, backend áp dụng lại các bất biến tiến độ. Không dùng 0 làm tổng số trang vì 0/0 gây sai quy tắc hoàn thành.

Bảng `shelf_books`:

| Cột | Quy tắc |
| --- | --- |
| `id` | Khoá chính nội bộ |
| `work_id` | Open Library work ID, unique index |
| `edition_id` | Nullable; edition chọn để lấy số trang |
| `title`, `authors`, `cover_id`, `first_publish_year` | Snapshot để tủ sách không phụ thuộc Open Library khi hiển thị |
| `description`, `subjects` | Snapshot tuỳ chọn cho trang chi tiết của sách đã lưu |
| `total_pages`, `page_count_source` | Nullable; tổng trang dương nếu có |
| `current_page` | Số nguyên không âm, mặc định 0 |
| `status` | `WANT_TO_READ`, `READING`, `READ` |
| `rating`, `note` | Rating nullable 1–5; note giới hạn độ dài |
| `started_at`, `finished_at` | Nullable; mốc của lần đọc hiện tại |
| `deleted_at` | Nullable; gỡ khỏi tủ nhưng giữ tiến độ để khôi phục |
| `created_at`, `updated_at` | Mốc lưu/cập nhật |

Quy tắc cập nhật nằm trong một service và được áp dụng trước mọi ghi DB:

1. `work_id` unique trong DB; bắt lỗi unique và trả HTTP 409 kể cả hai request đồng thời.
2. `total_pages` là `null` hoặc số nguyên > 0. `current_page` là số nguyên >= 0; nếu `total_pages` có giá trị thì `current_page <= total_pages`. Nếu chưa có tổng trang, `current_page` phải bằng 0.
3. `rating` là `null` hoặc số nguyên từ 1 đến 5; `note` tối đa 1000 ký tự.
4. Khi vào `READING` và `started_at` chưa có, ghi thời điểm bắt đầu.
5. Khi `current_page === total_pages` với tổng trang đã biết, tự chuyển `READ`, ghi `finished_at`. Chọn `READ` thủ công khi đã biết tổng trang sẽ đặt `current_page = total_pages`; khi chưa biết tổng trang vẫn cho đánh dấu đọc xong và không hiển thị %.
6. Giảm trang xuống dưới tổng sau khi đã đọc xong sẽ chuyển về `READING` và xoá `finished_at`. Chuyển về `WANT_TO_READ` bắt đầu lại chu kỳ: `current_page = 0`, xoá `started_at` và `finished_at`.
7. Nếu yêu cầu `READING` trong khi trang hiện tại vẫn bằng tổng trang, trả lỗi 422 và yêu cầu gửi `currentPage` thấp hơn trong cùng request; không âm thầm sửa số trang.
8. Khi sửa `total_pages`, tính bất biến trên trạng thái cuối của cả request. Nếu tổng mới nhỏ hơn `current_page`, trả 422 trừ khi request đồng thời sửa `current_page` hợp lệ. Nếu sách đang `READ` mà trước đó chưa có tổng trang, khi bổ sung tổng sẽ đặt `current_page = total_pages`; nếu muốn tiếp tục đọc, gửi cả trạng thái và trang hiện tại trong cùng request.
9. `DELETE` đặt `deleted_at`, không xoá vật lý. Sách đã gỡ không hiện trong ba tab, thống kê hoặc badge “Đã thêm”. Thêm lại cùng `work_id` khôi phục bản ghi cũ gồm trạng thái, `current_page`, số trang, điểm, ghi chú và ngày đọc; `deleted_at` trở về `null`. Chỉ sách đang hoạt động mới bị coi là trùng và trả 409. Đổi về `WANT_TO_READ` sau khi khôi phục là cách bắt đầu lại tiến độ.

Với sách từng được gỡ, frontend hiển thị “Khôi phục vào tủ” dựa trên `hasArchivedProgress`. Thao tác khôi phục giữ trạng thái cũ, nên không dùng giá trị trạng thái ban đầu của luồng thêm mới; response trả `restored: true` để giao diện thông báo rõ. Nếu muốn bắt đầu lại, người dùng có thể đổi trạng thái sang `WANT_TO_READ` sau khi khôi phục.

## 4. REST API contract

Prefix `/api`. Tất cả query, params và body được Zod kiểm tra ở backend. ID Open Library phải đúng mẫu định danh được hỗ trợ; không nhận URL tuỳ ý để proxy.

| Method/path | Mục đích | Thành công |
| --- | --- | --- |
| `GET /api/books?q=&page=` | Tìm kiếm Open Library; 20 kết quả/trang, trả `items`, `total`, `page`, `pageSize`, `inShelf`, `hasArchivedProgress` | 200 |
| `GET /api/books/:workId` | Chi tiết work, tác giả và edition/số trang có thể chọn | 200 |
| `GET /api/covers/:coverId` | Stream/cache ảnh bìa từ backend | 200 |
| `GET /api/shelf?status=` | Danh sách tủ sách, có thể lọc trạng thái | 200 |
| `GET /api/shelf/stats` | Tổng số, đang đọc, đã đọc | 200 |
| `POST /api/shelf` | Thêm `workId`, trạng thái ban đầu, edition/tổng trang nếu có; nếu đã gỡ thì khôi phục tiến độ cũ | 201 khi mới; 200 khi khôi phục |
| `PATCH /api/shelf/:id` | Cập nhật trạng thái, tổng trang, trang hiện tại, điểm, ghi chú | 200 |
| `DELETE /api/shelf/:id` | Gỡ mục khỏi tủ, giữ dữ liệu để thêm lại; UI xác nhận và nói rõ sẽ giữ tiến độ | 204 |
| `GET /api/health` | Kiểm tra API và kết nối DB cho deploy | 200 hoặc 503 |

Lỗi JSON thống nhất:

```json
{
  "error": {
    "code": "BOOK_ALREADY_IN_SHELF",
    "message": "Sách này đã có trong tủ sách.",
    "details": [],
    "requestId": "..."
  }
}
```

HTTP status nằm ở response, không cần lặp trong body. Mapping chính: 400 input sai định dạng, 404 không thấy sách/mục tủ, 409 trùng sách, 422 vi phạm quy tắc tiến độ/trạng thái, 502 hoặc 504 Open Library lỗi/hết thời gian, 500 lỗi nội bộ. Không trả stack trace ra client; log server giữ `requestId` để tra cứu.

## 5. Cấu trúc thư mục dự kiến

```text
reading-tracker/
├─ apps/
│  ├─ web/
│  │  └─ src/
│  │     ├─ pages/                    # Search, BookDetail, MyShelf
│  │     ├─ features/                 # search, book-detail, shelf
│  │     ├─ components/               # BookCard, StatusBadge, ProgressBar...
│  │     ├─ router/
│  │     └─ lib/api.ts
│  └─ api/
│     ├─ prisma/                   # schema và migrations
│     └─ src/
│        ├─ modules/books/          # route, service, Open Library adapter
│        ├─ modules/shelf/          # route, service, repository, rules
│        ├─ middleware/             # validate, request logger, error handler
│        ├─ lib/                    # Prisma client, config, typed errors
│        ├─ app.ts                  # Tạo Express app để test
│        └─ server.ts               # Listen/PM2 entry
├─ packages/contracts/             # DTO/schema chia sẻ nếu giảm trùng lặp thực sự
├─ deploy/nginx/
├─ compose.yaml
├─ .env.example
└─ PLAN.md
```

`packages/contracts` chỉ tạo khi API và UI cùng cần dùng các type/schema; tránh dựng package rỗng. Backend luôn validate độc lập với frontend.

## 6. Thứ tự triển khai và tiêu chí xong

### Giai đoạn 0 — Đặc tả có thể code

- Đặc tả API, quy tắc trạng thái, wireframe và khảo sát reader đã ghi tại [docs/PHASE-0-REVIEW.md](docs/PHASE-0-REVIEW.md); trạng thái hiện tại: chờ chủ dự án review.
- Chốt tên field/enum, request/response cho từng endpoint, quy tắc trạng thái ở mục 3 và wireframe đơn giản của ba màn hình.
- Khảo sát nhỏ một hoặc hai edition đọc tự do để ghi nhận cách xác định nội dung số và ánh xạ trang; kết quả chỉ định hướng giai đoạn 6, không mở rộng phạm vi bản đầu.
- **Xong khi:** không còn trường hợp tiến độ hoặc lỗi chưa có kết quả xử lý rõ ràng.

### Giai đoạn 1 — Nền tảng và dữ liệu

- Tạo npm workspaces, cấu hình TypeScript, lint/format, Vite/Vue/Tailwind và Express app.
- Tạo Prisma schema, migration MySQL đầu tiên, `.env.example`, Docker Compose MySQL cho local.
- Thêm Zod validation middleware, `pino-http`, error middleware và health endpoint.
- **Xong khi:** API khởi động, kết nối MySQL, migration chạy, lỗi 400/500 theo format chung.

### Giai đoạn 2 — Open Library và tìm kiếm

- Tạo adapter gọi Search, Work, Editions, Covers; chuẩn hoá mô tả/author/cover/năm thiếu dữ liệu.
- Thêm timeout, cache ngắn, `User-Agent`, giới hạn truy vấn và ảnh bìa qua backend.
- Trả `inShelf` bằng một truy vấn MySQL cho 20 work ID của trang hiện tại.
- **Xong khi:** search/chi tiết/phân trang hoạt động; lỗi hoặc timeout upstream được trả đúng status; frontend không có request tới miền Open Library.

### Giai đoạn 3 — Tủ sách và quy tắc nghiệp vụ

- CRUD tủ sách, thống kê, unique conflict, quy tắc số trang/trạng thái/ngày đọc.
- Gỡ mềm bằng `deleted_at`, lọc sách đang hoạt động trong mọi danh sách/thống kê và khôi phục đúng tiến độ khi thêm lại.
- Test service bằng ca biên và test API với MySQL test; mock Open Library cho test có tính lặp lại.
- **Xong khi:** tất cả bất biến ở mục 3 được kiểm chứng, dữ liệu còn sau restart API/DB container.

### Giai đoạn 4 — Giao diện ba màn hình

- Làm màn tìm kiếm, chi tiết, tủ sách; responsive, trạng thái loading/rỗng/lỗi và xác nhận xoá.
- Đồng bộ badge đã thêm và stats sau thao tác bằng invalidate/refetch query.
- Test các luồng chính và một luồng E2E: tìm → thêm → cập nhật trang → tự hoàn thành → xoá.
- **Xong khi:** toàn bộ yêu cầu ba màn hình dùng được qua UI, không cần gọi API thủ công.

### Giai đoạn 5 — Đóng gói và triển khai VPS

- Dockerfile web/api, Nginx SPA fallback và `/api` reverse proxy, `pm2-runtime` cho API, Compose MySQL volume.
- Migration khi deploy, healthcheck, biến môi trường, HTTPS, sao lưu/khôi phục MySQL tối thiểu.
- **Xong khi:** build và chạy Compose thành công; kiểm tra luồng chính trên VPS và xác nhận dữ liệu tồn tại sau restart. Triển khai thực tế cần thông tin VPS/domain từ chủ dự án.

### Giai đoạn 6 — Tính năng mở rộng: trình đọc thật

Chỉ bắt đầu sau khi bản đầu hoàn thành và kết quả khảo sát xác nhận có nguồn nội dung phù hợp. Đây là hạng mục riêng, không nằm trong tiêu chí bàn giao bản đầu.

- Chọn tập edition có nội dung số được phép đọc tự do; phân biệt rõ với bản chỉ có metadata hoặc cần tài khoản mượn sách.
- Chốt nguồn nội dung và cách backend cung cấp cho frontend theo yêu cầu không gọi trực tiếp dịch vụ ngoài. Không giả định Read API trả toàn bộ nội dung; API này chủ yếu giúp tìm link/trạng thái đọc hoặc mượn.
- Làm reader hiển thị nội dung thật, điều hướng trang bằng chuột/bàn phím, lưu vị trí theo edition và ánh xạ vị trí reader sang `current_page` của tủ sách.
- Chỉ thêm hiệu ứng lật trang sau khi việc tải nội dung, chuyển trang, lưu/khôi phục vị trí đã hoạt động đúng; đo khả năng dùng trên điện thoại và chế độ giảm chuyển động.
- **Xong khi:** ít nhất một edition đọc tự do đọc được trong app qua backend, vị trí được khôi phục sau tải lại, sách không có nội dung hiện thông báo rõ, và không có request nội dung trực tiếp từ frontend đến Open Library/Internet Archive.

## 7. Cổng kiểm tra trước khi bàn giao

- Typecheck, lint và build của cả frontend/backend đều đạt.
- Test quy tắc nghiệp vụ: trùng 409; trang âm/quá tổng; rating ngoài 1–5; tự hoàn thành; ngày bắt đầu/ngày xong; thiếu số trang; chuyển trạng thái ngược.
- Test gỡ sách đang đọc dở rồi thêm lại: số trang, trạng thái, điểm và ghi chú được giữ; danh sách và thống kê không tính sách đã gỡ.
- Test tích hợp API và MySQL cho CRUD/stats; Open Library được mock trong test tự động.
- Kiểm tra Network của trình duyệt: chỉ gọi cùng origin `/api`, kể cả bìa.
- Kiểm tra loading, rỗng, lỗi upstream, ảnh lỗi và phân trang trên giao diện.
- Kiểm tra Compose/restart/volume và healthcheck trước khi coi deploy là hoàn tất.

## Tài liệu tham khảo

- Open Library: https://openlibrary.org/developers/api và https://openlibrary.org/dev/docs/api/search
- Khả năng đọc nội dung: https://openlibrary.org/help/faq/reading, https://openlibrary.org/dev/docs/api/read và https://openlibrary.org/dev/docs/bookreader
- Express 5: https://expressjs.com/en/5x/api/
- Zod: https://zod.dev/basics
- pino-http: https://github.com/pinojs/pino-http
- Prisma ORM 7 + MySQL: https://docs.prisma.io/docs/orm/v7/core-concepts/supported-databases
