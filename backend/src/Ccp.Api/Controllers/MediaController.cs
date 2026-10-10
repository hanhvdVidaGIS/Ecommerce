using Ccp.Api.Http;
using Ccp.Api.Security;
using Ccp.Application.Common;
using Ccp.Application.MediaLibrary;
using Ccp.Domain.Security;
using Microsoft.AspNetCore.Mvc;

namespace Ccp.Api.Controllers;

[Route("api/admin/media")]
public class MediaController(MediaService media) : ApiControllerBase
{
    [HttpGet, HasPermission(Permissions.MediaView)]
    public async Task<ApiResponse<IReadOnlyList<MediaDto>>> List([FromQuery] MediaQuery query, CancellationToken ct) =>
        Paged(await media.ListAsync(query, ct));

    [HttpGet("folders"), HasPermission(Permissions.MediaView)]
    public async Task<ApiResponse<IReadOnlyList<string>>> Folders(CancellationToken ct) => Ok(await media.FoldersAsync(ct));

    /// <summary>Tải một hoặc nhiều tệp (trường form "files"). Tệp lỗi được báo riêng trong errors, tệp hợp lệ vẫn được lưu.</summary>
    [HttpPost, HasPermission(Permissions.MediaUpload)]
    [RequestSizeLimit(150L * 1024 * 1024), RequestFormLimits(MultipartBodyLengthLimit = 150L * 1024 * 1024)]
    public async Task<ApiResponse<UploadResult>> Upload([FromForm] IFormFileCollection files, [FromForm] string? folder, CancellationToken ct)
    {
        var incoming = files.Select(f => new IncomingFile(f.FileName, f.ContentType, f.Length, f.OpenReadStream)).ToList();
        return Ok(await media.UploadAsync(incoming, folder, ct));
    }

    [HttpPut("{id:guid}"), HasPermission(Permissions.MediaUpload)]
    public async Task<ApiResponse<MediaDto>> Update(Guid id, UpdateMediaRequest request, CancellationToken ct) =>
        Ok(await media.UpdateAsync(id, request, ct));

    [HttpDelete("{id:guid}"), HasPermission(Permissions.MediaDelete)]
    public async Task<ApiResponse<object>> Delete(Guid id, CancellationToken ct)
    {
        await media.DeleteAsync(id, ct);
        return Done();
    }
}
