# Giai đoạn 0 — Đặc tả để review

Trạng thái: **đã hoàn tất phần đặc tả, chờ review trước Giai đoạn 1**.

Đây là một app một tủ sách dùng chung, không có đăng nhập. Bản đầu theo dõi sách người dùng đang đọc; nội dung từng trang và reader lật trang thuộc Giai đoạn 6 trong roadmap.

## 1. Contract chung

- API prefix: `/api`; JSON UTF-8.
- Ngày giờ trả về theo ISO 8601 UTC.
- Thành công trả `{ "data": ... }`; danh sách tìm kiếm thêm `meta` phân trang.
- Lỗi luôn trả `{ "error": { "code", "message", "details", "requestId" } }`; HTTP status phản ánh kết quả, không nhúng stack trace vào response.
- `workId` nhận dạng tác phẩm, ví dụ `OL...W`; `editionId` nhận dạng ấn bản, ví dụ `OL...M`.
- Backend gọi Open Library và chuẩn hoá response. Frontend chỉ gọi cùng origin `/api`, kể cả lấy ảnh bìa.

## 2. Endpoint và response

### `GET /api/books?q={keyword}&page={n}`

- `q`: trim, 2–120 ký tự; `page`: số nguyên từ 1; backend luôn dùng page size 20.
- Gọi Search API với danh sách trường cần thiết, không dùng `fields=*`.
- `totalResults` lấy từ `numFound`; `totalIsExact` lấy từ `numFoundExact` nếu có.
- Gộp trạng thái kệ từ MySQL theo batch work IDs để tránh query từng kết quả.

```json
{
  "data": {
    "items": [
      {
        "workId": "OL27448W",
        "title": "The Lord of the Rings",
        "authors": ["J. R. R. Tolkien"],
        "firstPublishYear": 1954,
        "coverUrl": "/api/covers/258027?size=M",
        "inShelf": false,
        "hasArchivedProgress": false
      }
    ]
  },
  "meta": { "page": 1, "pageSize": 20, "totalResults": 629, "totalIsExact": true }
}
```

### `GET /api/books/:workId`

Trả metadata tác phẩm và tối đa 10 edition liên quan để chọn số trang. Trường Open Library thiếu hoặc không đúng kiểu được chuẩn hoá thành `null`/`[]`; mô tả chuỗi hoặc object đều chuyển thành text.

```json
{
  "data": {
    "workId": "OL27448W",
    "title": "The Lord of the Rings",
    "authors": ["J. R. R. Tolkien"],
    "description": "...",
    "subjects": ["Fantasy", "Middle Earth"],
    "firstPublishYear": 1954,
    "coverUrl": "/api/covers/258027?size=M",
    "editions": [
      { "editionId": "OL...M", "title": "The Lord of the Rings", "language": "eng", "publishDate": "1954", "pageCount": 1178 }
    ]
  }
}
```

Nếu không tìm được edition/số trang phù hợp, UI cho phép nhập tổng trang thủ công khi thêm sách. `editionId` có thể vắng mặt; `totalPages` lưu nguồn `MANUAL` hoặc `EDITION`.

### `GET /api/covers/:coverId?size={S|M|L}`

- `coverId` là số nguyên dương; size mặc định `M`, chỉ chấp nhận `S`, `M`, `L`.
- Backend stream ảnh từ Covers API và đặt cache header; frontend có ảnh fallback cục bộ khi ảnh không có/lỗi.

### `GET /api/shelf?status={WANT_TO_READ|READING|READ}`

Trả các mục chưa bị gỡ, có thể lọc theo trạng thái; không truyền `status` thì trả tất cả.

```json
{
  "data": {
    "items": [
      {
        "id": "uuid",
        "workId": "OL27448W",
        "title": "The Lord of the Rings",
        "authors": ["J. R. R. Tolkien"],
        "coverUrl": "/api/covers/258027?size=M",
        "totalPages": 1178,
        "currentPage": 210,
        "progressPercent": 18,
        "status": "READING",
        "rating": null,
        "note": "",
        "startedAt": "2026-09-28T10:00:00.000Z",
        "finishedAt": null
      }
    ]
  }
}
```

