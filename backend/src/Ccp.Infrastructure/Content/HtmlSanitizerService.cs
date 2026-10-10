using Ccp.Application.Abstractions;
using Ganss.Xss;

namespace Ccp.Infrastructure.Content;

/// <summary>Làm sạch HTML do trình soạn thảo sinh ra (Page, Post, mô tả sản phẩm): bỏ script, sự kiện, URL nguy hiểm.</summary>
public sealed class HtmlSanitizerService : IHtmlSanitizerService
{
    private readonly HtmlSanitizer _sanitizer = Build();

    public string Sanitize(string? html) => string.IsNullOrWhiteSpace(html) ? "" : _sanitizer.Sanitize(html);

    private static HtmlSanitizer Build()
    {
        var s = new HtmlSanitizer();
        s.AllowedSchemes.Clear();
        foreach (var scheme in new[] { "http", "https", "mailto", "tel" }) s.AllowedSchemes.Add(scheme);
        s.AllowedTags.Add("figure");
        s.AllowedTags.Add("figcaption");
        s.AllowedAttributes.Add("class");
        return s;
    }
}
