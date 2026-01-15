using Microsoft.Extensions.FileProviders;
using Blog.Api.Stores;
using Blog.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Support Railway's DATABASE_URL format or standard connection string
var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL");
if (!string.IsNullOrEmpty(connectionString) && connectionString.StartsWith("postgresql://"))
{
    // Convert postgresql://user:password@host:port/database to Npgsql format
    var uri = new Uri(connectionString);
    var userInfo = uri.UserInfo.Split(':');
    connectionString = $"Host={uri.Host};Port={uri.Port};Database={uri.AbsolutePath.TrimStart('/')};Username={userInfo[0]};Password={userInfo[1]};SSL Mode=Require;Trust Server Certificate=true";
}
else
{
    connectionString = builder.Configuration.GetConnectionString("Blog")
        ?? "Host=localhost;Database=blog;Username=ross";
}

builder.Services.AddSingleton<IBlogPostStore>(new BlogPostStore(connectionString));
builder.Services.AddSingleton<IUserStore>(new UserStore(connectionString));
builder.Services.AddSingleton<IBlogPostService, BlogPostService>();
builder.Services.AddControllers();

// CORS - allow configured origins or defaults for local dev
var allowedOrigins = Environment.GetEnvironmentVariable("ALLOWED_ORIGINS")?.Split(',')
    ?? new[] { "http://localhost:3000", "http://localhost:5173" };

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Run migrations and ensure admin user exists
using (var conn = new Npgsql.NpgsqlConnection(connectionString))
{
    await conn.OpenAsync();

    // Migration 001: Create blog_posts table
    await ExecuteSql(conn, @"
        CREATE TABLE IF NOT EXISTS blog_posts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )");

    // Migration 002: Add location column
    await ExecuteSql(conn, @"
        ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS location TEXT");

    // Migration 003: Create users table
    await ExecuteSql(conn, @"
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            username TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )");

    // Add user_id to blog_posts if not exists
    await ExecuteSql(conn, @"
        DO $$ BEGIN
            ALTER TABLE blog_posts ADD COLUMN user_id UUID REFERENCES users(id);
        EXCEPTION WHEN duplicate_column THEN END $$");

    // Migration 005: Add password_hash column
    await ExecuteSql(conn, @"
        ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT");

    // Migration 006: Create admin user with password
    await ExecuteSql(conn, @"
        INSERT INTO users (id, username, display_name, password_hash)
        VALUES ('00000000-0000-0000-0000-000000000001', 'admin', 'Admin', '$2b$12$YIRKQvem.pqmJQw0Rr42yuVoQHPMfA5XWWnyh2IvreHZ2GoIKoTdW')
        ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash WHERE users.password_hash IS NULL");
}

async Task ExecuteSql(Npgsql.NpgsqlConnection conn, string sql)
{
    try
    {
        using var cmd = new Npgsql.NpgsqlCommand(sql, conn);
        await cmd.ExecuteNonQueryAsync();
    }
    catch (Npgsql.PostgresException ex) when (ex.SqlState == "42701" || ex.SqlState == "42P07")
    {
        // Column or table already exists - ignore
    }
}

app.UseCors();

// Ensure uploads directory exists
var uploadsPath = Path.Combine(builder.Environment.ContentRootPath, "uploads");
Directory.CreateDirectory(uploadsPath);

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads"
});

app.MapControllers();

app.Run();
