namespace Blog.Api.Models;

public class StravaActivity
{
    public long Id { get; set; }
    public long AthleteId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string ActivityType { get; set; } = string.Empty;
    public decimal DistanceMeters { get; set; }
    public int MovingTimeSeconds { get; set; }
    public int ElapsedTimeSeconds { get; set; }
    public decimal? TotalElevationGain { get; set; }
    public DateTime StartDate { get; set; }
    public DateTime StartDateLocal { get; set; }
    public decimal? AverageSpeed { get; set; }
    public decimal? MaxSpeed { get; set; }
    public decimal? AverageHeartrate { get; set; }
    public int? MaxHeartrate { get; set; }
    public string? SummaryPolyline { get; set; }
    public int? Calories { get; set; }
    public string? LocationCity { get; set; }
    public string? LocationState { get; set; }
    public string? LocationCountry { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
