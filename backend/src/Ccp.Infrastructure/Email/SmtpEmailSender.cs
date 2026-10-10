using Ccp.Application.Abstractions;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;

namespace Ccp.Infrastructure.Email;

/// <summary>Cấu hình gửi email qua SMTP (mục Email:Smtp). Để trống Host thì hệ thống chỉ ghi nhật ký email.</summary>
public sealed class SmtpOptions
{
    public string Host { get; set; } = "";
    public int Port { get; set; } = 587;
    public string? User { get; set; }
    public string? Password { get; set; }
    public string FromAddress { get; set; } = "";
    public string FromName { get; set; } = "";
    /// <summary>StartTls (cổng 587), Ssl (cổng 465) hoặc None (chỉ dùng trong mạng nội bộ/thử nghiệm).</summary>
    public string Security { get; set; } = "StartTls";
    public int TimeoutSeconds { get; set; } = 15;

    public bool IsConfigured => !string.IsNullOrWhiteSpace(Host) && !string.IsNullOrWhiteSpace(FromAddress);
}

public sealed class SmtpEmailSender(IOptions<SmtpOptions> options, ILogger<SmtpEmailSender> logger) : IEmailSender
{
    public async Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        var o = options.Value;
        var message = BuildMessage(o, to, subject, htmlBody);
        using var client = new SmtpClient { Timeout = o.TimeoutSeconds * 1000 };
        var secure = o.Security.ToLowerInvariant() switch
        {
            "ssl" => SecureSocketOptions.SslOnConnect,
            "none" => SecureSocketOptions.None,
            _ => SecureSocketOptions.StartTls,
        };
        await client.ConnectAsync(o.Host, o.Port, secure, ct);
        if (!string.IsNullOrEmpty(o.User)) await client.AuthenticateAsync(o.User, o.Password ?? "", ct);
        await client.SendAsync(message, ct);
        await client.DisconnectAsync(true, ct);
        logger.LogInformation("Đã gửi email tới {To}: {Subject}", Mask(to), subject);
    }

    /// <summary>Dựng thư. Tiêu đề bị loại ký tự xuống dòng để người dùng không chèn thêm tiêu đề thư (header injection).</summary>
    internal static MimeMessage BuildMessage(SmtpOptions o, string to, string subject, string htmlBody)
    {
        var msg = new MimeMessage();
        msg.From.Add(new MailboxAddress(o.FromName, o.FromAddress));
        msg.To.Add(MailboxAddress.Parse(to.Trim()));
        msg.Subject = subject.Replace("\r", " ").Replace("\n", " ").Trim();
        msg.Body = new BodyBuilder { HtmlBody = htmlBody, TextBody = System.Text.RegularExpressions.Regex.Replace(htmlBody, "<[^>]+>", " ").Replace("&nbsp;", " ").Trim() }.ToMessageBody();
        return msg;
    }

    private static string Mask(string email)
    {
        var at = email.IndexOf('@');
        return at <= 1 ? "***" : email[0] + "***" + email[at..];
    }
}
