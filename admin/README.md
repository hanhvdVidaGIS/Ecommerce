# Admin – Nền tảng CCP

Ứng dụng quản trị (React + Vite + TypeScript + Tailwind v4). Chạy dưới `/admin/`, gọi Backend API cùng nguồn gốc nhờ proxy của Vite (`/api`, `/uploads`).

```bash
npm install
npm run dev          # http://localhost:5173/admin/   (cần Backend API chạy ở :5099)
npm run typecheck
npm test
npm run gen          # sinh lại kiểu từ OpenAPI và mã quyền từ docs/catalog.json (cần API đang chạy)
```

## Nguyên tắc (bắt buộc với mọi module)

1. **Không gắn cứng nội dung có thể đổi giữa các website.** Không viết chữ "Nước hoa", tên website, logo, màu thương hiệu, tên danh mục/thuộc tính vào mã. Nhãn nghiệp vụ lấy từ `useLabels()` (`product`, `category`, `brand`, `currency`, `timezone`, `siteName`). Màu chủ đạo/font đã được áp tự động (`SiteTheme`); dùng token màu của Tailwind (`bg-accent`, `text-muted`, `border-border`...), không dùng mã hex.
2. **Kiểu dữ liệu lấy từ OpenAPI**: `import type { Dto } from '@/api/types'` rồi `Dto<'ProductDetailDto'>`. Không viết tay lại kiểu của backend. Sau khi backend đổi, chạy `npm run gen`.
3. **Mã quyền** lấy từ `P` (`@/api/catalog.generated`, sinh từ `docs/catalog.json`). Ẩn/hiện nút bằng `<Can permission={P.X}>` hoặc `useAuth().can(P.X)`. Đây chỉ là gợi ý giao diện; backend luôn kiểm tra lại.
4. **Danh mục enum/nhãn trạng thái** (trạng thái sản phẩm, loại section, kiểu thuộc tính...) lấy từ `useMeta()` / `useEnumLabel('ProductStatus')`, không tự khai báo lại danh sách.
5. **Gọi API** qua `api` (`@/api/client`): đã xử lý cookie phiên, CSRF, làm mới phiên khi 401, bóc khung `{success,data,meta,error}`. Lỗi là `ApiError` (`code`, `message`, `details[{field,message}]`).
6. **Form**: `react-hook-form` + `zod`; lỗi theo trường từ backend gắn bằng `applyApiError(form, error)` (`@/lib/forms`); lỗi chung dùng `toastError`. Mẫu hoàn chỉnh: `src/features/brands/` (`api.ts` hook truy vấn/mutation, `BrandsPage.tsx` danh sách, `BrandFormModal.tsx` form).
7. **Mỗi màn hình dữ liệu có đủ 4 trạng thái**: đang tải (`Skeleton`), trống (`EmptyState`), lỗi (`ErrorState` + nút thử lại), thành công (toast). Thao tác không hoàn tác được phải qua `useConfirm()`.
8. **Responsive, ưu tiên điện thoại**: kiểm tra ở 375px, 768px, 1280px. Bảng dùng `DataTable` (cuộn ngang, ẩn cột phụ bằng `hideOnMobile`). Hộp thoại dùng `Modal`.
9. **Truy cập được**: mọi ô nhập có nhãn (`FormField` + `htmlFor`), nút biểu tượng có `aria-label`, điều khiển bằng bàn phím được.
10. **Dữ liệu danh sách** gọi `api.getPage` để lấy `meta` phân trang; `sort` gửi dạng `<trường>:asc|desc` chỉ với trường nằm trong danh sách cho phép của backend (xem `Sorts` trong service tương ứng).

## Cấu trúc

```
src/
  api/          client.ts (fetch), hooks.ts (site-config, meta, labels), types.ts, schema.d.ts (SINH), catalog.generated.ts (SINH)
  auth/         AuthProvider, guards (RequireAuth, RequirePermission, Can)
  components/   ui/ (primitives, overlays, data), media/ (MediaPicker, ImageField), editor/ (RichTextEditor)
  features/     <module>/  api.ts + các trang
  layout/       AdminLayout, nav, SiteTheme
  lib/          utils (cn, slugify), format (tiền, ngày), forms, theme, useDebounce
```

Tệp có chữ "SINH" được tạo tự động; không sửa tay.
