namespace Blog.Api;

public static class TokenStore
{
    // In-memory storage for session tokens (long-lived)
    private static readonly Dictionary<string, DateTime> _sessionTokens = new();

    public static void AddToken(string token, DateTime expiry)
    {
        _sessionTokens[token] = expiry;
        CleanupExpired();
    }

    public static void RemoveToken(string token)
    {
        _sessionTokens.Remove(token);
    }

    public static bool IsValidToken(string token)
    {
        return _sessionTokens.TryGetValue(token, out var expiry) && expiry > DateTime.UtcNow;
    }

    private static void CleanupExpired()
    {
        var expired = _sessionTokens.Where(t => t.Value < DateTime.UtcNow).Select(t => t.Key).ToList();
        foreach (var key in expired) _sessionTokens.Remove(key);
    }
}
