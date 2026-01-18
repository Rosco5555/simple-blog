using Blog.Api.Models;

namespace Blog.Api.Services;

public interface IStravaService
{
    string GetAuthorizationUrl(string redirectUri);
    Task<StravaToken> ExchangeCodeForToken(string code);
    Task<IEnumerable<StravaActivity>> GetAllActivities();
    Task<StravaActivity?> GetActivityById(long id);
    Task<StravaStats> GetStats();
    Task<bool> IsConnected();
    Task<int> SyncActivities();
    Task<IEnumerable<PersonalBest>> GetPersonalBests();
    Task Disconnect();
}

public class StravaStats
{
    public int TotalRuns { get; set; }
    public decimal TotalDistanceKm { get; set; }
    public int TotalTimeMinutes { get; set; }
    public decimal TotalElevationGain { get; set; }
    public decimal AveragePaceMinPerKm { get; set; }
    public DateTime? LastRunDate { get; set; }
}
