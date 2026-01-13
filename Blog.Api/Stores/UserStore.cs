using Npgsql;
using Blog.Api.Models;

namespace Blog.Api.Stores;

public class UserStore : IUserStore
{
    private readonly string _connectionString;

    public UserStore(string connectionString)
    {
        _connectionString = connectionString;
    }

    public async Task<User?> GetById(Guid id)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "SELECT id, username, display_name, created_at FROM users WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new User
            {
                Id = reader.GetGuid(0),
                Username = reader.GetString(1),
                DisplayName = reader.GetString(2),
                CreatedAt = reader.GetDateTime(3)
            };
        }
        return null;
    }

    public async Task<User?> GetByUsername(string username)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "SELECT id, username, display_name, created_at, password_hash FROM users WHERE username = @username", conn);
        cmd.Parameters.AddWithValue("username", username);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new User
            {
                Id = reader.GetGuid(0),
                Username = reader.GetString(1),
                DisplayName = reader.GetString(2),
                CreatedAt = reader.GetDateTime(3),
                PasswordHash = reader.IsDBNull(4) ? null : reader.GetString(4)
            };
        }
        return null;
    }

    public async Task<User> Create(User user)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO users (username, display_name, password_hash)
            VALUES (@username, @display_name, @password_hash)
            RETURNING id, created_at", conn);
        cmd.Parameters.AddWithValue("username", user.Username);
        cmd.Parameters.AddWithValue("display_name", user.DisplayName);
        cmd.Parameters.AddWithValue("password_hash", (object?)user.PasswordHash ?? DBNull.Value);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        user.Id = reader.GetGuid(0);
        user.CreatedAt = reader.GetDateTime(1);
        return user;
    }
}
