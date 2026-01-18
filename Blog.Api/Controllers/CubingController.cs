using Microsoft.AspNetCore.Mvc;
using Blog.Api.Models;
using Blog.Api.Stores;

namespace Blog.Api.Controllers;

[ApiController]
[Route("api/cubing")]
public class CubingController : ControllerBase
{
    private readonly ICubingStore _store;

    public CubingController(ICubingStore store)
    {
        _store = store;
    }

    [HttpGet("solves")]
    public async Task<ActionResult<IEnumerable<CubeSolve>>> GetSolves()
    {
        var solves = await _store.GetAllSolves();
        return Ok(solves);
    }

    [HttpPost("solves")]
    public async Task<ActionResult<CubeSolve>> AddSolve([FromBody] CreateSolveRequest request)
    {
        var solve = new CubeSolve
        {
            TimeMs = request.TimeMs,
            Scramble = request.Scramble,
            Dnf = request.Dnf,
            PlusTwo = request.PlusTwo
        };

        var created = await _store.AddSolve(solve);
        return CreatedAtAction(nameof(GetSolves), created);
    }

    [HttpPatch("solves/{id}")]
    public async Task<ActionResult> UpdateSolve(Guid id, [FromBody] UpdateSolveRequest request)
    {
        var updated = await _store.UpdateSolve(id, request.Dnf, request.PlusTwo);
        if (!updated) return NotFound();
        return NoContent();
    }

    [HttpDelete("solves/{id}")]
    public async Task<ActionResult> DeleteSolve(Guid id)
    {
        var deleted = await _store.DeleteSolve(id);
        if (!deleted) return NotFound();
        return NoContent();
    }

    [HttpDelete("solves")]
    public async Task<ActionResult> DeleteAllSolves()
    {
        await _store.DeleteAllSolves();
        return NoContent();
    }
}

public record CreateSolveRequest(int TimeMs, string Scramble, bool Dnf = false, bool PlusTwo = false);
public record UpdateSolveRequest(bool? Dnf, bool? PlusTwo);
