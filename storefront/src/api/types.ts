import type { components } from './schema'

/** Kiểu lấy từ OpenAPI của backend (npm run gen:api). Không viết tay lại. */
type S = components['schemas']
// .NET OpenAPI đánh dấu schema tham chiếu là nullable; DTO gốc luôn có giá trị nên bỏ null ở đây.
export type Dto<K extends keyof S> = NonNullable<S[K]>

export type SiteConfig = Dto<'SiteConfigDto'>
export type MediaRef = Dto<'MediaRefDto'>
export type ProductCard = Dto<'ProductCardDto'>
export type PublicProduct = Dto<'PublicProductDto'>
export type Cart = Dto<'CartDto'>
export type Order = Dto<'OrderDto'>
export type CurrentUser = Dto<'CurrentUserDto'>
export type PublicReview = Dto<'PublicReviewDto'>
export type RatingSummary = Dto<'RatingSummaryDto'>
export type MyReview = Dto<'MyReviewDto'>
export type PublicPostCard = Dto<'PublicPostCardDto'>
export type PublicPost = Dto<'PublicPostDto'>
