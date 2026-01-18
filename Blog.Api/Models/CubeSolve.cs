namespace Blog.Api.Models;

public class CubeSolve
{
    public Guid Id { get; set; }
    public int TimeMs { get; set; }
    public string Scramble { get; set; } = string.Empty;
    public bool Dnf { get; set; }
    public bool PlusTwo { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
