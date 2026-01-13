using Microsoft.AspNetCore.Mvc;
using Blog.Api.Models;
using Blog.Api.Stores;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/users")]
public class UsersController : ControllerBase
{
    private readonly IUserStore _store;

    public UsersController(IUserStore store)
    {
        _store = store;
    }

    [HttpGet("me")]
    public async Task<ActionResult<User>> GetCurrentUser()
    {
        if (Request.Headers.TryGetValue("X-User-Id", out var userIdHeader) &&
            Guid.TryParse(userIdHeader, out var userId))
        {
            var user = await _store.GetById(userId);
            if (user != null) return Ok(user);
        }
        return Unauthorized(new { error = "User ID required" });
    }

    [HttpGet("{id}")]
    public async Task<ActionResult<User>> GetById(Guid id)
    {
        var user = await _store.GetById(id);
        if (user == null) return NotFound();
        return Ok(user);
    }
}
