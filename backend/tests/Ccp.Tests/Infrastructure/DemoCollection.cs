namespace Ccp.Tests;

/// <summary>Một cơ sở dữ liệu có dữ liệu mẫu nước hoa dùng chung cho các test của cửa hàng (chỉ đọc, trừ khi test tự hoàn nguyên).</summary>
[CollectionDefinition(Name)]
public class DemoCollection : ICollectionFixture<DemoApiFactory>
{
    public const string Name = "demo";
}
