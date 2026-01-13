using Blog.Api.Models;

namespace Blog.Api.Stores;

public interface IUserStore
{
    Task<User?> GetById(Guid id);
    Task<User?> GetByUsername(string username);
    Task<User> Create(User user);
}
