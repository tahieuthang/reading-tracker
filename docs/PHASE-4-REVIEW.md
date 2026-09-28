# Review Giai đoạn 4 — Giao diện ba màn hình

## Phạm vi đã hoàn thành

- Thay màn hình khởi tạo bằng ứng dụng Vue Router có điều hướng Khám phá / Tủ sách.
- Màn tìm sách: tìm theo tên hoặc tác giả, phân trang theo 20 kết quả, bìa sách qua API backend, badge đã thêm/khôi phục, và trạng thái loading/rỗng/lỗi.
- Màn chi tiết: thông tin tác phẩm, mô tả, chủ đề, năm xuất bản; chọn trạng thái đầu, ấn bản có số trang hoặc nhập tổng trang thủ công.
- Thêm nhanh từ kết quả tìm kiếm tự lấy chi tiết và chọn ấn bản đầu tiên có số trang; nếu Open Library không cung cấp số trang thì giao diện báo rõ và cho nhập trong tủ sách. Màn chi tiết vẫn cho chọn ấn bản chính xác.
- Màn tủ sách: ba tab trạng thái, thống kê, tiến độ trang, cập nhật trạng thái/trang/tổng trang/điểm/ghi chú và xác nhận xóa.
- Dùng TanStack Vue Query để tải dữ liệu và invalidate danh sách, thống kê, badge sau khi thêm/cập nhật/xóa.
- Frontend chỉ gọi các route cùng origin `/api`; Vite proxy có thể đổi backend đích qua `VITE_API_PROXY_TARGET`.
- Bố cục responsive, có placeholder khi thiếu bìa và hỗ trợ `prefers-reduced-motion`.

## Xác minh

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`: đạt; backend có 10/10 unit test quy tắc tiến độ.
- Kiểm thử thủ công trên trình duyệt qua API local và MySQL: tìm “The Hobbit” → mở chi tiết → thêm ở trạng thái `READING` → cập nhật trang đến 306/306 → tự chuyển `READ` và hiển thị 100% → xóa có xác nhận.
- Kiểm thử thêm nhanh trực tiếp từ kết quả tìm kiếm: hệ thống chọn ấn bản đầu tiên có số trang và hiển thị 306 trang trong tủ.
- Trong smoke test, đã xác nhận rating/ghi chú và ngày hoàn thành được lưu. Bản ghi test đã được xóa khỏi MySQL sau kiểm tra.
- Không có Playwright/Cypress harness trong repo; luồng end-to-end ở trên được kiểm tra thủ công trên UI.

Các mục đã có trong tủ nhưng đang để trống `totalPages` không được tự động cập nhật; người dùng có thể nhập tổng số trang ở phần chỉnh sửa của mục sách.

## Chưa thuộc Giai đoạn 4

Chưa có trình đọc nội dung sách. Chưa đóng gói hoặc triển khai VPS; các việc này thuộc Giai đoạn 5.
