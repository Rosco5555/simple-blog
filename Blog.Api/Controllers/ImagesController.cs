using Microsoft.AspNetCore.Mvc;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/images")]
public class ImagesController : ControllerBase
{
    private readonly string _uploadsPath;
    private readonly HashSet<string> _allowedExtensions = new() { ".jpg", ".jpeg", ".png", ".gif", ".webp" };

    public ImagesController(IWebHostEnvironment env)
    {
        _uploadsPath = Path.Combine(env.ContentRootPath, "uploads");
    }

    [HttpPost]
    public async Task<ActionResult> Upload(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "No file provided" });

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!_allowedExtensions.Contains(ext))
            return BadRequest(new { error = "File type not allowed" });

        var filename = $"{Guid.NewGuid()}{ext}";
        var filepath = Path.Combine(_uploadsPath, filename);

        using var stream = new FileStream(filepath, FileMode.Create);
        await file.CopyToAsync(stream);

        var url = $"{Request.Scheme}://{Request.Host}/uploads/{filename}";
        return Ok(new { url });
    }
}
