using System.Net.Http.Headers;
using System.Text;

namespace Ccp.Tests.Infrastructure;

/// <summary>Tệp mẫu nhỏ, sinh bằng mã để kiểm thử upload (không phụ thuộc tệp ngoài).</summary>
public static class SampleFiles
{
    public static byte[] Png() => Convert.FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==");

    public static byte[] Gif() => Convert.FromBase64String("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");

    /// <summary>JPEG tối thiểu có SOF0 khai báo kích thước width x height (đủ cho việc nhận dạng).</summary>
    public static byte[] Jpeg(int width = 32, int height = 16) =>
    [
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
        0xFF, 0xC0, 0x00, 0x11, 0x08, (byte)(height >> 8), (byte)height, (byte)(width >> 8), (byte)width, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
        0xFF, 0xD9,
    ];

    public static byte[] Webp(int width = 100, int height = 50)
    {
        var w = width - 1; var h = height - 1;
        var body = new List<byte>();
        body.AddRange(Encoding.ASCII.GetBytes("WEBP"));
        body.AddRange(Encoding.ASCII.GetBytes("VP8X"));
        body.AddRange(BitConverter.GetBytes(10));
        body.AddRange([0, 0, 0, 0]);
        body.AddRange([(byte)w, (byte)(w >> 8), (byte)(w >> 16), (byte)h, (byte)(h >> 8), (byte)(h >> 16)]);
        var all = new List<byte>(Encoding.ASCII.GetBytes("RIFF"));
        all.AddRange(BitConverter.GetBytes(body.Count));
        all.AddRange(body);
        return all.ToArray();
    }

    public static byte[] Mp4() => [0, 0, 0, 0x18, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'m', (byte)'p', (byte)'4', (byte)'2', 0, 0, 0, 0, (byte)'m', (byte)'p', (byte)'4', (byte)'2', (byte)'i', (byte)'s', (byte)'o', (byte)'m'];

    public static byte[] WindowsExecutable() => [(byte)'M', (byte)'Z', 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xFF, 0xFF, 0, 0, 0xB8, 0, 0, 0];

    public static byte[] Svg() => Encoding.UTF8.GetBytes("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");

    public static MultipartFormDataContent Form(string? folder = null, params (string FileName, string ContentType, byte[] Bytes)[] files)
    {
        var form = new MultipartFormDataContent();
        foreach (var (name, type, bytes) in files)
        {
            var part = new ByteArrayContent(bytes);
            part.Headers.ContentType = MediaTypeHeaderValue.Parse(type);
            form.Add(part, "files", name);
        }
        if (folder is not null) form.Add(new StringContent(folder), "folder");
        return form;
    }
}
