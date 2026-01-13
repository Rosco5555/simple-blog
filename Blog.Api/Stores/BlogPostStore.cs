using Npgsql;
using Blog.Api.Models;

namespace Blog.Api.Stores;

public class BlogPostStore : IBlogPostStore
{
    private readonly string _connectionString;

    public BlogPostStore(string connectionString)
    {
        _connectionString = connectionString;
    }

    private async Task SetUserContext(NpgsqlConnection conn, Guid userId)
    {
        await using var cmd = new NpgsqlCommand(
            $"SET LOCAL app.current_user_id = '{userId}'", conn);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<IEnumerable<BlogPost>> GetAll()
    {
        var posts = new List<BlogPost>();
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            SELECT p.id, p.title, p.content, p.created_at, p.location, p.user_id, u.display_name
            FROM blog_posts p
            LEFT JOIN users u ON p.user_id = u.id
            ORDER BY p.created_at DESC", conn);
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            posts.Add(new BlogPost
            {
                Id = reader.GetGuid(0),
                Title = reader.GetString(1),
                Content = reader.GetString(2),
                CreatedAt = reader.GetDateTime(3),
                Location = reader.IsDBNull(4) ? null : reader.GetString(4),
                UserId = reader.IsDBNull(5) ? null : reader.GetGuid(5),
                AuthorName = reader.IsDBNull(6) ? null : reader.GetString(6)
            });
        }
        return posts;
    }

    public async Task<BlogPost?> GetById(Guid id)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            SELECT p.id, p.title, p.content, p.created_at, p.location, p.user_id, u.display_name
            FROM blog_posts p
            LEFT JOIN users u ON p.user_id = u.id
            WHERE p.id = @id", conn);
        cmd.Parameters.AddWithValue("id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new BlogPost
            {
                Id = reader.GetGuid(0),
                Title = reader.GetString(1),
                Content = reader.GetString(2),
                CreatedAt = reader.GetDateTime(3),
                Location = reader.IsDBNull(4) ? null : reader.GetString(4),
                UserId = reader.IsDBNull(5) ? null : reader.GetGuid(5),
                AuthorName = reader.IsDBNull(6) ? null : reader.GetString(6)
            };
        }
        return null;
    }

    public async Task<BlogPost> Create(BlogPost post, Guid userId)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var transaction = await conn.BeginTransactionAsync();
        await SetUserContext(conn, userId);

        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO blog_posts (title, content, location, user_id)
            VALUES (@title, @content, @location, @user_id)
            RETURNING id, created_at", conn);
        cmd.Parameters.AddWithValue("title", post.Title);
        cmd.Parameters.AddWithValue("content", post.Content);
        cmd.Parameters.AddWithValue("location", (object?)post.Location ?? DBNull.Value);
        cmd.Parameters.AddWithValue("user_id", userId);

        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            await reader.ReadAsync();
            post.Id = reader.GetGuid(0);
            post.CreatedAt = reader.GetDateTime(1);
            post.UserId = userId;
        }

        await transaction.CommitAsync();
        return post;
    }

    public async Task<BlogPost?> Update(Guid id, BlogPost post, Guid userId)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var transaction = await conn.BeginTransactionAsync();
        await SetUserContext(conn, userId);

        await using var cmd = new NpgsqlCommand(@"
            UPDATE blog_posts SET title = @title, content = @content, location = @location
            WHERE id = @id
            RETURNING id, title, content, created_at, location, user_id", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("title", post.Title);
        cmd.Parameters.AddWithValue("content", post.Content);
        cmd.Parameters.AddWithValue("location", (object?)post.Location ?? DBNull.Value);

        BlogPost? result = null;
        await using (var reader = await cmd.ExecuteReaderAsync())
        {
            if (await reader.ReadAsync())
            {
                result = new BlogPost
                {
                    Id = reader.GetGuid(0),
                    Title = reader.GetString(1),
                    Content = reader.GetString(2),
                    CreatedAt = reader.GetDateTime(3),
                    Location = reader.IsDBNull(4) ? null : reader.GetString(4),
                    UserId = reader.IsDBNull(5) ? null : reader.GetGuid(5)
                };
            }
        }

        await transaction.CommitAsync();
        return result;
    }

    public async Task<bool> Delete(Guid id, Guid userId)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var transaction = await conn.BeginTransactionAsync();
        await SetUserContext(conn, userId);

        await using var cmd = new NpgsqlCommand("DELETE FROM blog_posts WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", id);

        var result = await cmd.ExecuteNonQueryAsync() > 0;
        await transaction.CommitAsync();
        return result;
    }
}
