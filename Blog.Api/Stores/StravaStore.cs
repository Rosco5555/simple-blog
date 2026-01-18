using Npgsql;
using Blog.Api.Models;

namespace Blog.Api.Stores;

public class StravaStore : IStravaStore
{
    private readonly string _connectionString;

    public StravaStore(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<StravaToken?> GetToken()
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            SELECT id, athlete_id, access_token, refresh_token, expires_at, updated_at
            FROM strava_tokens
            LIMIT 1", conn);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new StravaToken
            {
                Id = reader.GetGuid(0),
                AthleteId = reader.GetInt64(1),
                AccessToken = reader.GetString(2),
                RefreshToken = reader.GetString(3),
                ExpiresAt = reader.GetDateTime(4),
                UpdatedAt = reader.GetDateTime(5)
            };
        }
        return null;
    }

    public async Task SaveToken(StravaToken token)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO strava_tokens (athlete_id, access_token, refresh_token, expires_at, updated_at)
            VALUES (@athlete_id, @access_token, @refresh_token, @expires_at, NOW())
            ON CONFLICT (athlete_id) DO UPDATE SET
                access_token = @access_token,
                refresh_token = @refresh_token,
                expires_at = @expires_at,
                updated_at = NOW()", conn);

        cmd.Parameters.AddWithValue("athlete_id", token.AthleteId);
        cmd.Parameters.AddWithValue("access_token", token.AccessToken);
        cmd.Parameters.AddWithValue("refresh_token", token.RefreshToken);
        cmd.Parameters.AddWithValue("expires_at", token.ExpiresAt);

        await cmd.ExecuteNonQueryAsync();
    }

    public async Task DeleteToken()
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand("DELETE FROM strava_tokens", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<IEnumerable<StravaActivity>> GetAllActivities()
    {
        var activities = new List<StravaActivity>();
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            SELECT id, athlete_id, name, activity_type, distance_meters, moving_time_seconds,
                   elapsed_time_seconds, total_elevation_gain, start_date, start_date_local,
                   average_speed, max_speed, average_heartrate, max_heartrate, summary_polyline,
                   calories, created_at
            FROM strava_activities
            ORDER BY start_date DESC", conn);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            activities.Add(MapActivity(reader));
        }
        return activities;
    }

    public async Task<StravaActivity?> GetActivityById(long id)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            SELECT id, athlete_id, name, activity_type, distance_meters, moving_time_seconds,
                   elapsed_time_seconds, total_elevation_gain, start_date, start_date_local,
                   average_speed, max_speed, average_heartrate, max_heartrate, summary_polyline,
                   calories, created_at
            FROM strava_activities
            WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return MapActivity(reader);
        }
        return null;
    }

    public async Task<DateTime?> GetLatestActivityDate()
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "SELECT MAX(start_date) FROM strava_activities", conn);

        var result = await cmd.ExecuteScalarAsync();
        return result == DBNull.Value ? null : (DateTime?)result;
    }

    public async Task SaveActivities(IEnumerable<StravaActivity> activities)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        foreach (var activity in activities)
        {
            await using var cmd = new NpgsqlCommand(@"
                INSERT INTO strava_activities (
                    id, athlete_id, name, activity_type, distance_meters, moving_time_seconds,
                    elapsed_time_seconds, total_elevation_gain, start_date, start_date_local,
                    average_speed, max_speed, average_heartrate, max_heartrate, summary_polyline,
                    calories, created_at
                ) VALUES (
                    @id, @athlete_id, @name, @activity_type, @distance_meters, @moving_time_seconds,
                    @elapsed_time_seconds, @total_elevation_gain, @start_date, @start_date_local,
                    @average_speed, @max_speed, @average_heartrate, @max_heartrate, @summary_polyline,
                    @calories, NOW()
                )
                ON CONFLICT (id) DO UPDATE SET
                    name = @name,
                    activity_type = @activity_type,
                    distance_meters = @distance_meters,
                    moving_time_seconds = @moving_time_seconds,
                    elapsed_time_seconds = @elapsed_time_seconds,
                    total_elevation_gain = @total_elevation_gain,
                    average_speed = @average_speed,
                    max_speed = @max_speed,
                    average_heartrate = @average_heartrate,
                    max_heartrate = @max_heartrate,
                    summary_polyline = @summary_polyline,
                    calories = @calories", conn);

            cmd.Parameters.AddWithValue("id", activity.Id);
            cmd.Parameters.AddWithValue("athlete_id", activity.AthleteId);
            cmd.Parameters.AddWithValue("name", activity.Name);
            cmd.Parameters.AddWithValue("activity_type", activity.ActivityType);
            cmd.Parameters.AddWithValue("distance_meters", activity.DistanceMeters);
            cmd.Parameters.AddWithValue("moving_time_seconds", activity.MovingTimeSeconds);
            cmd.Parameters.AddWithValue("elapsed_time_seconds", activity.ElapsedTimeSeconds);
            cmd.Parameters.AddWithValue("total_elevation_gain", (object?)activity.TotalElevationGain ?? DBNull.Value);
            cmd.Parameters.AddWithValue("start_date", activity.StartDate);
            cmd.Parameters.AddWithValue("start_date_local", activity.StartDateLocal);
            cmd.Parameters.AddWithValue("average_speed", (object?)activity.AverageSpeed ?? DBNull.Value);
            cmd.Parameters.AddWithValue("max_speed", (object?)activity.MaxSpeed ?? DBNull.Value);
            cmd.Parameters.AddWithValue("average_heartrate", (object?)activity.AverageHeartrate ?? DBNull.Value);
            cmd.Parameters.AddWithValue("max_heartrate", (object?)activity.MaxHeartrate ?? DBNull.Value);
            cmd.Parameters.AddWithValue("summary_polyline", (object?)activity.SummaryPolyline ?? DBNull.Value);
            cmd.Parameters.AddWithValue("calories", (object?)activity.Calories ?? DBNull.Value);

            await cmd.ExecuteNonQueryAsync();
        }
    }

    public async Task DeleteAllActivities()
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand("DELETE FROM strava_activities", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    private static StravaActivity MapActivity(NpgsqlDataReader reader)
    {
        return new StravaActivity
        {
            Id = reader.GetInt64(0),
            AthleteId = reader.GetInt64(1),
            Name = reader.GetString(2),
            ActivityType = reader.GetString(3),
            DistanceMeters = reader.GetDecimal(4),
            MovingTimeSeconds = reader.GetInt32(5),
            ElapsedTimeSeconds = reader.GetInt32(6),
            TotalElevationGain = reader.IsDBNull(7) ? null : reader.GetDecimal(7),
            StartDate = reader.GetDateTime(8),
            StartDateLocal = reader.GetDateTime(9),
            AverageSpeed = reader.IsDBNull(10) ? null : reader.GetDecimal(10),
            MaxSpeed = reader.IsDBNull(11) ? null : reader.GetDecimal(11),
            AverageHeartrate = reader.IsDBNull(12) ? null : reader.GetDecimal(12),
            MaxHeartrate = reader.IsDBNull(13) ? null : reader.GetInt32(13),
            SummaryPolyline = reader.IsDBNull(14) ? null : reader.GetString(14),
            Calories = reader.IsDBNull(15) ? null : reader.GetInt32(15),
            CreatedAt = reader.GetDateTime(16)
        };
    }
}
