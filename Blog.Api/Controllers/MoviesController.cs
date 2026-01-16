using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/movies")]
public class MoviesController : ControllerBase
{
    private readonly HttpClient _http;
    private readonly string _apiKey;
    private const string TmdbBaseUrl = "https://api.themoviedb.org/3";

    public MoviesController(IConfiguration config, IHttpClientFactory httpClientFactory)
    {
        _http = httpClientFactory.CreateClient();
        _apiKey = Environment.GetEnvironmentVariable("TMDB_API_KEY")
            ?? config["Tmdb:ApiKey"]
            ?? "";
    }

    public record MovieResult(int Id, string Title, string? PosterPath, string? ReleaseDate, string? Overview);
    public record RecommendRequest(List<int> MovieIds, List<int>? ExcludeIds);

    [HttpGet("search")]
    public async Task<ActionResult> Search([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new { error = "Query required" });

        if (string.IsNullOrEmpty(_apiKey))
            return StatusCode(500, new { error = "TMDb API key not configured" });

        var url = $"{TmdbBaseUrl}/search/movie?api_key={_apiKey}&query={Uri.EscapeDataString(q)}";

        try
        {
            var response = await _http.GetStringAsync(url);
            var json = JsonDocument.Parse(response);
            var results = json.RootElement.GetProperty("results");

            var movies = new List<MovieResult>();
            foreach (var movie in results.EnumerateArray().Take(10))
            {
                movies.Add(new MovieResult(
                    movie.GetProperty("id").GetInt32(),
                    movie.GetProperty("title").GetString() ?? "",
                    movie.TryGetProperty("poster_path", out var poster) ? poster.GetString() : null,
                    movie.TryGetProperty("release_date", out var date) ? date.GetString() : null,
                    movie.TryGetProperty("overview", out var overview) ? overview.GetString() : null
                ));
            }

            return Ok(movies);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Failed to search movies", details = ex.Message });
        }
    }

    [HttpPost("recommend")]
    public async Task<ActionResult> Recommend([FromBody] RecommendRequest request)
    {
        if (request.MovieIds == null || request.MovieIds.Count == 0)
            return BadRequest(new { error = "At least one movie ID required" });

        if (string.IsNullOrEmpty(_apiKey))
            return StatusCode(500, new { error = "TMDb API key not configured" });

        var excludeSet = new HashSet<int>(request.MovieIds);
        if (request.ExcludeIds != null)
            excludeSet.UnionWith(request.ExcludeIds);

        var allSimilar = new Dictionary<int, (MovieResult Movie, int Score)>();

        try
        {
            // Fetch similar movies for each input movie
            foreach (var movieId in request.MovieIds)
            {
                var url = $"{TmdbBaseUrl}/movie/{movieId}/similar?api_key={_apiKey}";
                var response = await _http.GetStringAsync(url);
                var json = JsonDocument.Parse(response);
                var results = json.RootElement.GetProperty("results");

                foreach (var movie in results.EnumerateArray())
                {
                    var id = movie.GetProperty("id").GetInt32();
                    if (excludeSet.Contains(id))
                        continue;

                    var movieResult = new MovieResult(
                        id,
                        movie.GetProperty("title").GetString() ?? "",
                        movie.TryGetProperty("poster_path", out var poster) ? poster.GetString() : null,
                        movie.TryGetProperty("release_date", out var date) ? date.GetString() : null,
                        movie.TryGetProperty("overview", out var overview) ? overview.GetString() : null
                    );

                    if (allSimilar.ContainsKey(id))
                    {
                        allSimilar[id] = (movieResult, allSimilar[id].Score + 1);
                    }
                    else
                    {
                        allSimilar[id] = (movieResult, 1);
                    }
                }
            }

            // Sort by score (movies similar to multiple inputs ranked higher)
            var recommendations = allSimilar.Values
                .OrderByDescending(x => x.Score)
                .Select(x => x.Movie)
                .ToList();

            return Ok(new { recommendations });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Failed to get recommendations", details = ex.Message });
        }
    }
}