Khi `totalPages` là `null`, `progressPercent` cũng là `null`. Nếu đã biết tổng trang, backend tính phần trăm bằng `Math.round(currentPage / totalPages * 100)`; đây là giá trị suy ra, không lưu riêng trong DB. Ví dụ sách 100 trang: trang 3 là 3%, trang 90 là 90%. Brief ban đầu chỉ yêu cầu cập nhật số trang và hiển thị tỷ lệ trang hiện tại trên tổng trang; nó không nói rõ có bắt buộc đọc tuần tự hay không. **Quyết định bổ sung của dự án:** cho phép nhập/nhảy/lùi trực tiếp đến trang bất kỳ miễn còn trong giới hạn hợp lệ; API không yêu cầu cập nhật từng trang.

### `GET /api/shelf/stats`

```json
{ "data": { "totalCount": 5, "readingCount": 2, "readCount": 1 } }
```

Chỉ đếm mục đang hoạt động; sách đã gỡ không xuất hiện trong list, stats hay `inShelf`.

### `POST /api/shelf`

Request cho sách mới:

```json
{
  "workId": "OL27448W",
  "status": "WANT_TO_READ",
  "editionId": "OL...M",
  "totalPages": 1178,
  "pageCountSource": "EDITION"
}
```

- `status` bắt buộc; nhận enum `WANT_TO_READ`, `READING`, `READ`.
- Backend tự nạp metadata theo `workId`, không tin title/author/cover gửi từ client.
- Nếu `editionId` được chọn, backend tự nạp số trang edition đó; nếu người dùng nhập tay, không gửi `editionId` và dùng `pageCountSource: MANUAL`.
- Thêm mới trả `201` và `{ "data": { "item": ... , "restored": false } }`.
- Nếu mục đang hoạt động đã tồn tại, trả `409 BOOK_ALREADY_IN_SHELF`.
- Nếu tìm thấy mục đã gỡ, khôi phục nguyên trạng, trả `200` và `restored: true`; không áp trạng thái khởi tạo mới.

### `PATCH /api/shelf/:id`

Nhận ít nhất một trường có thể sửa: `status`, `totalPages`, `currentPage`, `rating`, `note`. Body patch rỗng trả `400 EMPTY_PATCH`.

```json
{ "currentPage": 1178 }
```

Service tính trạng thái cuối rồi mới ghi DB. Nếu `currentPage === totalPages`, tự đặt `status=READ` và `finishedAt=now`. Chuyển vào `READING` lần đầu ghi `startedAt`. Sách đang `READ` có thể chuyển về `READING` bằng `PATCH` gửi `status=READING` cùng `currentPage < totalPages`; nếu số trang chưa biết, chỉ cần gửi `status=READING`. Khi rời `READ`, xoá `finishedAt` và giữ `startedAt`. Nếu sửa tổng trang làm tiến độ vượt giới hạn, trả `422 PAGE_OUT_OF_RANGE`; request có thể gửi cả `totalPages` và `currentPage` hợp lệ trong một patch.

### `DELETE /api/shelf/:id`

Đặt `deletedAt` (soft delete) và trả `204`. UI xác nhận rằng gỡ khỏi tủ sẽ giữ tiến độ để khôi phục. Gọi delete với mục không tồn tại/đã gỡ trả `404 SHELF_ITEM_NOT_FOUND`.

## 3. Quy tắc trạng thái đã chốt

