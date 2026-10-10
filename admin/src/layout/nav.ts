import { P, type PermissionCode } from '@/api/catalog.generated'

export interface NavItem {
  to: string
  /** Khoá nhãn: nhãn nghiệp vụ lấy từ cấu hình (product/category/brand) hoặc chuỗi cố định. */
  label: string | 'label:product' | 'label:category' | 'label:brand'
  permission?: PermissionCode
  icon: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

/** Điều hướng của Admin. Mục chỉ hiện khi người dùng có quyền tương ứng; backend vẫn là nơi kiểm tra quyền thật sự. */
export const NAV: NavGroup[] = [
  { title: '', items: [{ to: '/', label: 'Tổng quan', icon: 'layout-dashboard' }] },
  {
    title: 'Cửa hàng',
    items: [
      { to: '/products', label: 'label:product', permission: P.ProductView, icon: 'package' },
      { to: '/categories', label: 'label:category', permission: P.CategoryView, icon: 'folder-tree' },
      { to: '/brands', label: 'label:brand', permission: P.BrandView, icon: 'tag' },
      { to: '/attributes', label: 'Thuộc tính', permission: P.AttributeView, icon: 'sliders' },
      { to: '/media', label: 'Thư viện ảnh', permission: P.MediaView, icon: 'image' },
    ],
  },
  {
    title: 'Bán hàng',
    items: [
      { to: '/orders', label: 'Đơn hàng', permission: P.OrderView, icon: 'shopping-cart' },
      { to: '/customers', label: 'Khách hàng', permission: P.CustomerView, icon: 'user-round' },
      { to: '/reviews', label: 'Đánh giá', permission: P.ReviewModerate, icon: 'star' },
      { to: '/coupons', label: 'Mã giảm giá', permission: P.CouponManage, icon: 'ticket' },
      { to: '/shipping', label: 'Vận chuyển', permission: P.StoreConfigUpdate, icon: 'truck' },
    ],
  },
  {
    title: 'Giao diện',
    items: [
      { to: '/banners', label: 'Banner', permission: P.BannerManage, icon: 'gallery' },
      { to: '/homepage', label: 'Trang chủ', permission: P.HomepageSectionManage, icon: 'layout' },
      { to: '/menus', label: 'Menu', permission: P.MenuManage, icon: 'menu' },
      { to: '/pages', label: 'Trang nội dung', permission: P.PageManage, icon: 'file' },
      { to: '/posts', label: 'Bài viết', permission: P.PostManage, icon: 'newspaper' },
    ],
  },
  {
    title: 'Cấu hình',
    items: [
      { to: '/settings/website', label: 'Website Settings', permission: P.WebsiteConfigView, icon: 'globe' },
      { to: '/settings/store', label: 'Store Configuration', permission: P.WebsiteConfigView, icon: 'store' },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { to: '/users', label: 'Người dùng', permission: P.UserManage, icon: 'users' },
      { to: '/roles', label: 'Vai trò & quyền', permission: P.RoleManage, icon: 'shield' },
      { to: '/audit-logs', label: 'Nhật ký thao tác', permission: P.UserManage, icon: 'history' },
    ],
  },
]
