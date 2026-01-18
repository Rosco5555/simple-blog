using System.Net.Http.Headers;
using System.Text.Json;
using Blog.Api.Models;
using Blog.Api.Stores;

namespace Blog.Api.Services;

public class StravaService : IStravaService
{
    private readonly IStravaStore _store;
    private readonly HttpClient _httpClient;
    private readonly string _clientId;
    private readonly string _clientSecret;
    private const string StravaApiBase = "https://www.strava.com/api/v3";
    private const string StravaOAuthBase = "https://www.strava.com/oauth";

    public StravaService(IStravaStore store, HttpClient httpClient, string clientId, string clientSecret)
    {
        _store = store;
        _httpClient = httpClient;
        _clientId = clientId;
        _clientSecret = clientSecret;
    }

    public string GetAuthorizationUrl(string redirectUri)
    {
        var scope = "read,activity:read_all";
        return $"{StravaOAuthBase}/authorize?client_id={_clientId}&redirect_uri={Uri.EscapeDataString(redirectUri)}&response_type=code&scope={scope}";
    }

    public async Task<StravaToken> ExchangeCodeForToken(string code)
    {
        var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = _clientId,
            ["client_secret"] = _clientSecret,
            ["code"] = code,
            ["grant_type"] = "authorization_code"
        });

        var response = await _httpClient.PostAsync($"{StravaOAuthBase}/token", content);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        var tokenResponse = JsonSerializer.Deserialize<StravaTokenResponse>(json);

        if (tokenResponse == null)
            throw new InvalidOperationException("Failed to parse Strava token response");

        var token = new StravaToken
        {
            AthleteId = tokenResponse.athlete.id,
            AccessToken = tokenResponse.access_token,
            RefreshToken = tokenResponse.refresh_token,
            ExpiresAt = DateTimeOffset.FromUnixTimeSeconds(tokenResponse.expires_at).UtcDateTime
        };

        await _store.SaveToken(token);
        return token;
    }

    public async Task<IEnumerable<StravaActivity>> GetAllActivities()
    {
        return await _store.GetAllActivities();
    }

    public async Task<StravaActivity?> GetActivityById(long id)
    {
        return await _store.GetActivityById(id);
    }

    public async Task<StravaStats> GetStats()
    {
        var activities = (await _store.GetAllActivities()).ToList();

        if (activities.Count == 0)
        {
            return new StravaStats();
        }

        var totalDistance = activities.Sum(a => a.DistanceMeters);
        var totalTime = activities.Sum(a => a.MovingTimeSeconds);

        return new StravaStats
        {
            TotalRuns = activities.Count,
            TotalDistanceKm = Math.Round(totalDistance / 1000m, 1),
            TotalTimeMinutes = totalTime / 60,
            TotalElevationGain = Math.Round(activities.Sum(a => a.TotalElevationGain ?? 0), 0),
            AveragePaceMinPerKm = totalDistance > 0
                ? Math.Round((totalTime / 60m) / (totalDistance / 1000m), 2)
                : 0,
            LastRunDate = activities.FirstOrDefault()?.StartDateLocal
        };
    }

    public async Task<bool> IsConnected()
    {
        var token = await _store.GetToken();
        return token != null;
    }

    public async Task<int> SyncActivities()
    {
        var token = await GetValidToken();
        if (token == null)
            throw new InvalidOperationException("Not connected to Strava");

        var latestDate = await _store.GetLatestActivityDate();
        var activities = await FetchActivitiesFromStrava(token.AccessToken, latestDate);

        if (activities.Any())
        {
            await _store.SaveActivities(activities);
        }

        // Sync best efforts for activities that don't have them yet
        await SyncBestEfforts(token.AccessToken);

        return activities.Count();
    }

    public async Task<IEnumerable<PersonalBest>> GetPersonalBests()
    {
        return await _store.GetPersonalBests();
    }

    public async Task Disconnect()
    {
        await _store.DeleteAllBestEfforts();
        await _store.DeleteToken();
        await _store.DeleteAllActivities();
    }

    private async Task SyncBestEfforts(string accessToken)
    {
        var activityIds = await _store.GetActivityIdsWithoutBestEfforts();

        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        foreach (var activityId in activityIds)
        {
            try
            {
                var response = await _httpClient.GetAsync($"{StravaApiBase}/activities/{activityId}");
                if (!response.IsSuccessStatusCode)
                    continue;

                var json = await response.Content.ReadAsStringAsync();
                var detailed = JsonSerializer.Deserialize<StravaDetailedActivityResponse>(json);

                if (detailed?.best_efforts == null || detailed.best_efforts.Count == 0)
                    continue;

                var efforts = detailed.best_efforts.Select(be => new StravaBestEffort
                {
                    Id = be.id,
                    ActivityId = be.activity_id,
                    AthleteId = be.athlete.id,
                    Name = be.name,
                    DistanceMeters = (decimal)be.distance,
                    ElapsedTimeSeconds = be.elapsed_time,
                    MovingTimeSeconds = be.moving_time,
                    StartDate = DateTime.Parse(be.start_date).ToUniversalTime(),
                    PrRank = be.pr_rank
                });

                await _store.SaveBestEfforts(efforts);

                // Small delay to avoid rate limiting
                await Task.Delay(100);
            }
            catch
            {
                // Skip activities that fail to fetch
                continue;
            }
        }
    }

    private async Task<StravaToken?> GetValidToken()
    {
        var token = await _store.GetToken();
        if (token == null)
            return null;

        if (token.ExpiresAt <= DateTime.UtcNow.AddMinutes(5))
        {
            token = await RefreshToken(token);
        }

        return token;
    }

    private async Task<StravaToken> RefreshToken(StravaToken token)
    {
        var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = _clientId,
            ["client_secret"] = _clientSecret,
            ["refresh_token"] = token.RefreshToken,
            ["grant_type"] = "refresh_token"
        });

        var response = await _httpClient.PostAsync($"{StravaOAuthBase}/token", content);
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        var tokenResponse = JsonSerializer.Deserialize<StravaRefreshResponse>(json);

        if (tokenResponse == null)
            throw new InvalidOperationException("Failed to parse Strava refresh response");

        token.AccessToken = tokenResponse.access_token;
        token.RefreshToken = tokenResponse.refresh_token;
        token.ExpiresAt = DateTimeOffset.FromUnixTimeSeconds(tokenResponse.expires_at).UtcDateTime;

        await _store.SaveToken(token);
        return token;
    }

    private async Task<IEnumerable<StravaActivity>> FetchActivitiesFromStrava(string accessToken, DateTime? after)
    {
        var activities = new List<StravaActivity>();
        var page = 1;
        const int perPage = 100;

        _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);

        while (true)
        {
            var url = $"{StravaApiBase}/athlete/activities?page={page}&per_page={perPage}";
            if (after.HasValue)
            {
                var epoch = new DateTimeOffset(after.Value).ToUnixTimeSeconds();
                url += $"&after={epoch}";
            }

            var response = await _httpClient.GetAsync(url);
            response.EnsureSuccessStatusCode();

            var json = await response.Content.ReadAsStringAsync();
            var stravaActivities = JsonSerializer.Deserialize<List<StravaActivityResponse>>(json);

            if (stravaActivities == null || stravaActivities.Count == 0)
                break;

            foreach (var sa in stravaActivities)
            {
                // Only sync running activities
                if (sa.type != "Run" && sa.type != "VirtualRun" && sa.type != "TrailRun")
                    continue;

                activities.Add(new StravaActivity
                {
                    Id = sa.id,
                    AthleteId = sa.athlete.id,
                    Name = sa.name,
                    ActivityType = sa.type,
                    DistanceMeters = (decimal)sa.distance,
                    MovingTimeSeconds = sa.moving_time,
                    ElapsedTimeSeconds = sa.elapsed_time,
                    TotalElevationGain = sa.total_elevation_gain.HasValue ? (decimal)sa.total_elevation_gain.Value : null,
                    StartDate = DateTime.Parse(sa.start_date).ToUniversalTime(),
                    StartDateLocal = DateTime.Parse(sa.start_date_local),
                    AverageSpeed = sa.average_speed.HasValue ? (decimal)sa.average_speed.Value : null,
                    MaxSpeed = sa.max_speed.HasValue ? (decimal)sa.max_speed.Value : null,
                    AverageHeartrate = sa.average_heartrate.HasValue ? (decimal)sa.average_heartrate.Value : null,
                    MaxHeartrate = sa.max_heartrate.HasValue ? (int)sa.max_heartrate.Value : null,
                    SummaryPolyline = sa.map?.summary_polyline,
                    Calories = sa.calories.HasValue ? (int)sa.calories.Value : null,
                    LocationCity = sa.location_city,
                    LocationState = sa.location_state,
                    LocationCountry = sa.location_country
                });
            }

            if (stravaActivities.Count < perPage)
                break;

            page++;
        }

        return activities;
    }

    // JSON response classes
    private class StravaTokenResponse
    {
        public string access_token { get; set; } = "";
        public string refresh_token { get; set; } = "";
        public long expires_at { get; set; }
        public StravaAthlete athlete { get; set; } = new();
    }

    private class StravaRefreshResponse
    {
        public string access_token { get; set; } = "";
        public string refresh_token { get; set; } = "";
        public long expires_at { get; set; }
    }

    private class StravaAthlete
    {
        public long id { get; set; }
    }

    private class StravaActivityResponse
    {
        public long id { get; set; }
        public StravaAthlete athlete { get; set; } = new();
        public string name { get; set; } = "";
        public string type { get; set; } = "";
        public double distance { get; set; }
        public int moving_time { get; set; }
        public int elapsed_time { get; set; }
        public double? total_elevation_gain { get; set; }
        public string start_date { get; set; } = "";
        public string start_date_local { get; set; } = "";
        public double? average_speed { get; set; }
        public double? max_speed { get; set; }
        public double? average_heartrate { get; set; }
        public double? max_heartrate { get; set; }
        public StravaMap? map { get; set; }
        public double? calories { get; set; }
        public string? location_city { get; set; }
        public string? location_state { get; set; }
        public string? location_country { get; set; }
    }

    private class StravaDetailedActivityResponse : StravaActivityResponse
    {
        public List<StravaBestEffortResponse>? best_efforts { get; set; }
    }

    private class StravaBestEffortResponse
    {
        public long id { get; set; }
        public long activity_id { get; set; }
        public StravaAthlete athlete { get; set; } = new();
        public string name { get; set; } = "";
        public double distance { get; set; }
        public int elapsed_time { get; set; }
        public int moving_time { get; set; }
        public string start_date { get; set; } = "";
        public int? pr_rank { get; set; }
    }

    private class StravaMap
    {
        public string? summary_polyline { get; set; }
    }
}
