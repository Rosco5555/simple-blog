using Blog.Api.Models;

namespace Blog.Api.Stores;

public interface ICubingStore
{
    Task<IEnumerable<CubeSolve>> GetAllSolves();
    Task<CubeSolve> AddSolve(CubeSolve solve);
    Task<bool> UpdateSolve(Guid id, bool? dnf, bool? plusTwo);
    Task<bool> DeleteSolve(Guid id);
    Task DeleteAllSolves();
}
