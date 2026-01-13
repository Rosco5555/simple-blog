using Microsoft.AspNetCore.Mvc;
using Resend;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly string _adminEmail;
    private readonly string _baseUrl;
    private readonly IResend _resend;
    private const string AuthCookieName = "blog_auth";

    // In-memory token storage (token -> expiry time)
    private static readonly Dictionary<string, DateTime> _tokens = new();

    public AuthController(IConfiguration config, IResend resend)
    {
        _adminEmail = config["Admin:Email"] ?? throw new Exception("Admin:Email not configured");
        _baseUrl = config["BaseUrl"] ?? "http://localhost:5252";
        _resend = resend;
    }

    public record SendLinkRequest(string Email);

    [HttpPost("send-link")]
    public async Task<ActionResult> SendLink(SendLinkRequest request)
    {
        // Always return same response to prevent email enumeration
        var response = new { message = "If that email is registered, you'll receive a login link." };

        if (string.IsNullOrWhiteSpace(request.Email))
        {
            return Ok(response);
        }

        // Only send if email matches admin
        if (!request.Email.Equals(_adminEmail, StringComparison.OrdinalIgnoreCase))
        {
            return Ok(response);
        }

        // Generate secure token
        var token = Guid.NewGuid().ToString("N") + Guid.NewGuid().ToString("N");
        var expiry = DateTime.UtcNow.AddMinutes(15);

        // Clean up expired tokens
        var expired = _tokens.Where(t => t.Value < DateTime.UtcNow).Select(t => t.Key).ToList();
        foreach (var key in expired) _tokens.Remove(key);

        // Store new token
        _tokens[token] = expiry;

        // Send email
        var link = $"{_baseUrl}/api/auth/verify?token={token}";

        try
        {
            await _resend.EmailSendAsync(new EmailMessage
            {
                From = "blog@resend.dev",
                To = { _adminEmail },
                Subject = "Login to The Daily Blog",
                HtmlBody = $@"
                    <p>Click the link below to log in:</p>
                    <p><a href=""{link}"">{link}</a></p>
                    <p>This link expires in 15 minutes.</p>
                "
            });
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to send email: {ex.Message}");
        }

        return Ok(response);
    }

    [HttpGet("verify")]
    public ActionResult Verify([FromQuery] string token)
    {
        if (string.IsNullOrWhiteSpace(token))
        {
            return BadRequest("Invalid token");
        }

        // Check if token exists and is not expired
        if (!_tokens.TryGetValue(token, out var expiry) || expiry < DateTime.UtcNow)
        {
            return BadRequest("Invalid or expired token");
        }

        // Remove token (single use)
        _tokens.Remove(token);

        // Set auth cookie
        Response.Cookies.Append(AuthCookieName, "admin", new CookieOptions
        {
            HttpOnly = true,
            SameSite = SameSiteMode.Strict,
            Expires = DateTimeOffset.UtcNow.AddDays(30)
        });

        // Redirect to frontend
        return Redirect("http://localhost:3000/");
    }

    [HttpPost("logout")]
    public ActionResult Logout()
    {
        Response.Cookies.Delete(AuthCookieName);
        return Ok();
    }

    [HttpGet("me")]
    public ActionResult Me()
    {
        if (Request.Cookies.TryGetValue(AuthCookieName, out var value) && value == "admin")
        {
            return Ok(new { email = _adminEmail });
        }
        return Unauthorized();
    }
}
