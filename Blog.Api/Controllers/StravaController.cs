using Microsoft.AspNetCore.Mvc;
using Blog.Api.Models;
using Blog.Api.Services;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/strava")]
public class StravaController : ControllerBase
{
    private readonly IStravaService _service;

    public StravaController(IStravaService service)
    {
        _service = service;
    }

    private bool IsAdmin()
    {
        var token = GetTokenFromHeader();
        return !string.IsNullOrEmpty(token) && TokenStore.IsValidToken(token);
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

    // Public endpoints
    [HttpGet("activities")]
    public async Task<ActionResult<IEnumerable<StravaActivity>>> GetActivities()
    {
        var activities = await _service.GetAllActivities();
        return Ok(activities);
    }

    [HttpGet("activities/{id}")]
    public async Task<ActionResult<StravaActivity>> GetActivity(long id)
    {
        var activity = await _service.GetActivityById(id);
        if (activity == null) return NotFound();
        return Ok(activity);
    }

    [HttpGet("stats")]
    public async Task<ActionResult<StravaStats>> GetStats()
    {
        var stats = await _service.GetStats();
        return Ok(stats);
    }

    [HttpGet("status")]
    public async Task<ActionResult<ConnectionStatus>> GetStatus()
    {
        var connected = await _service.IsConnected();
        return Ok(new ConnectionStatus { Connected = connected });
    }

    [HttpGet("pbs")]
    public async Task<ActionResult<IEnumerable<PersonalBest>>> GetPersonalBests()
    {
        var pbs = await _service.GetPersonalBests();
        return Ok(pbs);
    }

    // Admin endpoints
    [HttpGet("auth/url")]
    public ActionResult<AuthUrlResponse> GetAuthUrl([FromQuery] string redirectUri)
    {
        if (!IsAdmin()) return Unauthorized();

        var url = _service.GetAuthorizationUrl(redirectUri);
        return Ok(new AuthUrlResponse { Url = url });
    }

    [HttpPost("auth/callback")]
    public async Task<ActionResult> HandleCallback([FromBody] CallbackRequest request)
    {
        if (!IsAdmin()) return Unauthorized();

        try
        {
            await _service.ExchangeCodeForToken(request.Code);
            return Ok(new { success = true });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("sync")]
    public async Task<ActionResult<SyncResult>> Sync()
    {
        if (!IsAdmin()) return Unauthorized();

        try
        {
            var count = await _service.SyncActivities();
            return Ok(new SyncResult { SyncedCount = count });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("disconnect")]
    public async Task<ActionResult> Disconnect()
    {
        if (!IsAdmin()) return Unauthorized();

        await _service.Disconnect();
        return NoContent();
    }
}

public record ConnectionStatus
{
    public bool Connected { get; set; }
}

public record AuthUrlResponse
{
    public string Url { get; set; } = "";
}

public record CallbackRequest(string Code);

public record SyncResult
{
    public int SyncedCount { get; set; }
}
