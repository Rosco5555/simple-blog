using Microsoft.AspNetCore.Mvc;
using Blog.Api.Models;
using Blog.Api.Services;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/posts")]
public class BlogPostsController : ControllerBase
{
    private readonly IBlogPostService _service;

    public BlogPostsController(IBlogPostService service)
    {
        _service = service;
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
        var post = await _service.CreatePost(request.Title, request.Content);
        return CreatedAtAction(nameof(GetById), new { id = post.Id }, post);
    }

    [HttpPut("{id}")]
    public async Task<ActionResult<BlogPost>> Update(Guid id, [FromBody] CreatePostRequest request)
    {
        var post = await _service.UpdatePost(id, request.Title, request.Content);
        if (post == null) return NotFound();
        return Ok(post);
    }

    [HttpDelete("{id}")]
    public async Task<ActionResult> Delete(Guid id)
    {
        var result = await _service.DeletePost(id);
        if (!result) return NotFound();
        return NoContent();
    }
}

public record CreatePostRequest(string Title, string Content);
