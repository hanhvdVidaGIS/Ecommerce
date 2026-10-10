using Ccp.Tests.Infrastructure;

namespace Ccp.Tests;

[CollectionDefinition(Name)]
public class ApiCollection : ICollectionFixture<ApiFactory>
{
    public const string Name = "api";
}
