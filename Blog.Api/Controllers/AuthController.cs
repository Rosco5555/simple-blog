using Microsoft.AspNetCore.Mvc;
using Blog.Api.Stores;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IUserStore _userStore;

    public AuthController(IUserStore userStore)
    {
        _userStore = userStore;
    }

    public record LoginRequest(string Username, string Password);

    [HttpPost("login")]
    public async Task<ActionResult> Login(LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest(new { error = "Username and password required" });
        }

        var user = await _userStore.GetByUsername(request.Username);
        if (user == null || string.IsNullOrEmpty(user.PasswordHash))
        {
            return Unauthorized(new { error = "Invalid credentials" });
        }

        if (!BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
        {
            return Unauthorized(new { error = "Invalid credentials" });
        }

        // Generate session token
        var sessionToken = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        TokenStore.AddToken(sessionToken, DateTime.UtcNow.AddDays(30));

        return Ok(new { token = sessionToken });
    }

    [HttpPost("logout")]
    public ActionResult Logout()
    {
        var token = GetTokenFromHeader();
        if (!string.IsNullOrEmpty(token))
        {
            TokenStore.RemoveToken(token);
        }
        return Ok();
    }

    [HttpGet("me")]
    public ActionResult Me()
    {
        var token = GetTokenFromHeader();
        if (!string.IsNullOrEmpty(token) && TokenStore.IsValidToken(token))
        {
            return Ok(new { username = "admin" });
        }
        return Unauthorized();
    }

    private string? GetTokenFromHeader()
    {
        var auth = Request.Headers["Authorization"].FirstOrDefault();
        if (auth != null && auth.StartsWith("Bearer "))
        {
            return auth.Substring(7);
        }
        return null;
    }
}
