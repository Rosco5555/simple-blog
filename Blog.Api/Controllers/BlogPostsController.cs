using Microsoft.AspNetCore.Mvc;
using Blog.Api.Models;
using Blog.Api.Services;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/posts")]
public class BlogPostsController : ControllerBase
{
    private readonly IBlogPostService _service;
    private const string AuthCookieName = "blog_auth";

    // Fixed admin user ID for RLS
    private static readonly Guid AdminUserId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    public BlogPostsController(IBlogPostService service)
    {
        _service = service;
    }

    private bool IsAdmin()
    {
        return Request.Cookies.TryGetValue(AuthCookieName, out var value) && value == "admin";
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<BlogPost>>> GetAll()
    {
        var posts = await _service.GetAllPosts();
        return Ok(posts);
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<BlogPost>> GetById(Guid id)
    {
        var post = await _service.GetPost(id);
        if (post == null) return NotFound();
        return Ok(post);
    }

    [HttpPost]
    public async Task<ActionResult<BlogPost>> Create([FromBody] CreatePostRequest request)
    {
        if (!IsAdmin()) return Unauthorized();

        var post = await _service.CreatePost(request.Title, request.Content, request.Location, AdminUserId);
        return CreatedAtAction(nameof(GetById), new { id = post.Id }, post);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<BlogPost>> Update(Guid id, [FromBody] CreatePostRequest request)
    {
        if (!IsAdmin()) return Unauthorized();

        var post = await _service.UpdatePost(id, request.Title, request.Content, request.Location, AdminUserId);
        if (post == null) return NotFound();
        return Ok(post);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        if (!IsAdmin()) return Unauthorized();

        var result = await _service.DeletePost(id, AdminUserId);
        if (!result) return NotFound();
        return NoContent();
    }
}

public record CreatePostRequest(string Title, string Content, string? Location);
