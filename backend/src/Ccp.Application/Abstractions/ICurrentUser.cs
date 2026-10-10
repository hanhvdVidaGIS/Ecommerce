namespace Ccp.Application.Abstractions;

public interface ICurrentUser
{
    Guid? UserId { get; }
    bool IsAuthenticated { get; }
    string? Ip { get; }
    bool HasPermission(string permission);
}
