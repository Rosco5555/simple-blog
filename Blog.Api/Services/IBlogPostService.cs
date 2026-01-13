using Blog.Api.Models;

namespace Blog.Api.Services;

public interface IBlogPostService
{
    Task<IEnumerable<BlogPost>> GetAllPosts();
    Task<BlogPost?> GetPost(Guid id);
    Task<BlogPost> CreatePost(string title, string content, string? location, Guid userId);
    Task<BlogPost?> UpdatePost(Guid id, string title, string content, string? location, Guid userId);
    Task<bool> DeletePost(Guid id, Guid userId);
}
