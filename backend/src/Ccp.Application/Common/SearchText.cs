using System.Globalization;
using System.Text;

namespace Ccp.Application.Common;

/// <summary>Hàm SQL f_unaccent(text): bỏ dấu, bất biến để dùng trong chỉ mục (tạo bởi migration). Chỉ dùng trong truy vấn EF.</summary>
public static class SqlFunctions
{
    public static string Unaccent(string value) => throw new NotSupportedException("Chỉ dùng trong truy vấn EF.");
}

public static class SearchText
{
    /// <summary>
    /// Chuẩn hoá từ khoá để so khớp không dấu, không phân biệt hoa thường ("Nước Hoa" → "nuoc hoa").
    /// Cùng phép biến đổi với f_unaccent(lower(cột)) ở cơ sở dữ liệu.
    /// </summary>
    public static string Fold(string text)
    {
        var sb = new StringBuilder();
        foreach (var c in text.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) == UnicodeCategory.NonSpacingMark) continue;
            sb.Append(c == 'đ' ? 'd' : c == 'Đ' ? 'D' : c);
        }
        return string.Join(' ', sb.ToString().ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    /// <summary>Mẫu LIKE an toàn: thoát %, _ và \ để từ khoá của người dùng không thành ký tự đại diện.</summary>
    public static string LikePattern(string folded) =>
        "%" + folded.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
}
