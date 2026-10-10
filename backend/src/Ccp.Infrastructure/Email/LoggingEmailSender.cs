using Ccp.Application.Abstractions;
using Microsoft.Extensions.Logging;

namespace Ccp.Infrastructure.Email;

/// <summary>Chỉ ghi nhật ký (môi trường phát triển). Gửi thật qua SMTP là một lớp triển khai khác của IEmailSender.</summary>
public sealed class LoggingEmailSender(ILogger<LoggingEmailSender> logger) : IEmailSender
{
    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        logger.LogInformation("EMAIL (chưa gửi thật) tới {To}: {Subject}\n{Body}", to, subject, htmlBody);
        return Task.CompletedTask;
    }
}
