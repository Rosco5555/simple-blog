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

    public record MovieResult(int Id, string Title, string? PosterPath, string? ReleaseDate, string? Overview, double? VoteAverage);
    public record DirectorResult(int Id, string Name, string? ProfilePath);
    public record RecommendRequest(List<int> MovieIds, List<int>? DirectorIds, List<int>? ExcludeIds);

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
                    movie.TryGetProperty("overview", out var overview) ? overview.GetString() : null,
                    movie.TryGetProperty("vote_average", out var vote) ? vote.GetDouble() : null
                ));
            }

            return Ok(movies);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Failed to search movies", details = ex.Message });
        }
    }

    [HttpGet("directors/search")]
    public async Task<ActionResult> SearchDirectors([FromQuery] string q)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new { error = "Query required" });

        if (string.IsNullOrEmpty(_apiKey))
            return StatusCode(500, new { error = "TMDb API key not configured" });

        var url = $"{TmdbBaseUrl}/search/person?api_key={_apiKey}&query={Uri.EscapeDataString(q)}";

        try
        {
            var response = await _http.GetStringAsync(url);
            var json = JsonDocument.Parse(response);
            var results = json.RootElement.GetProperty("results");

            var directors = new List<DirectorResult>();
            foreach (var person in results.EnumerateArray().Take(10))
            {
                // Filter to people known for directing
                if (person.TryGetProperty("known_for_department", out var dept) &&
                    dept.GetString() == "Directing")
                {
                    directors.Add(new DirectorResult(
                        person.GetProperty("id").GetInt32(),
                        person.GetProperty("name").GetString() ?? "",
                        person.TryGetProperty("profile_path", out var profile) ? profile.GetString() : null
                    ));
                }
            }

            return Ok(directors);
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Failed to search directors", details = ex.Message });
        }
    }

    [HttpPost("recommend")]
    public async Task<ActionResult> Recommend([FromBody] RecommendRequest request)
    {
        var hasMovies = request.MovieIds != null && request.MovieIds.Count > 0;
        var hasDirectors = request.DirectorIds != null && request.DirectorIds.Count > 0;

        if (!hasMovies && !hasDirectors)
            return BadRequest(new { error = "At least one movie or director required" });

        if (string.IsNullOrEmpty(_apiKey))
            return StatusCode(500, new { error = "TMDb API key not configured" });

        var excludeSet = new HashSet<int>(request.MovieIds ?? new List<int>());
        if (request.ExcludeIds != null)
            excludeSet.UnionWith(request.ExcludeIds);

        var allCandidates = new Dictionary<int, (MovieResult Movie, int Score, HashSet<int> Genres)>();
        var inputGenres = new HashSet<int>();
        var inputDirectors = new HashSet<int>();

        // Add user-specified favorite directors
        if (request.DirectorIds != null)
        {
            foreach (var directorId in request.DirectorIds)
            {
                inputDirectors.Add(directorId);
            }
        }

        try
        {
            // Fetch top movies from favorite directors to seed recommendations
            if (hasDirectors)
            {
                foreach (var directorId in request.DirectorIds!)
                {
                    try
                    {
                        var creditsUrl = $"{TmdbBaseUrl}/person/{directorId}/movie_credits?api_key={_apiKey}";
                        var creditsResponse = await _http.GetStringAsync(creditsUrl);
                        var creditsJson = JsonDocument.Parse(creditsResponse);
                        if (creditsJson.RootElement.TryGetProperty("crew", out var crew))
                        {
                            // Get movies this person directed, sorted by popularity
                            var directedMovies = crew.EnumerateArray()
                                .Where(m => m.TryGetProperty("job", out var job) && job.GetString() == "Director")
                                .OrderByDescending(m => m.TryGetProperty("popularity", out var pop) ? pop.GetDouble() : 0)
                                .Take(5);

                            foreach (var movie in directedMovies)
                            {
                                var id = movie.GetProperty("id").GetInt32();
                                if (excludeSet.Contains(id))
                                    continue;

                                var movieGenres = new HashSet<int>();
                                if (movie.TryGetProperty("genre_ids", out var genreIds))
                                {
                                    foreach (var gid in genreIds.EnumerateArray())
                                    {
                                        movieGenres.Add(gid.GetInt32());
                                    }
                                }

                                var movieResult = new MovieResult(
                                    id,
                                    movie.GetProperty("title").GetString() ?? "",
                                    movie.TryGetProperty("poster_path", out var poster) ? poster.GetString() : null,
                                    movie.TryGetProperty("release_date", out var date) ? date.GetString() : null,
                                    movie.TryGetProperty("overview", out var overview) ? overview.GetString() : null,
                                    movie.TryGetProperty("vote_average", out var vote) ? vote.GetDouble() : null
                                );

                                // High score for movies by favorite directors
                                if (allCandidates.ContainsKey(id))
                                {
                                    var existing = allCandidates[id];
                                    existing.Genres.UnionWith(movieGenres);
                                    allCandidates[id] = (movieResult, existing.Score + 5, existing.Genres);
                                }
                                else
                                {
                                    allCandidates[id] = (movieResult, 5, movieGenres);
                                }
                            }
                        }
                    }
                    catch { /* continue if director credits fetch fails */ }
                }
            }

            // Get genres and directors from input movies
            foreach (var movieId in request.MovieIds ?? new List<int>())
            {
                var detailUrl = $"{TmdbBaseUrl}/movie/{movieId}?api_key={_apiKey}&append_to_response=credits";
                try
                {
                    var detailResponse = await _http.GetStringAsync(detailUrl);
                    var detailJson = JsonDocument.Parse(detailResponse);
                    if (detailJson.RootElement.TryGetProperty("genres", out var genres))
                    {
                        foreach (var genre in genres.EnumerateArray())
                        {
                            inputGenres.Add(genre.GetProperty("id").GetInt32());
                        }
                    }
                    // Extract directors from credits
                    if (detailJson.RootElement.TryGetProperty("credits", out var credits) &&
                        credits.TryGetProperty("crew", out var crew))
                    {
                        foreach (var member in crew.EnumerateArray())
                        {
                            if (member.TryGetProperty("job", out var job) &&
                                job.GetString() == "Director" &&
                                member.TryGetProperty("id", out var directorId))
                            {
                                inputDirectors.Add(directorId.GetInt32());
                            }
                        }
                    }
                }
                catch { /* continue if detail fetch fails */ }
            }

            // Fetch recommendations (better than similar) for each input movie
            foreach (var movieId in request.MovieIds ?? new List<int>())
            {
                // Use recommendations endpoint - gives better results than similar
                var url = $"{TmdbBaseUrl}/movie/{movieId}/recommendations?api_key={_apiKey}";
                var response = await _http.GetStringAsync(url);
                var json = JsonDocument.Parse(response);
                var results = json.RootElement.GetProperty("results");

                foreach (var movie in results.EnumerateArray())
                {
                    var id = movie.GetProperty("id").GetInt32();
                    if (excludeSet.Contains(id))
                        continue;

                    var movieGenres = new HashSet<int>();
                    if (movie.TryGetProperty("genre_ids", out var genreIds))
                    {
                        foreach (var gid in genreIds.EnumerateArray())
                        {
                            movieGenres.Add(gid.GetInt32());
                        }
                    }

                    var movieResult = new MovieResult(
                        id,
                        movie.GetProperty("title").GetString() ?? "",
                        movie.TryGetProperty("poster_path", out var poster) ? poster.GetString() : null,
                        movie.TryGetProperty("release_date", out var date) ? date.GetString() : null,
                        movie.TryGetProperty("overview", out var overview) ? overview.GetString() : null,
                        movie.TryGetProperty("vote_average", out var vote) ? vote.GetDouble() : null
                    );

                    if (allCandidates.ContainsKey(id))
                    {
                        var existing = allCandidates[id];
                        existing.Genres.UnionWith(movieGenres);
                        allCandidates[id] = (movieResult, existing.Score + 1, existing.Genres);
                    }
                    else
                    {
                        allCandidates[id] = (movieResult, 1, movieGenres);
                    }
                }
            }

            // Initial score by: appearances + genre overlap
            var scoredCandidates = allCandidates.Values
                .Select(x => {
                    var genreOverlap = x.Genres.Intersect(inputGenres).Count();
                    var initialScore = x.Score * 2 + genreOverlap;
                    return (x.Movie, initialScore);
                })
                .OrderByDescending(x => x.initialScore)
                .Take(30) // Limit to top 30 for director lookup
                .ToList();

            // Fetch credits for top candidates to check director overlap
            var finalScores = new List<(MovieResult Movie, int Score)>();
            foreach (var (movie, initialScore) in scoredCandidates)
            {
                var directorBonus = 0;
                if (inputDirectors.Count > 0)
                {
                    try
                    {
                        var creditsUrl = $"{TmdbBaseUrl}/movie/{movie.Id}/credits?api_key={_apiKey}";
                        var creditsResponse = await _http.GetStringAsync(creditsUrl);
                        var creditsJson = JsonDocument.Parse(creditsResponse);
                        if (creditsJson.RootElement.TryGetProperty("crew", out var crew))
                        {
                            foreach (var member in crew.EnumerateArray())
                            {
                                if (member.TryGetProperty("job", out var job) &&
                                    job.GetString() == "Director" &&
                                    member.TryGetProperty("id", out var directorId) &&
                                    inputDirectors.Contains(directorId.GetInt32()))
                                {
                                    directorBonus = 5; // Strong bonus for same director
                                    break;
                                }
                            }
                        }
                    }
                    catch { /* continue without director bonus */ }
                }
                finalScores.Add((movie, initialScore + directorBonus));
            }

            var recommendations = finalScores
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
