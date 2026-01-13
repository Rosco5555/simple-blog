using Microsoft.Extensions.FileProviders;
using Blog.Api.Stores;
using Blog.Api.Services;
using Resend;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Blog")
    ?? "Host=localhost;Database=blog;Username=ross";

builder.Services.AddSingleton<IBlogPostStore>(new BlogPostStore(connectionString));
builder.Services.AddSingleton<IUserStore>(new UserStore(connectionString));
builder.Services.AddSingleton<IBlogPostService, BlogPostService>();
builder.Services.AddControllers();

// Resend email service
builder.Services.AddOptions();
builder.Services.AddHttpClient<ResendClient>();
builder.Services.Configure<ResendClientOptions>(o =>
{
    o.ApiToken = builder.Configuration["Resend:ApiKey"] ?? "";
});
builder.Services.AddTransient<IResend, ResendClient>();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins("http://localhost:3000", "http://localhost:5173")
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Ensure admin user exists
using (var conn = new Npgsql.NpgsqlConnection(connectionString))
{
    await conn.OpenAsync();
    using var cmd = new Npgsql.NpgsqlCommand(@"
        INSERT INTO users (id, username, display_name)
        VALUES ('00000000-0000-0000-0000-000000000001', 'admin', 'Admin')
        ON CONFLICT (id) DO NOTHING", conn);
    await cmd.ExecuteNonQueryAsync();
}

app.UseCors();

var uploadsPath = Path.Combine(builder.Environment.ContentRootPath, "uploads");
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads"
});

app.MapControllers();

app.Run();
