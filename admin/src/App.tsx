import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { P } from '@/api/catalog.generated'
import { FullPageSpinner, RequireAuth, RequirePermission } from '@/auth/guards'
import AdminLayout from '@/layout/AdminLayout'
import { SiteTheme } from '@/layout/SiteTheme'
import { ForbiddenPage, NotFoundPage } from '@/features/NotFoundPage'
import LoginPage from '@/features/auth/LoginPage'
import DashboardPage from '@/features/dashboard/DashboardPage'

// Mỗi module tải theo nhu cầu để giữ gói khởi động nhỏ.
const ProductsPage = lazy(() => import('@/features/products/ProductsPage'))
const ProductEditorPage = lazy(() => import('@/features/products/ProductEditorPage'))
const CategoriesPage = lazy(() => import('@/features/categories/CategoriesPage'))
const BrandsPage = lazy(() => import('@/features/brands/BrandsPage'))
const AttributesPage = lazy(() => import('@/features/attributes/AttributesPage'))
const AttributeEditorPage = lazy(() => import('@/features/attributes/AttributeEditorPage'))
const MediaLibraryPage = lazy(() => import('@/features/media/MediaLibraryPage'))
const BannersPage = lazy(() => import('@/features/banners/BannersPage'))
const HomepageSectionsPage = lazy(() => import('@/features/homepage/HomepageSectionsPage'))
const MenusPage = lazy(() => import('@/features/menus/MenusPage'))
const PagesPage = lazy(() => import('@/features/pages/PagesPage'))
const PageEditorPage = lazy(() => import('@/features/pages/PageEditorPage'))
const WebsiteSettingsPage = lazy(() => import('@/features/settings/WebsiteSettingsPage'))
const StoreSettingsPage = lazy(() => import('@/features/settings/StoreSettingsPage'))
const UsersPage = lazy(() => import('@/features/users/UsersPage'))
const RolesPage = lazy(() => import('@/features/roles/RolesPage'))
const AuditLogsPage = lazy(() => import('@/features/audit/AuditLogsPage'))
const CouponsPage = lazy(() => import('@/features/coupons/CouponsPage'))
const ShippingPage = lazy(() => import('@/features/shipping/ShippingPage'))
const OrdersPage = lazy(() => import('@/features/orders/OrdersPage'))
const OrderDetailPage = lazy(() => import('@/features/orders/OrderDetailPage'))
const ReviewsPage = lazy(() => import('@/features/reviews/ReviewsPage'))
const PostsPage = lazy(() => import('@/features/posts/PostsPage'))
const PostEditorPage = lazy(() => import('@/features/posts/PostEditorPage'))
const CustomersPage = lazy(() => import('@/features/customers/CustomersPage'))
const CustomerDetailPage = lazy(() => import('@/features/customers/CustomerDetailPage'))

const guard = (permission: Parameters<typeof RequirePermission>[0]['permission'], element: React.ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
)

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <SiteTheme />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="products" element={guard(P.ProductView, <ProductsPage />)} />
            <Route path="products/new" element={guard(P.ProductCreate, <ProductEditorPage />)} />
            <Route path="products/:id" element={guard(P.ProductView, <ProductEditorPage />)} />
            <Route path="categories" element={guard(P.CategoryView, <CategoriesPage />)} />
            <Route path="brands" element={guard(P.BrandView, <BrandsPage />)} />
            <Route path="attributes" element={guard(P.AttributeView, <AttributesPage />)} />
            <Route path="attributes/:id" element={guard(P.AttributeView, <AttributeEditorPage />)} />
            <Route path="media" element={guard(P.MediaView, <MediaLibraryPage />)} />
            <Route path="orders" element={guard(P.OrderView, <OrdersPage />)} />
            <Route path="orders/:id" element={guard(P.OrderView, <OrderDetailPage />)} />
            <Route path="customers" element={guard(P.CustomerView, <CustomersPage />)} />
            <Route path="customers/:id" element={guard(P.CustomerView, <CustomerDetailPage />)} />
            <Route path="reviews" element={guard(P.ReviewModerate, <ReviewsPage />)} />
            <Route path="coupons" element={guard(P.CouponManage, <CouponsPage />)} />
            <Route path="shipping" element={guard(P.StoreConfigUpdate, <ShippingPage />)} />
            <Route path="banners" element={guard(P.BannerManage, <BannersPage />)} />
            <Route path="homepage" element={guard(P.HomepageSectionManage, <HomepageSectionsPage />)} />
            <Route path="menus" element={guard(P.MenuManage, <MenusPage />)} />
            <Route path="pages" element={guard(P.PageManage, <PagesPage />)} />
            <Route path="pages/new" element={guard(P.PageManage, <PageEditorPage />)} />
            <Route path="pages/:id" element={guard(P.PageManage, <PageEditorPage />)} />
            <Route path="posts" element={guard(P.PostManage, <PostsPage />)} />
            <Route path="posts/new" element={guard(P.PostManage, <PostEditorPage />)} />
            <Route path="posts/:id" element={guard(P.PostManage, <PostEditorPage />)} />
            <Route path="settings/website" element={guard(P.WebsiteConfigView, <WebsiteSettingsPage />)} />
            <Route path="settings/store" element={guard(P.WebsiteConfigView, <StoreSettingsPage />)} />
            <Route path="users" element={guard(P.UserManage, <UsersPage />)} />
            <Route path="roles" element={guard(P.RoleManage, <RolesPage />)} />
            <Route path="audit-logs" element={guard(P.UserManage, <AuditLogsPage />)} />
            <Route path="forbidden" element={<ForbiddenPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  )
}
