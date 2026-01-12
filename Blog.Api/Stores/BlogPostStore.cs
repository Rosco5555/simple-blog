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

    public async Task<IEnumerable<BlogPost>> GetAll()
    {
        var posts = new List<BlogPost>();
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "SELECT id, title, content, created_at FROM blog_posts ORDER BY created_at DESC", conn);
        await using var reader = await cmd.ExecuteReaderAsync();

        while (await reader.ReadAsync())
        {
            posts.Add(new BlogPost
            {
                Id = reader.GetGuid(0),
                Title = reader.GetString(1),
                Content = reader.GetString(2),
                CreatedAt = reader.GetDateTime(3)
            });
        }
        return posts;
    }

    public async Task<BlogPost?> GetById(Guid id)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(
            "SELECT id, title, content, created_at FROM blog_posts WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", id);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new BlogPost
            {
                Id = reader.GetGuid(0),
                Title = reader.GetString(1),
                Content = reader.GetString(2),
                CreatedAt = reader.GetDateTime(3)
            };
        }
        return null;
    }

    public async Task<BlogPost> Create(BlogPost post)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO blog_posts (title, content)
            VALUES (@title, @content)
            RETURNING id, created_at", conn);
        cmd.Parameters.AddWithValue("title", post.Title);
        cmd.Parameters.AddWithValue("content", post.Content);

        await using var reader = await cmd.ExecuteReaderAsync();
        await reader.ReadAsync();
        post.Id = reader.GetGuid(0);
        post.CreatedAt = reader.GetDateTime(1);
        return post;
    }

    public async Task<BlogPost?> Update(Guid id, BlogPost post)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand(@"
            UPDATE blog_posts SET title = @title, content = @content
            WHERE id = @id
            RETURNING id, title, content, created_at", conn);
        cmd.Parameters.AddWithValue("id", id);
        cmd.Parameters.AddWithValue("title", post.Title);
        cmd.Parameters.AddWithValue("content", post.Content);

        await using var reader = await cmd.ExecuteReaderAsync();
        if (await reader.ReadAsync())
        {
            return new BlogPost
            {
                Id = reader.GetGuid(0),
                Title = reader.GetString(1),
                Content = reader.GetString(2),
                CreatedAt = reader.GetDateTime(3)
            };
        }
        return null;
    }

    public async Task<bool> Delete(Guid id)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync();

        await using var cmd = new NpgsqlCommand("DELETE FROM blog_posts WHERE id = @id", conn);
        cmd.Parameters.AddWithValue("id", id);

        return await cmd.ExecuteNonQueryAsync() > 0;
    }
}
