using Blog.Api.Models;

namespace Blog.Api.Stores;

public interface IBlogPostStore
{
    Task<IEnumerable<BlogPost>> GetAll();
    Task<BlogPost?> GetById(Guid id);
    Task<BlogPost> Create(BlogPost post, Guid userId);
    Task<BlogPost?> Update(Guid id, BlogPost post, Guid userId);
    Task<bool> Delete(Guid id, Guid userId);
}
