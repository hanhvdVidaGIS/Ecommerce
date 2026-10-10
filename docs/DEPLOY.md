# Triển khai production

Một máy chủ chạy Docker Compose: PostgreSQL + API (.NET) + Storefront (Next.js) + Admin (nginx tĩnh) + cổng nginx. Một tên miền duy nhất phục vụ cả ba ứng dụng (`/` Storefront, `/admin/` Admin, `/api` + `/uploads` API), nên cookie HttpOnly và CSRF hoạt động cùng nguồn gốc, không cần CORS.

## 1. Yêu cầu
- Docker Engine 24+ và Docker Compose v2; 2 vCPU, 2 GB RAM trở lên.
- Một tên miền trỏ về máy chủ và **HTTPS**. Cookie đăng nhập ở Production có cờ `Secure`: không có HTTPS thì không đăng nhập được.

## 2. Cấu hình
```bash
cp .env.example .env
```
Điền các biến sau trong `.env` (không commit tệp này):

| Biến | Ý nghĩa |
|---|---|
| `POSTGRES_PASSWORD` | Mật khẩu DB (mạnh, ngẫu nhiên) |
| `JWT_KEY` | Khoá ký token, ≥ 32 ký tự ngẫu nhiên (`openssl rand -base64 48`) |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Super Admin đầu tiên (chỉ tạo khi chưa có); mật khẩu ≥ 8 ký tự, có chữ và số |
| `SITE_URL` | Địa chỉ công khai, ví dụ `https://shop.example.com` (canonical, sitemap, Open Graph) |
| `REVALIDATE_SECRET` | Bí mật để API báo Storefront làm mới đệm (`openssl rand -hex 32`) |
| `Seed__Demo` | `true` để nạp dữ liệu mẫu nước hoa (chỉ demo); mặc định `false` |
| `HTTP_PORT` | Cổng nginx mở ra ngoài (mặc định 80) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS`, `SMTP_FROM_NAME`, `SMTP_SECURITY` | Gửi email thật; bỏ trống `SMTP_HOST` thì chỉ ghi nhật ký |

## 3. Chạy
```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml ps          # api phải ở trạng thái healthy
```
Lần chạy đầu API tự áp dụng migration (`Database__AutoMigrate=true`) và tạo Super Admin. Nếu chạy nhiều bản sao API, đặt `Database__AutoMigrate=false` và migrate một lần bằng bản sao đầu tiên trước khi mở rộng.

Kiểm tra: `curl -i http://localhost/health` → 200; mở `/` (cửa hàng) và `/admin/` (đăng nhập bằng Super Admin).

## 4. HTTPS
Chọn một cách:
- **Bộ cân bằng tải / Cloudflare / Caddy / Traefik phía trước**: kết thúc TLS ở đó, chuyển tiếp HTTP tới cổng `HTTP_PORT` và gửi `X-Forwarded-Proto: https` (nginx giữ nguyên tiêu đề này).
- **Certbot trên máy chủ**: cấp chứng chỉ và thêm khối `server { listen 443 ssl; ... }` vào `deploy/nginx.conf` với cùng các `location`.

Sau khi bật HTTPS, đặt `SITE_URL` đúng địa chỉ `https://...` rồi `up -d` lại Storefront.

## 5. Sau khi triển khai (một lần)
1. Đăng nhập Admin, đổi mật khẩu Super Admin.
2. **Website Settings**: tên, logo, màu, font, liên hệ, mạng xã hội. **Store Configuration**: Business Type, tiền tệ, phương thức thanh toán, **tài khoản ngân hàng nhận chuyển khoản**.
3. **Vận chuyển**: tạo ít nhất một mức phí mặc định (không có mức nào thì phí vận chuyển bằng 0).
4. Kiểm tra `https://<tên miền>/sitemap.xml` và `/robots.txt`; gửi sitemap lên Google Search Console.

## 6. Sao lưu và khôi phục
- Cơ sở dữ liệu: `docker compose -f docker-compose.prod.yml exec -T db pg_dump -U ccp -Fc ccp > backup-$(date +%F).dump` (lịch cron hằng ngày, giữ bản sao ngoài máy chủ).
- Tệp tải lên: volume `ccp-prod_uploads` (đường dẫn `/data/uploads` trong container API). Sao lưu cùng thời điểm với DB.
- Khôi phục thử định kỳ: `pg_restore -U ccp -d ccp --clean --if-exists < backup.dump` trên một DB tạm.

## 7. Cập nhật phiên bản
```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```
Sao lưu DB trước khi cập nhật bản có migration mới. Migration chỉ thêm tiến (không có migration lùi tự động); để quay về bản cũ hãy khôi phục bản sao lưu.

## 8. Một website mỗi cơ sở dữ liệu
Mỗi website là một bộ triển khai riêng (một `.env`, một DB, một thư mục uploads). Triển khai website thứ hai: sao chép thư mục dự án (hoặc dùng `-p <tên-dự-án>` và `HTTP_PORT` khác), đặt `POSTGRES_DB`/mật khẩu/`JWT_KEY`/`SITE_URL` riêng. Đổi ngành hàng (nước hoa → quần áo...) là thao tác cấu hình trong Admin (Business Type), không cần triển khai lại.

## 9. Danh sách kiểm tra bảo mật
- [ ] HTTPS bật, `SITE_URL` là `https://`.
- [ ] `.env` không nằm trong git; `JWT_KEY` và `POSTGRES_PASSWORD` là chuỗi ngẫu nhiên dài.
- [ ] Cổng 5432 (DB) và 8080 (API) **không** mở ra ngoài (chỉ nginx publish cổng 80/443; compose đã làm vậy).
- [ ] Đổi mật khẩu Super Admin mặc định; tạo tài khoản Admin/Manager/Staff theo nhu cầu, không dùng chung tài khoản.
- [ ] Tường lửa chỉ cho 80/443 (và SSH từ IP tin cậy).
- [ ] Sao lưu DB tự động và đã thử khôi phục.
- [ ] `Seed__Demo=false` ở website thật.

## 10. Lưu ý và giới hạn hiện tại
- Kho tệp mặc định là **Local** (volume Docker). Lớp trừu tượng `IStorageService` cho phép thêm S3/R2/Azure Blob bằng một lớp triển khai mới; **chưa có** triển khai S3/Azure trong phiên bản này.
- Cổng thanh toán trực tuyến (VNPay, MoMo, ZaloPay, Stripe) chưa tích hợp; luồng thanh toán dùng COD và chuyển khoản. Giao diện cổng (`IPaymentGateway`) đã sẵn để thêm.
- Email (quên mật khẩu, xác nhận đơn) gửi qua SMTP khi đặt `SMTP_HOST` và `SMTP_FROM_ADDRESS` (xem `.env.example`); nếu để trống, hệ thống chỉ ghi nội dung email vào nhật ký. Dùng nhà cung cấp có SPF/DKIM cho tên miền gửi để thư không vào mục spam.
