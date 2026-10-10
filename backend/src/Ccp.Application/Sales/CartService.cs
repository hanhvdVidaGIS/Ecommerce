using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Sales;

public class CartService(IAppDbContext db, MediaResolver media, ShippingService shipping, CouponEvaluator coupons, TimeProvider clock)
{
    public const int MaxLineQuantity = 99;
    public const int MaxLines = 50;
    private static readonly TimeSpan CartLifetime = TimeSpan.FromDays(30);

    // ---------- đọc ----------
    public async Task<CartDto> GetAsync(CartOwner owner, string? provinceCode, CancellationToken ct = default)
    {
        var cart = owner.IsEmpty ? null : await FindAsync(owner, track: false, ct);
        return await BuildAsync(cart, owner.UserId, null, provinceCode, ct);
    }

    // ---------- ghi ----------
    public async Task<CartDto> AddItemAsync(CartOwner owner, AddCartItemRequest req, string? provinceCode, CancellationToken ct = default)
    {
        var variant = await LoadPurchasableVariantAsync(req.VariantId, ct) ?? throw AppException.NotFound("sản phẩm");
        var cart = await FindOrCreateAsync(owner, ct);
        var line = cart.Items.SingleOrDefault(i => i.VariantId == req.VariantId);
        var wanted = (line?.Quantity ?? 0) + req.Quantity;
        if (line is null && cart.Items.Count >= MaxLines) throw AppException.Validation($"Giỏ hàng tối đa {MaxLines} mặt hàng.");
        EnsureStock(variant, wanted);

        if (line is null) db.CartItems.Add(new CartItem { CartId = cart.Id, VariantId = variant.Id, Quantity = wanted }); // Add tường minh: khoá Guid đặt sẵn nên thêm qua navigation sẽ bị coi là bản ghi đã có
        else line.Quantity = wanted;
        Touch(cart);
        await db.SaveChangesAsync(ct);
        return await BuildAsync(cart, owner.UserId, null, provinceCode, ct);
    }

    public async Task<CartDto> UpdateItemAsync(CartOwner owner, Guid itemId, UpdateCartItemRequest req, string? provinceCode, CancellationToken ct = default)
    {
        var cart = await FindAsync(owner, track: true, ct) ?? throw AppException.NotFound("giỏ hàng");
        var line = cart.Items.SingleOrDefault(i => i.Id == itemId) ?? throw AppException.NotFound("mặt hàng trong giỏ");
        var variant = await LoadPurchasableVariantAsync(line.VariantId, ct) ?? throw AppException.Conflict("Sản phẩm này không còn được bán. Hãy xoá khỏi giỏ hàng.", "unavailable");
        EnsureStock(variant, req.Quantity);
        line.Quantity = req.Quantity;
        Touch(cart);
        await db.SaveChangesAsync(ct);
        return await BuildAsync(cart, owner.UserId, null, provinceCode, ct);
    }

    public async Task<CartDto> RemoveItemAsync(CartOwner owner, Guid itemId, string? provinceCode, CancellationToken ct = default)
    {
        var cart = await FindAsync(owner, track: true, ct) ?? throw AppException.NotFound("giỏ hàng");
        var line = cart.Items.SingleOrDefault(i => i.Id == itemId) ?? throw AppException.NotFound("mặt hàng trong giỏ");
        cart.Items.Remove(line);
        db.CartItems.Remove(line);
        Touch(cart);
        await db.SaveChangesAsync(ct);
        return await BuildAsync(cart, owner.UserId, null, provinceCode, ct);
    }

    public async Task ClearAsync(CartOwner owner, CancellationToken ct = default)
    {
        var cart = await FindAsync(owner, track: true, ct);
        if (cart is null) return;
        db.CartItems.RemoveRange(cart.Items);
        cart.Items.Clear();
        cart.CouponCode = null;
        await db.SaveChangesAsync(ct);
    }

    public async Task<CartDto> ApplyCouponAsync(CartOwner owner, ApplyCouponRequest req, string? provinceCode, CancellationToken ct = default)
    {
        var cart = await FindAsync(owner, track: true, ct) ?? throw AppException.Validation("Giỏ hàng đang trống.", new ErrorDetail("code", "Thêm sản phẩm trước khi dùng mã."));
        var dto = await BuildAsync(cart, owner.UserId, req.Code, provinceCode, ct);
        if (dto.CouponError is not null) throw new AppException(dto.CouponErrorCode ?? "coupon_invalid", dto.CouponError, 400, [new ErrorDetail("code", dto.CouponError)]);
        cart.CouponCode = CouponEvaluator.NormalizeCode(req.Code);
        Touch(cart);
        await db.SaveChangesAsync(ct);
        return dto;
    }

