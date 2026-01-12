using Blog.Api.Models;

namespace Blog.Api.Stores;

public interface IBlogPostStore
{
    Task<IEnumerable<BlogPost>> GetAll();
    Task<BlogPost?> GetById(Guid id);
    Task<BlogPost> Create(BlogPost post);
    Task<BlogPost?> Update(Guid id, BlogPost post);
    Task<bool> Delete(Guid id);
}
