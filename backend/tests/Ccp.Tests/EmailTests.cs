using System.Net.Http.Json;
using System.Text.Json;
using Ccp.Application.Abstractions;
using Ccp.Infrastructure;
using Ccp.Infrastructure.Email;
using Microsoft.Extensions.Configuration;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Containers;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Ccp.Tests;

/// <summary>Gửi thư thật tới một máy chủ SMTP thật (Mailpit trong container) rồi đọc lại hộp thư để kiểm tra nội dung.</summary>
public sealed class MailpitFixture : IAsyncLifetime
{
    private readonly IContainer _container = new ContainerBuilder("axllent/mailpit:latest")
        .WithPortBinding(1025, true).WithPortBinding(8025, true)
        .WithWaitStrategy(Wait.ForUnixContainer().UntilHttpRequestIsSucceeded(r => r.ForPort(8025).ForPath("/api/v1/info")))
        .Build();

    public int SmtpPort => _container.GetMappedPublicPort(1025);
    public string ApiBase => $"http://{_container.Hostname}:{_container.GetMappedPublicPort(8025)}";
    public Task InitializeAsync() => _container.StartAsync();
    public Task DisposeAsync() => _container.DisposeAsync().AsTask();
}

public class EmailTests(MailpitFixture mail) : IClassFixture<MailpitFixture>
{
    private SmtpEmailSender Sender() => new(Options.Create(new SmtpOptions
    {
        Host = "localhost", Port = mail.SmtpPort, Security = "None", FromAddress = "shop@example.test", FromName = "Cửa hàng Thử",
    }), NullLogger<SmtpEmailSender>.Instance);

    private async Task<JsonElement> LastMessageAsync(string to)
    {
        using var http = new HttpClient();
        for (var i = 0; i < 20; i++)
        {
            var list = await http.GetFromJsonAsync<JsonElement>($"{mail.ApiBase}/api/v1/messages");
            foreach (var m in list.GetProperty("messages").EnumerateArray())
                if (m.GetProperty("To").EnumerateArray().Any(t => t.GetProperty("Address").GetString() == to))
                    return await http.GetFromJsonAsync<JsonElement>($"{mail.ApiBase}/api/v1/message/{m.GetProperty("ID").GetString()}");
            await Task.Delay(250);
        }
        throw new TimeoutException("Không thấy thư trong hộp thư thử.");
    }

    [Fact]
    public async Task Sends_html_mail_with_utf8_subject_sender_and_text_alternative()
    {
        var to = $"nguoi-nhan-{Guid.NewGuid():N}@example.test";
        await Sender().SendAsync(to, "Xác nhận đơn hàng OD261010-ABCDE", "<p>Cảm ơn <b>Nguyễn Văn A</b> đã đặt hàng.</p>");

        var m = await LastMessageAsync(to);
        Assert.Equal("Xác nhận đơn hàng OD261010-ABCDE", m.GetProperty("Subject").GetString());
        Assert.Equal("shop@example.test", m.GetProperty("From").GetProperty("Address").GetString());
        Assert.Equal("Cửa hàng Thử", m.GetProperty("From").GetProperty("Name").GetString());
        Assert.Contains("<b>Nguyễn Văn A</b>", m.GetProperty("HTML").GetString());
        Assert.Contains("Nguyễn Văn A", m.GetProperty("Text").GetString());
        Assert.DoesNotContain("<b>", m.GetProperty("Text").GetString());
    }

    [Fact]
    public async Task Subject_cannot_inject_extra_headers()
    {
        var to = $"inj-{Guid.NewGuid():N}@example.test";
        await Sender().SendAsync(to, "Chào\r\nBcc: ke-xau@example.test", "<p>x</p>");

        var m = await LastMessageAsync(to);
        Assert.Empty(m.GetProperty("Bcc").EnumerateArray());
        Assert.DoesNotContain('\n', m.GetProperty("Subject").GetString()!);
    }

    [Fact]
    public async Task Invalid_recipient_fails_loudly_instead_of_being_swallowed()
    {
        await Assert.ThrowsAnyAsync<Exception>(() => Sender().SendAsync("khong-phai-email", "x", "<p>x</p>"));
    }

    [Fact]
    public void Logging_sender_is_used_unless_smtp_host_and_sender_address_are_both_configured()
    {
        static IEmailSender Resolve(Dictionary<string, string?> cfg)
        {
            var config = new Microsoft.Extensions.Configuration.ConfigurationBuilder().AddInMemoryCollection(cfg).Build();
            var services = new ServiceCollection();
            services.AddLogging();
            services.AddInfrastructure(config, isDevelopment: true);
            return services.BuildServiceProvider().GetRequiredService<IEmailSender>();
        }
        var baseCfg = new Dictionary<string, string?> { ["POSTGRES_PASSWORD"] = "x", ["JWT_KEY"] = new string('k', 40) };

        Assert.IsType<LoggingEmailSender>(Resolve(baseCfg));
        Assert.IsType<LoggingEmailSender>(Resolve(new(baseCfg) { ["Email:Smtp:Host"] = "smtp.example.test" })); // thiếu người gửi
        Assert.IsType<SmtpEmailSender>(Resolve(new(baseCfg) { ["Email:Smtp:Host"] = "smtp.example.test", ["Email:Smtp:FromAddress"] = "a@example.test" }));
    }
}
