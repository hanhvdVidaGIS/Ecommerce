using FluentValidation;

namespace Ccp.Application.Auth;

public sealed class AuthOptions
{
    public int AccessTokenMinutes { get; set; } = 15;
    public int RefreshTokenDays { get; set; } = 7;
    public int MaxFailedLogins { get; set; } = 5;
    public int LockoutMinutes { get; set; } = 15;
    public int ResetTokenMinutes { get; set; } = 30;
    /// <summary>Địa chỉ gốc của Storefront, dùng dựng liên kết trong email.</summary>
    public string PublicBaseUrl { get; set; } = "http://localhost:3000";
}

public sealed record RegisterRequest(string Email, string Password, string FullName, string? PhoneNumber);
public sealed record LoginRequest(string Email, string Password);
public sealed record ForgotPasswordRequest(string Email);
public sealed record ResetPasswordRequest(string Token, string NewPassword);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record CurrentUserDto(Guid Id, string Email, string FullName, string? PhoneNumber,
    IReadOnlyList<string> Roles, IReadOnlyList<string> Permissions);

public sealed record AuthResult(CurrentUserDto User, string AccessToken, DateTime AccessExpiresAt,
    string RefreshToken, DateTime RefreshExpiresAt);

public static class PasswordRules
{
    public static IRuleBuilderOptions<T, string> StrongPassword<T>(this IRuleBuilder<T, string> rule) => rule
        .NotEmpty().WithMessage("Mật khẩu là bắt buộc.")
        .MinimumLength(8).WithMessage("Mật khẩu tối thiểu 8 ký tự.")
        .MaximumLength(128).WithMessage("Mật khẩu tối đa 128 ký tự.")
        .Matches("[A-Za-z]").WithMessage("Mật khẩu phải có chữ cái.")
        .Matches("[0-9]").WithMessage("Mật khẩu phải có chữ số.");
}

public sealed class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(255).WithMessage("Email không hợp lệ.");
        RuleFor(x => x.Password).StrongPassword();
        RuleFor(x => x.FullName).NotEmpty().MaximumLength(200).WithMessage("Họ tên là bắt buộc (tối đa 200 ký tự).");
        RuleFor(x => x.PhoneNumber).MaximumLength(30).Matches(@"^[0-9+\-\s().]*$").When(x => x.PhoneNumber is not null)
            .WithMessage("Số điện thoại không hợp lệ.");
    }
}

public sealed class LoginRequestValidator : AbstractValidator<LoginRequest>
{
    public LoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().MaximumLength(255);
        RuleFor(x => x.Password).NotEmpty().MaximumLength(128);
    }
}

public sealed class ForgotPasswordRequestValidator : AbstractValidator<ForgotPasswordRequest>
{
    public ForgotPasswordRequestValidator() => RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(255);
}

public sealed class ResetPasswordRequestValidator : AbstractValidator<ResetPasswordRequest>
{
    public ResetPasswordRequestValidator()
    {
        RuleFor(x => x.Token).NotEmpty();
        RuleFor(x => x.NewPassword).StrongPassword();
    }
}

public sealed class ChangePasswordRequestValidator : AbstractValidator<ChangePasswordRequest>
{
    public ChangePasswordRequestValidator()
    {
        RuleFor(x => x.CurrentPassword).NotEmpty();
        RuleFor(x => x.NewPassword).StrongPassword();
    }
}