| Tình huống | Kết quả |
|---|---|
| Thêm mới `WANT_TO_READ` | `currentPage=0`, `startedAt=null`, `finishedAt=null` |
| Thêm mới `READING` | `currentPage=0` nếu chưa nhập, `startedAt=now` |
| Thêm mới/chuyển sang `READ` với tổng trang đã biết | `currentPage=totalPages`, `finishedAt=now` |
| Chuyển sang `READ` khi chưa biết tổng trang | Cho phép; không có phần trăm; `finishedAt=now` |
| Trang hiện tại đạt tổng trang | Tự chuyển `READ`, đặt ngày hoàn thành |
| Giảm trang sau khi đã hoàn thành | Tự về `READING`, xoá `finishedAt`, giữ `startedAt` |
| Nhảy trang tiến/lùi trong giới hạn | Cho phép cập nhật trực tiếp; không yêu cầu đi từng trang |
| Chuyển `READ` về `READING` | Cho phép nếu trang hiện tại thấp hơn tổng trang; gửi `status` và `currentPage` cùng patch nếu cần giảm trang |
| Chuyển về `WANT_TO_READ` | Bắt đầu lại: reset trang và hai ngày đọc |
| Chuyển `READING` khi trang đang bằng tổng trang | Yêu cầu gửi trang thấp hơn cùng patch, nếu không trả 422 |
| Gỡ rồi thêm lại | Khôi phục mọi tiến độ/trạng thái/điểm/ghi chú cũ; user có thể chọn bắt đầu lại bằng `WANT_TO_READ` |

`totalPages`: `null` hoặc số nguyên dương. `currentPage`: số nguyên không âm và không vượt quá tổng trang. `rating`: `null` hoặc số nguyên 1–5. `note`: tối đa 1000 ký tự. `status=READ` không bắt buộc phải có số trang.

## 4. Format lỗi và status

```json
{
  "error": {
    "code": "PAGE_OUT_OF_RANGE",
    "message": "Trang hiện tại phải nằm từ 0 đến tổng số trang.",
    "details": [{ "field": "currentPage", "message": "Không được lớn hơn totalPages." }],
    "requestId": "req-..."
  }
}
```

| HTTP | Khi nào |
|---|---|
| 400 | Query/body/params sai schema hoặc thiếu từ khoá |
| 404 | Work hoặc mục tủ không tìm thấy |
| 409 | Thêm trùng một sách đang hoạt động |
| 422 | Dữ liệu đúng kiểu nhưng sai quy tắc nghiệp vụ |
| 502 | Open Library phản hồi lỗi/không hợp lệ |
| 503 | Open Library bị rate-limit hoặc tạm không sẵn sàng |
| 504 | Hết timeout gọi Open Library |
| 500 | Lỗi không dự kiến; chỉ log chi tiết ở server |

Các code nghiệp vụ tối thiểu: `VALIDATION_ERROR`, `BOOK_ALREADY_IN_SHELF`, `BOOK_NOT_FOUND`, `SHELF_ITEM_NOT_FOUND`, `PAGE_OUT_OF_RANGE`, `TOTAL_PAGES_REQUIRED`, `INVALID_STATUS_TRANSITION`, `UPSTREAM_UNAVAILABLE`, `UPSTREAM_TIMEOUT`, `INTERNAL_ERROR`.

## 5. Wireframe mức màn hình

### Tìm kiếm

```text
┌ Reading Tracker ─ Tìm sách ─ Tủ sách của tôi ─────────────┐
│ [ Nhập tên sách hoặc tác giả...                  ] [Tìm]   │
│ Kết quả cho “...”                         Trang 1 / N        │
│ [Bìa] Tiêu đề — Tác giả — Năm       [ + Thêm vào tủ ]      │
│ [Bìa] Tiêu đề — Tác giả — Năm       [ Đã thêm ]             │
│ ...                                                         │
│ [← Trước]                                      [Tiếp →]    │
└────────────────────────────────────────────────────────────┘
```

Giữ nguyên bố cục và thay vùng kết quả bằng loading skeleton, thông báo chưa có kết quả hoặc lỗi có nút thử lại.

### Chi tiết sách

