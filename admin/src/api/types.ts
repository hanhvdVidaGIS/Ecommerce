import type { components } from './schema'

/**
 * Kiểu dữ liệu lấy từ OpenAPI của backend (npm run gen:api). Không viết tay lại các kiểu này:
 * thêm trường ở backend rồi sinh lại thì mọi chỗ dùng sai sẽ báo lỗi biên dịch.
 */
type S = components['schemas']
// .NET OpenAPI đánh dấu schema tham chiếu là nullable; DTO gốc luôn có giá trị nên bỏ null ở đây.
export type Dto<K extends keyof S> = NonNullable<S[K]>

export type CurrentUser = Dto<'CurrentUserDto'>
export type Meta = Dto<'MetaDto'>
export type SiteConfig = Dto<'SiteConfigDto'>
export type MediaRef = Dto<'MediaRefDto'>

/** Gỡ các thuộc tính bắt buộc-nhưng-nullable thành tuỳ chọn để dựng giá trị mặc định cho form. */
export type Draft<T> = { [K in keyof T]?: T[K] }
