using Npgsql;
using Blog.Api.Models;

namespace Blog.Api.Stores;

public class CubingStore : ICubingStore
{
    private readonly string _connectionString;

    public CubingStore(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<IEnumerable<CubeSolve>> GetAllSolves()
    {
        var solves = new List<CubeSolve>();
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            SELECT id, time_ms, scramble, dnf, plus_two, created_at
            FROM cube_solves
            ORDER BY created_at DESC", conn);

        await using var reader = await cmd.ExecuteReaderAsync();
        while (await reader.ReadAsync())
        {
            solves.Add(new CubeSolve
            {
                Id = reader.GetGuid(0),
                TimeMs = reader.GetInt32(1),
                Scramble = reader.GetString(2),
                Dnf = reader.GetBoolean(3),
                PlusTwo = reader.GetBoolean(4),
                CreatedAt = reader.GetDateTime(5)
            });
        }
        return solves;
    }

    public async Task<CubeSolve> AddSolve(CubeSolve solve)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO cube_solves (time_ms, scramble, dnf, plus_two)
            VALUES (@time_ms, @scramble, @dnf, @plus_two)
            RETURNING id, created_at", conn);

        cmd.Parameters.AddWithValue("time_ms", solve.TimeMs);
        cmd.Parameters.AddWithValue("scramble", solve.Scramble);
        cmd.Parameters.AddWithValue("dnf", solve.Dnf);
        cmd.Parameters.AddWithValue("plus_two", solve.PlusTwo);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            solve.Id = reader.GetGuid(0);
            solve.CreatedAt = reader.GetDateTime(1);
        }
        return solve;
    }

    public async Task<bool> UpdateSolve(Guid id, bool? dnf, bool? plusTwo)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        var updates = new List<string>();
        if (dnf.HasValue) updates.Add("dnf = @dnf");
        if (plusTwo.HasValue) updates.Add("plus_two = @plus_two");

        if (updates.Count == 0) return false;

        var sql = $"UPDATE cube_solves SET {string.Join(", ", updates)} WHERE id = @id";
        await using var cmd = new NpgsqlCommand(sql, conn);

        cmd.Parameters.AddWithValue("id", id);
        if (dnf.HasValue) cmd.Parameters.AddWithValue("dnf", dnf.Value);
        if (plusTwo.HasValue) cmd.Parameters.AddWithValue("plus_two", plusTwo.Value);

        var rows = await cmd.ExecuteNonQueryAsync();
        return rows > 0;
    }

    public async Task<bool> DeleteSolve(Guid id)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "DELETE FROM cube_solves WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", id);

        var rows = await cmd.ExecuteNonQueryAsync();
        return rows > 0;
    }

    public async Task DeleteAllSolves()
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand("DELETE FROM cube_solves", conn);
        await cmd.ExecuteNonQueryAsync();
    }
}
