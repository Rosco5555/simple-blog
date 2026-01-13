namespace Blog.Api.Models;

public class BlogPost
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public string? Location { get; set; }
    public Guid? UserId { get; set; }
    public string? AuthorName { get; set; }
}
