# Review Giai đoạn 1 — Nền tảng và dữ liệu

## Phạm vi đã hoàn thành

- Monorepo npm workspaces cho `apps/web` (Vue 3, TypeScript, Vite, Tailwind CSS) và `apps/api` (Node.js, TypeScript, Express 5).
- ESLint và Prettier với script dùng chung ở root.
- API có `pino`/`pino-http`, Zod validation middleware, error middleware thống nhất và request ID.
- Prisma 7 schema cho `shelf_books`, migration MySQL đầu tiên, Prisma Client và Docker Compose MySQL có health check, volume bền vững.
- `GET /api/health` kiểm tra kết nối database.
- Frontend hiện là shell khởi động; các trang và luồng nghiệp vụ thuộc các giai đoạn sau.

## Đã xác minh

| Kiểm tra | Kết quả |
| --- | --- |
| `npm run lint` | Đạt |
| `npm run format:check` | Đạt |
| `npm run typecheck` | Đạt cho API và frontend |
| `npm run build` | Đạt cho API và frontend |
| `npm run db:migrate:deploy` | Migration áp dụng thành công; không còn migration chờ |
| `GET /api/health` | `200`, API và MySQL đều `ok` |
| JSON request sai cú pháp | `400 INVALID_JSON`, đúng error envelope |
| Route không tồn tại | `404 RESOURCE_NOT_FOUND`, đúng error envelope |

## Lệnh chạy local

```powershell
npm install
npm run db:up
npm run db:generate
npm run db:migrate:deploy
npm run dev
```

Sao chép `.env.example` thành `.env` ở root và `apps/api/.env.example` thành `apps/api/.env` trước khi chạy. Nếu cổng MySQL `3306` đã được dùng, đổi `MYSQL_PORT` trong `.env` và cổng tương ứng trong `DATABASE_URL` của `apps/api/.env`.

`npm run db:migrate -- --name <migration-name>` dành cho lúc phát triển migration mới; Prisma Migrate Dev cần quyền tạo shadow database. Lệnh setup thông thường dùng `db:migrate:deploy`.

## Chưa thuộc Giai đoạn 1

Chưa có adapter Open Library, endpoint tìm kiếm/chi tiết sách, CRUD tủ sách hoặc UI nghiệp vụ. Các phần này bắt đầu ở Giai đoạn 2 trở đi; chưa chuyển sang thực hiện.

## Ghi chú dependency

Npm báo 6 advisory khi cài dependency (1 moderate, 5 high). Chưa chạy `npm audit fix` vì có thể thay đổi phiên bản ngoài phạm vi scaffold; cần review riêng trước khi deploy.