```text
┌← Kết quả ──────────────────────────────────────────────────┐
│ [Bìa]  Tên sách                                             │
│        Tác giả · Năm xuất bản                               │
│        Mô tả                                                │
│        Chủ đề: ...                                          │
│        Ấn bản [ chọn edition / số trang ▼ ]                 │
│        Hoặc tổng trang [____]                               │
│        Trạng thái ban đầu [Muốn đọc ▼] [Thêm vào tủ]        │
└────────────────────────────────────────────────────────────┘
```

Không có tổng số trang thì hiện “Chưa có dữ liệu”; cho nhập tay. Bản đầu không có nút “Đọc sách” vì API đề bài không đảm bảo nội dung đọc.

### Tủ sách

```text
┌ Tủ sách của tôi ───────────────────────────────────────────┐
│ Tổng 5       Đang đọc 2       Đã đọc 1                     │
│ [Muốn đọc] [Đang đọc] [Đã đọc]                              │
│ [Bìa] Tên sách — Tác giả         210 / 1178 trang   18%     │
│      [ − ] [210] [ + ]   Trạng thái [Đang đọc ▼]            │
│      Đánh giá ☆☆☆☆☆   Ghi chú [....................]        │
│      [Lưu]                                      [Gỡ khỏi tủ]│
└────────────────────────────────────────────────────────────┘
```

Nếu chưa biết tổng trang thì bỏ thanh phần trăm và cho cập nhật tổng trang. Gỡ sách có modal xác nhận nói tiến độ được giữ để khôi phục. Sách đã gỡ có nút “Khôi phục vào tủ” trong tìm kiếm.

## 6. Khảo sát nhanh reader cho giai đoạn 6

Đã tìm thấy các edition có trạng thái Read/Download Options trên Open Library:

- [Alice’s Adventures in Wonderland, OL27002972M](https://openlibrary.org/books/OL27002972M/Alice%27s_Adventures_in_Wonderland): trang edition hiển thị Read và các định dạng HTML, Plain text, ePub, Kindle (Project Gutenberg).
- [The Adventures of Sherlock Holmes, OL37044510M](https://openlibrary.org/books/OL37044510M/The_Adventures_of_Sherlock_Holmes): trang edition hiển thị Read và các định dạng HTML, ePub, Kindle, Kobo (Standard Ebooks).

Tài liệu chính thức cho biết BookReader có chế độ một/trang đôi và hỗ trợ nhúng iframe; Read API trả link/status đọc/mượn, không phải nội dung text toàn sách. Số lượng edition thực sự đọc được là một tập con không đồng đều của catalog. Đây là bằng chứng để làm spike reader riêng, chưa phải xác nhận đã kiểm thử gọi API qua backend hoặc mọi format/edition ổn định.

Ràng buộc cần giải quyết ở giai đoạn 6: reader nhúng từ archive.org tạo request từ trình duyệt tới dịch vụ ngoài. Điều này xung đột với cách hiểu nghiêm ngặt của yêu cầu backend-only. Nếu vẫn giữ yêu cầu đó, cần kiểm tra khả năng backend phục vụ nội dung; nếu chỉ hỗ trợ redirect/iframe trực tiếp, phải ghi nhận đây là thay đổi phạm vi trước khi triển khai.

## 7. Tiêu chí kết thúc Giai đoạn 0

- [x] API và error contract đã định nghĩa.
- [x] Field/enum và quy tắc trạng thái đã định nghĩa, gồm xoá rồi khôi phục.
- [x] Wireframe mức màn hình đủ để dựng UI giai đoạn 4.
- [x] Có hai edition tham khảo cho spike reader; giới hạn của khảo sát được ghi lại.
- [ ] Chủ dự án review và chốt các giả định trước khi sang Giai đoạn 1.

## Nguồn tham khảo

- Open Library Search API: https://openlibrary.org/dev/docs/api/search
- Open Library Read API: https://openlibrary.org/dev/docs/api/read
- Internet Archive BookReader: https://openlibrary.org/dev/docs/bookreader
- Open Library Reading Books FAQ: https://openlibrary.org/help/faq/reading