    public async Task<CartDto> RemoveCouponAsync(CartOwner owner, string? provinceCode, CancellationToken ct = default)
    {
        var cart = await FindAsync(owner, track: true, ct);
        if (cart is not null && cart.CouponCode is not null)
        {
            cart.CouponCode = null;
            await db.SaveChangesAsync(ct);
        }
        return await BuildAsync(cart, owner.UserId, null, provinceCode, ct);
    }

    /// <summary>Khi khách đăng nhập: gộp giỏ của phiên vào giỏ tài khoản (cộng số lượng, không vượt tồn kho), rồi xoá giỏ phiên.</summary>
    public async Task MergeAsync(string? sessionToken, Guid userId, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(sessionToken)) return;
        var guest = await db.Carts.Include(c => c.Items).SingleOrDefaultAsync(c => c.SessionToken == sessionToken && c.UserId == null, ct);
        if (guest is null) return;

        var mine = await db.Carts.Include(c => c.Items).FirstOrDefaultAsync(c => c.UserId == userId, ct);
        if (mine is null)
        {
            guest.UserId = userId;
            guest.SessionToken = null;
            Touch(guest);
        }
        else
        {
            var variants = await db.ProductVariants.AsNoTracking().Where(v => guest.Items.Select(i => i.VariantId).Contains(v.Id)).ToDictionaryAsync(v => v.Id, ct);
            foreach (var item in guest.Items)
            {
                if (!variants.TryGetValue(item.VariantId, out var v)) continue;
                var existing = mine.Items.SingleOrDefault(i => i.VariantId == item.VariantId);
                var cap = Math.Max(0, Math.Min(v.StockQuantity, MaxLineQuantity));
                var qty = Math.Min((existing?.Quantity ?? 0) + item.Quantity, cap);
                if (qty <= 0) continue;
                if (existing is null && mine.Items.Count < MaxLines) { var added = new CartItem { CartId = mine.Id, VariantId = item.VariantId, Quantity = qty }; db.CartItems.Add(added); mine.Items.Add(added); }
                else if (existing is not null) existing.Quantity = qty;
            }
            mine.CouponCode ??= guest.CouponCode;
            Touch(mine);
            db.CartItems.RemoveRange(guest.Items);
            db.Carts.Remove(guest);
        }
        await db.SaveChangesAsync(ct);
    }

    // ---------- nội bộ ----------
    private static void EnsureStock(ProductVariant variant, int wanted)
    {
        if (variant.StockQuantity <= 0) throw AppException.Conflict("Sản phẩm này đã hết hàng.", "out_of_stock");
        if (wanted > variant.StockQuantity)
            throw new AppException("insufficient_stock", $"Chỉ còn {variant.StockQuantity} sản phẩm trong kho.", 409, [new ErrorDetail("quantity", $"Tối đa {variant.StockQuantity}.")]);
    }

    private void Touch(Cart cart) => cart.ExpiresAt = clock.GetUtcNow().UtcDateTime.Add(CartLifetime);

    private async Task<ProductVariant?> LoadPurchasableVariantAsync(Guid variantId, CancellationToken ct) =>
        await db.ProductVariants.AsNoTracking().Include(v => v.Product).ThenInclude(p => p!.PrimaryCategory)
            .Where(v => v.Id == variantId && v.IsActive && v.Product != null && v.Product.Status == ProductStatus.Active
                && (v.Product.PrimaryCategory == null || v.Product.PrimaryCategory.IsActive)).SingleOrDefaultAsync(ct);

    private async Task<Cart?> FindAsync(CartOwner owner, bool track, CancellationToken ct)
    {
        if (owner.IsEmpty) return null;
        var query = track ? db.Carts.Include(c => c.Items) : db.Carts.AsNoTracking().Include(c => c.Items);
        return owner.UserId is { } uid
            ? await query.FirstOrDefaultAsync(c => c.UserId == uid, ct)
            : await query.FirstOrDefaultAsync(c => c.SessionToken == owner.SessionToken && c.UserId == null, ct);
    }

    private async Task<Cart> FindOrCreateAsync(CartOwner owner, CancellationToken ct)
    {
        if (owner.IsEmpty) throw new InvalidOperationException("Cần định danh giỏ hàng trước khi ghi.");
        var cart = await FindAsync(owner, track: true, ct);
        if (cart is not null) return cart;
        cart = new Cart { UserId = owner.UserId, SessionToken = owner.UserId is null ? owner.SessionToken : null };
        Touch(cart);
        db.Carts.Add(cart);
        return cart;
    }

    /// <summary>Dựng giỏ hàng với giá và tồn kho hiện tại (không bao giờ tin giá lưu cũ). couponOverride dùng để thử mã trước khi lưu.</summary>
    internal async Task<CartDto> BuildAsync(Cart? cart, Guid? userId, string? couponOverride, string? provinceCode, CancellationToken ct)
    {
        var items = cart?.Items.ToList() ?? [];
        if (items.Count == 0) return new CartDto([], 0, 0, cart?.CouponCode, 0, false, 0, 0, null, null, false);

        var ids = items.Select(i => i.VariantId).ToList();
        var variants = await db.ProductVariants.AsNoTracking().Include(v => v.Product).ThenInclude(p => p!.PrimaryCategory).Include(v => v.OptionValues).ThenInclude(o => o.Value)
            .Include(v => v.OptionValues).ThenInclude(o => o.Attribute)
            .Where(v => ids.Contains(v.Id)).ToDictionaryAsync(v => v.Id, ct);
        var productIds = variants.Values.Where(v => v.Product is not null).Select(v => v.ProductId).Distinct().ToList();
        var primaryImages = await db.ProductImages.AsNoTracking().Where(i => productIds.Contains(i.ProductId)).OrderByDescending(i => i.IsPrimary).ThenBy(i => i.SortOrder)
            .Select(i => new { i.ProductId, i.MediaId }).ToListAsync(ct);
        var imageByProduct = primaryImages.GroupBy(i => i.ProductId).ToDictionary(g => g.Key, g => g.First().MediaId);
        var mediaMap = await media.LoadAsync(imageByProduct.Values.Select(m => (Guid?)m).Concat(variants.Values.Select(v => v.ImageMediaId)), ct);

        var lines = new List<CartLineDto>();
        foreach (var item in items.OrderBy(i => i.Id))
        {
            if (!variants.TryGetValue(item.VariantId, out var v) || v.Product is null) continue; // biến thể/sản phẩm đã xoá
            var p = v.Product;
            var available = v.IsActive && p.Status == ProductStatus.Active && (p.PrimaryCategory is null || p.PrimaryCategory.IsActive);
            string? issue = !available ? "unavailable" : v.StockQuantity <= 0 ? "out_of_stock" : item.Quantity > v.StockQuantity ? "insufficient_stock" : null;
            var price = v.EffectivePrice;
            var label = string.Join(" / ", v.OptionValues.OrderBy(o => o.Attribute!.SortOrder).Select(o => o.Value!.Label));
            var image = MediaResolver.Get(mediaMap, v.ImageMediaId) ?? (imageByProduct.TryGetValue(p.Id, out var m) ? MediaResolver.Get(mediaMap, m) : null);
            lines.Add(new CartLineDto(item.Id, v.Id, p.Id, p.Name, p.Slug, v.Sku, label.Length == 0 ? null : label, image, price, price < v.Price ? v.Price : null,
                item.Quantity, Math.Max(0, Math.Min(v.StockQuantity, MaxLineQuantity)), issue is null ? price * item.Quantity : 0, issue));
        }

        var subtotal = lines.Sum(l => l.LineTotal);
        var code = couponOverride ?? cart?.CouponCode;
        var eval = await coupons.EvaluateAsync(code, subtotal, userId, null, ct);
        var discount = eval.IsValid ? eval.Discount : 0;
        var fee = 0m;
        if (provinceCode is not null && subtotal > 0)
        {
            var quote = await shipping.QuoteAsync(provinceCode, subtotal, ct);
            fee = eval.IsValid && eval.FreeShipping ? 0 : quote.Fee;
        }
        return new CartDto(lines, lines.Sum(l => l.Quantity), subtotal, code is null ? null : CouponEvaluator.NormalizeCode(code), discount, eval.IsValid && eval.FreeShipping,
            fee, Math.Max(0, subtotal - discount) + fee, eval.Error, eval.ErrorCode, lines.Any(l => l.Issue is not null));
    }
}
