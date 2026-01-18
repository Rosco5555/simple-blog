namespace Blog.Api.Models;

public class StravaBestEffort
{
    public long Id { get; set; }
    public long ActivityId { get; set; }
    public long AthleteId { get; set; }
    public string Name { get; set; } = string.Empty;  // e.g., "5K", "10K", "Half-Marathon"
    public decimal DistanceMeters { get; set; }
    public int ElapsedTimeSeconds { get; set; }
    public int MovingTimeSeconds { get; set; }
    public DateTime StartDate { get; set; }
    public int? PrRank { get; set; }  // 1 = PR at time of activity
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public class PersonalBest
{
    public string Name { get; set; } = string.Empty;
    public decimal DistanceMeters { get; set; }
    public int BestTimeSeconds { get; set; }
    public DateTime AchievedDate { get; set; }
    public long ActivityId { get; set; }
}
