namespace Ccp.Application.MediaLibrary;

public enum ImageFormat { Jpeg, Png, Gif, Webp, Mp4, Webm }

public readonly record struct Sniffed(ImageFormat Format, int? Width, int? Height);

/// <summary>Nhận dạng định dạng bằng chữ ký tệp và đọc kích thước ảnh từ phần đầu tệp. Không giải mã toàn bộ ảnh.</summary>
public static class ImageInspector
{
    public static Sniffed? Detect(ReadOnlySpan<byte> b)
    {
        if (b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47 && b[4] == 0x0D && b[5] == 0x0A && b[6] == 0x1A && b[7] == 0x0A)
            return b.Length >= 24 ? new Sniffed(ImageFormat.Png, ReadBe32(b, 16), ReadBe32(b, 20)) : null;

        if (b.Length >= 10 && b[0] == 'G' && b[1] == 'I' && b[2] == 'F' && b[3] == '8' && (b[4] == '7' || b[4] == '9') && b[5] == 'a')
            return new Sniffed(ImageFormat.Gif, b[6] | (b[7] << 8), b[8] | (b[9] << 8));

        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return DetectJpeg(b);

        if (b.Length >= 16 && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P')
            return DetectWebp(b);

        if (b.Length >= 12 && b[4] == 'f' && b[5] == 't' && b[6] == 'y' && b[7] == 'p') return new Sniffed(ImageFormat.Mp4, null, null);
        if (b.Length >= 4 && b[0] == 0x1A && b[1] == 0x45 && b[2] == 0xDF && b[3] == 0xA3) return new Sniffed(ImageFormat.Webm, null, null);
        return null;
    }

    private static Sniffed DetectJpeg(ReadOnlySpan<byte> b)
    {
        var i = 2;
        while (i + 9 < b.Length)
        {
            if (b[i] != 0xFF) { i++; continue; }
            var marker = b[i + 1];
            if (marker == 0xFF) { i++; continue; }
            if (marker is 0xD8 or 0x01 or (>= 0xD0 and <= 0xD7)) { i += 2; continue; }
            var len = (b[i + 2] << 8) | b[i + 3];
            // SOF0..SOF15 (trừ DHT/JPG/DAC) chứa chiều cao, chiều rộng
            if (marker is >= 0xC0 and <= 0xCF and not 0xC4 and not 0xC8 and not 0xCC)
                return new Sniffed(ImageFormat.Jpeg, (b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]);
            i += 2 + len;
        }
        return new Sniffed(ImageFormat.Jpeg, null, null);
    }

    private static Sniffed DetectWebp(ReadOnlySpan<byte> b)
    {
        if (b.Length < 30) return new Sniffed(ImageFormat.Webp, null, null);
        var chunk = (b[12], b[13], b[14], b[15]);
        if (chunk == ((byte)'V', (byte)'P', (byte)'8', (byte)' '))
            return new Sniffed(ImageFormat.Webp, (b[26] | (b[27] << 8)) & 0x3FFF, (b[28] | (b[29] << 8)) & 0x3FFF);
        if (chunk == ((byte)'V', (byte)'P', (byte)'8', (byte)'L'))
        {
            var bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
            return new Sniffed(ImageFormat.Webp, (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1);
        }
        if (chunk == ((byte)'V', (byte)'P', (byte)'8', (byte)'X'))
            return new Sniffed(ImageFormat.Webp, (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, (b[27] | (b[28] << 8) | (b[29] << 16)) + 1);
        return new Sniffed(ImageFormat.Webp, null, null);
    }

    private static int ReadBe32(ReadOnlySpan<byte> b, int o) => (b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3];
}
