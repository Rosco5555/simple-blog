using Blog.Api.Models;
using Blog.Api.Stores;

namespace Blog.Api.Services;

public class BlogPostService : IBlogPostService
{
    private readonly IBlogPostStore _store;

    public BlogPostService(IBlogPostStore store)
    {
        _store = store;
    }

    public async Task<IEnumerable<BlogPost>> GetAllPosts()
    {
        return await _store.GetAll();
    }

    public async Task<BlogPost?> GetPost(Guid id)
    {
        return await _store.GetById(id);
    }

    public async Task<BlogPost> CreatePost(string title, string content)
    {
        var post = new BlogPost
        {
            Title = title,
            Content = content
        };
        return await _store.Create(post);
    }

    public async Task<BlogPost?> UpdatePost(Guid id, string title, string content)
    {
        var post = new BlogPost
        {
            Title = title,
            Content = content
        };
        return await _store.Update(id, post);
    }

    public async Task<bool> DeletePost(Guid id)
    {
        return await _store.Delete(id);
    }
}
