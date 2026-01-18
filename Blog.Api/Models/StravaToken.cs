namespace Blog.Api.Models;

public class StravaToken
{
    public Guid Id { get; set; }
    public long AthleteId { get; set; }
    public string AccessToken { get; set; } = string.Empty;
    public string RefreshToken { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
