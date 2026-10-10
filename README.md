# Nền tảng CCP – Thương mại điện tử cấu hình được

Nền tảng Thương mại điện tử Cấu hình được (Configurable Commerce Platform, gọi tắt là **CCP**). Một mã nguồn phục vụ nhiều ngành hàng (nước hoa, quần áo, giày dép…): tên website, logo, màu, danh mục, thuộc tính sản phẩm, bố cục trang chủ và nhãn hiển thị đều là dữ liệu cấu hình trong cơ sở dữ liệu, không nằm trong mã nguồn.

Thiết kế đầy đủ: [docs/CCP_Thiet_ke_he_thong_GD0.docx](docs/CCP_Thiet_ke_he_thong_GD0.docx).

## Trạng thái

| Giai đoạn | Nội dung | Trạng thái |
|---|---|---|
| 0 | Thiết kế, bộ khung backend, docker-compose | Hoàn thành |
| 1 | Domain + migration, xác thực/RBAC, cấu hình website và Business Type, danh mục/thương hiệu/thuộc tính/sản phẩm/biến thể, media, banner, section trang chủ, menu, trang nội dung, người dùng/vai trò/nhật ký, dữ liệu mẫu nước hoa, Admin | Hoàn thành |
| 2 | Storefront (trang chủ theo cấu hình, danh mục/bộ lọc/tìm kiếm, chi tiết sản phẩm và biến thể), giỏ hàng, mã giảm giá, vận chuyển, thanh toán COD/chuyển khoản, tra cứu đơn, tài khoản (địa chỉ, yêu thích, đơn hàng), quản trị đơn hàng/khách hàng/mã giảm giá/vận chuyển | Hoàn thành |
| 3 | Dashboard, đánh giá, blog, newsletter, SEO (sitemap, robots, JSON-LD), gửi email SMTP, Docker và hướng dẫn production | Hoàn thành (xem "Chưa có" bên dưới) |

## Cấu trúc

```
backend/            ASP.NET Core 9 (Clean Architecture)
  src/Ccp.Domain          thực thể, enum, quy tắc nghiệp vụ, quyền và vai trò mặc định
  src/Ccp.Application     service, DTO, validator; truy cập dữ liệu qua IAppDbContext
  src/Ccp.Infrastructure  EF Core + migration, lưu trữ tệp, băm mật khẩu, token, seed
  src/Ccp.Api             controller, middleware (lỗi, CSRF, giới hạn tần suất), DI
  tests/Ccp.Tests         kiểm thử đơn vị + tích hợp (PostgreSQL thật qua Testcontainers)
admin/              React + Vite + TypeScript (trang quản trị), xem admin/README.md
storefront/         Next.js 16 (cửa hàng, App Router)
deploy/             nginx (cổng vào duy nhất cho production)
docs/               tài liệu thiết kế, catalog.json (danh mục dùng chung), slug-vectors.json
docker-compose.yml       PostgreSQL cho môi trường phát triển
docker-compose.prod.yml  DB + API + Storefront + Admin + nginx cho production (xem docs/DEPLOY.md)
```

## Yêu cầu

- .NET SDK 9
- Docker (PostgreSQL; kiểm thử tích hợp dùng Testcontainers)
- Node.js 22

## Chạy local

1. Tạo tệp môi trường (không commit):

   ```bash
   cp .env.example .env
   ```

   Điền các giá trị trong `.env`: `POSTGRES_PASSWORD`, `JWT_KEY` (≥ 32 ký tự ngẫu nhiên, ví dụ `openssl rand -base64 48`), `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD` (Super Admin đầu tiên; mật khẩu ≥ 8 ký tự có chữ và số). Đặt `Seed__Demo=true` để nạp dữ liệu mẫu nước hoa. Cổng PostgreSQL mặc định là `5433` để không đụng PostgreSQL cục bộ ở cổng 5432.

2. Khởi động cơ sở dữ liệu:

   ```bash
   docker compose up -d --wait
   ```

3. Chạy backend (tự migrate và nạp dữ liệu hệ thống, cùng dữ liệu mẫu nếu bật; chỉ ở môi trường Development):

   ```bash
   ASPNETCORE_ENVIRONMENT=Development dotnet run --project backend/src/Ccp.Api --urls http://localhost:5099
   ```

   Kiểm tra: `curl http://localhost:5099/health`. Tài liệu OpenAPI: `http://localhost:5099/openapi/v1.json`.

4. Chạy Admin:

   ```bash
   cd admin && npm install && npm run dev
   ```

   Mở `http://localhost:5173/admin/` và đăng nhập bằng tài khoản Super Admin ở bước 1.

5. Chạy Storefront (cửa hàng):

   ```bash
   cd storefront && npm install && npm run dev
   ```

   Mở `http://localhost:3000`. Storefront chuyển tiếp `/api` và `/uploads` tới API (`API_URL`, mặc định `http://localhost:5099`) nên cookie đăng nhập và giỏ hàng cùng nguồn gốc với trình duyệt. Dùng `localhost` (không dùng `127.0.0.1`) khi chạy dev.

## Kiểm tra

```bash
dotnet test backend/Ccp.sln          # cần Docker; đặt TESTCONTAINERS_RYUK_DISABLED=true nếu không tải được image Ryuk
cd admin && npm run typecheck && npm test && npm run build
cd storefront && npm run typecheck && npm test && NEXT_DIST_DIR=.next-build npx next build
```

Sau khi đổi API ở backend, sinh lại kiểu (cần API đang chạy): `cd admin && npm run gen` và `cd storefront && npm run gen:api`.

## Ghi chú vận hành

- Quyền của người dùng nằm trong access token (15 phút); đổi vai trò hoặc khoá tài khoản sẽ thu hồi refresh token nên người đó phải đăng nhập lại.
- Nguồn gốc duy nhất của danh mục thực thể, enum, quyền và vai trò mặc định ở giai đoạn thiết kế là `docs/catalog.json`; bộ kiểm thử đối chiếu tệp này với mã nguồn.
- Cấu hình bí mật chỉ đọc từ biến môi trường. `.env` đã nằm trong `.gitignore`.

## Triển khai production

Xem [docs/DEPLOY.md](docs/DEPLOY.md): Docker Compose (DB, API, Storefront, Admin, nginx cùng một tên miền), biến môi trường, HTTPS, sao lưu, cập nhật và danh sách kiểm tra bảo mật. Nguyên tắc: mọi bí mật đọc từ biến môi trường; `Database:AutoMigrate` mặc định tắt ở Production (compose bật cho lần chạy đầu); `SEED_ADMIN_*` bắt buộc khi chưa có Super Admin.

## Chưa có (ghi nhận để không hiểu nhầm)

- Flash Sale: các bảng đã có trong cơ sở dữ liệu nhưng chưa có giao diện quản trị và chưa áp giá; section "Flash Sale" ở trang chủ chưa hiển thị.
- Cổng thanh toán trực tuyến (VNPay, MoMo, ZaloPay, Stripe): chỉ có COD và chuyển khoản; giao diện `IPaymentGateway` sẵn để thêm.
- Lưu trữ tệp S3/R2/Azure Blob: chỉ có kho Local; giao diện `IStorageService` sẵn để thêm.
- Khách chưa tự sửa họ tên/SĐT trong trang tài khoản (chỉ đổi mật khẩu và quản lý địa chỉ).
