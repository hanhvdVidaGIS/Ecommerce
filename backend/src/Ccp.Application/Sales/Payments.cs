using System.Text.Json;
using Ccp.Application.Config;
using Ccp.Application.Abstractions;
using Ccp.Application.Common;
using Ccp.Domain.Entities;
using Ccp.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Ccp.Application.Sales;

/// <summary>
/// Cổng thanh toán. COD và chuyển khoản không gọi dịch vụ ngoài; VNPay, MoMo, ZaloPay, Stripe sẽ là các lớp triển khai mới
/// đăng ký trong DI mà không phải sửa luồng đặt hàng.
/// </summary>
public interface IPaymentGateway
{
    PaymentMethod Method { get; }
    string Provider { get; }
    /// <summary>Khởi tạo giao dịch cho đơn hàng vừa tạo (bản ghi Payment chưa lưu) và trả về hướng dẫn thanh toán nếu có.</summary>
    Task<BankTransferInfoDto?> InitiateAsync(Order order, Payment payment, CancellationToken ct = default);
}

public sealed class CodGateway : IPaymentGateway
{
    public PaymentMethod Method => PaymentMethod.Cod;
    public string Provider => "cod";
    public Task<BankTransferInfoDto?> InitiateAsync(Order order, Payment payment, CancellationToken ct = default) => Task.FromResult<BankTransferInfoDto?>(null);
}

public sealed class BankTransferGateway(IAppDbContext db) : IPaymentGateway
{
    public PaymentMethod Method => PaymentMethod.BankTransfer;
    public string Provider => "bank_transfer";

    public async Task<BankTransferInfoDto?> InitiateAsync(Order order, Payment payment, CancellationToken ct = default) => await InfoAsync(order.OrderNumber, ct);

    /// <summary>Thông tin tài khoản nhận tiền lấy từ cấu hình cửa hàng; nội dung chuyển khoản là mã đơn hàng.</summary>
    public async Task<BankTransferInfoDto> InfoAsync(string orderNumber, CancellationToken ct = default)
    {
        var json = await db.WebsiteSettings.AsNoTracking().Where(s => s.Key == SettingKeys.BankAccount).Select(s => s.Value).FirstOrDefaultAsync(ct);
        string? bank = null, number = null, name = null;
        if (!string.IsNullOrWhiteSpace(json))
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                string? Get(string k) => doc.RootElement.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String && v.GetString()!.Length > 0 ? v.GetString() : null;
                bank = Get("bank"); number = Get("accountNumber"); name = Get("accountName");
            }
            catch (JsonException) { /* cấu hình hỏng: trả về thông tin trống thay vì làm hỏng đơn hàng */ }
        }
        return new BankTransferInfoDto(bank, number, name, orderNumber);
    }
}

public class PaymentGatewayRegistry(IEnumerable<IPaymentGateway> gateways, IAppDbContext db)
{
    public IPaymentGateway Get(PaymentMethod method) =>
        gateways.SingleOrDefault(g => g.Method == method) ?? throw AppException.Validation("Phương thức thanh toán chưa được hỗ trợ.", new ErrorDetail("paymentMethod", "Không hỗ trợ."));

    /// <summary>Phương thức đang bật trong cấu hình cửa hàng (store.paymentMethods) và có cổng triển khai.</summary>
    public async Task<IReadOnlyList<PaymentMethod>> EnabledAsync(CancellationToken ct = default)
    {
        var json = await db.WebsiteSettings.AsNoTracking().Where(s => s.Key == SettingKeys.PaymentMethods).Select(s => s.Value).FirstOrDefaultAsync(ct);
        var names = new List<string>();
        try { names = JsonSerializer.Deserialize<List<string>>(string.IsNullOrWhiteSpace(json) ? "[]" : json) ?? []; }
        catch (JsonException) { /* cấu hình hỏng: coi như chưa bật phương thức nào */ }
        return names.Select(n => Enum.TryParse<PaymentMethod>(n, out var m) ? (PaymentMethod?)m : null).Where(m => m.HasValue && gateways.Any(g => g.Method == m)).Select(m => m!.Value).Distinct().ToList();
    }
}
