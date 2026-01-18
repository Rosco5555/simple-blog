using Blog.Api.Models;

namespace Blog.Api.Stores;

public interface IStravaStore
{
    // Token operations
    Task<StravaToken?> GetToken();
    Task SaveToken(StravaToken token);
    Task DeleteToken();

    // Activity operations
    Task<IEnumerable<StravaActivity>> GetAllActivities();
    Task<StravaActivity?> GetActivityById(long id);
    Task<DateTime?> GetLatestActivityDate();
    Task SaveActivities(IEnumerable<StravaActivity> activities);
    Task DeleteAllActivities();
}
