using Blog.Api.Stores;
using Blog.Api.Services;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("Blog")
    ?? "Host=localhost;Database=blog;Username=ross";

builder.Services.AddSingleton<IBlogPostStore>(new BlogPostStore(connectionString));
builder.Services.AddSingleton<IBlogPostService, BlogPostService>();
builder.Services.AddControllers();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader();
    });
});

var app = builder.Build();

app.UseCors();
app.MapControllers();

app.Run();
