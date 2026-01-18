import { BrowserRouter, Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState, useRef } from 'react';
import './App.css';

interface BlogPost {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  location?: string;
  authorName?: string;
}

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5252';
const API_URL = `${API_BASE}/api/posts`;
const AUTH_URL = `${API_BASE}/api/auth`;
const IMAGE_URL = `${API_BASE}/api/images`;
const MOVIES_URL = `${API_BASE}/api/movies`;
const STRAVA_URL = `${API_BASE}/api/strava`;

// Token management
const TOKEN_KEY = 'rb_auth_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function formatDateTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short'
  });
}

function PostMeta({ createdAt, location }: { createdAt: string; location?: string }) {
  return (
    <div className="meta">
      <span>{formatDateTime(createdAt)}</span>
      {location && (
        <span className="location">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          {location}
        </span>
      )}
    </div>
  );
}

async function detectLocation(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          );
          const data = await res.json();
          const city = data.address?.city || data.address?.town || data.address?.village;
          const country = data.address?.country;
          resolve(city ? `${city}, ${country}` : null);
        } catch {
          resolve(null);
        }
      },
      () => resolve(null)
    );
  });
}

// Parse image markdown with optional dimensions: ![alt](url =WIDTHx) or ![alt](url =WIDTHxHEIGHT)
function parseImageMarkdown(content: string) {
  const regex = /!\[(.*?)\]\(([^)\s]+)(?:\s*=(\d+)?x(\d+)?)?\)/g;
  const parts: Array<{
    type: 'text' | 'image';
    value: string;
    alt?: string;
    url?: string;
    width?: number;
    height?: number;
  }> = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: 'image',
      value: match[0],
      alt: match[1],
      url: match[2],
      width: match[3] ? parseInt(match[3]) : undefined,
      height: match[4] ? parseInt(match[4]) : undefined,
    });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push({ type: 'text', value: content.slice(lastIndex) });
  }

  return parts;
}


// Render content for display (non-editable)
function renderContent(content: string) {
  const parts = parseImageMarkdown(content);
  return parts.map((part, i) => {
    if (part.type === 'image') {
      const style: React.CSSProperties = part.width ? { width: part.width } : {};
      return <img key={i} src={part.url} alt={part.alt || ''} style={style} />;
    }
    return <span key={i}>{part.value}</span>;
  });
}

// Movie types
interface Movie {
  id: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
  overview: string | null;
  voteAverage: number | null;
}

interface Director {
  id: number;
  name: string;
  profilePath: string | null;
}

interface StravaActivity {
  id: number;
  name: string;
  activityType: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  startDateLocal: string;
  totalElevationGain?: number;
  averageHeartrate?: number;
  locationCity?: string;
  locationState?: string;
  locationCountry?: string;
}

interface PersonalBest {
  name: string;
  distanceMeters: number;
  bestTimeSeconds: number;
  achievedDate: string;
  activityId: number;
}

interface StravaStats {
  totalRuns: number;
  totalDistanceKm: number;
  totalTimeMinutes: number;
  totalElevationGain: number;
  averagePaceMinPerKm: number;
  lastRunDate?: string;
}

interface CubeSolve {
  id: string;
  timeMs: number;
  scramble: string;
  dnf: boolean;
  plusTwo: boolean;
  createdAt: string;
}

const LIKED_MOVIES_KEY = 'rb_liked_movies';
const LIKED_DIRECTORS_KEY = 'rb_liked_directors';
const SEEN_MOVIES_KEY = 'rb_seen_movies';

function Recommend() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [directorQuery, setDirectorQuery] = useState('');
  const [directorResults, setDirectorResults] = useState<Director[]>([]);
  const [likedMovies, setLikedMovies] = useState<Movie[]>(() => {
    const saved = localStorage.getItem(LIKED_MOVIES_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [likedDirectors, setLikedDirectors] = useState<Director[]>(() => {
    const saved = localStorage.getItem(LIKED_DIRECTORS_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [seenIds, setSeenIds] = useState<number[]>(() => {
    const saved = localStorage.getItem(SEEN_MOVIES_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [recommendations, setRecommendations] = useState<Movie[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchingDirectors, setSearchingDirectors] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const directorSearchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Save liked movies to localStorage
  useEffect(() => {
    localStorage.setItem(LIKED_MOVIES_KEY, JSON.stringify(likedMovies));
  }, [likedMovies]);

  // Save liked directors to localStorage
  useEffect(() => {
    localStorage.setItem(LIKED_DIRECTORS_KEY, JSON.stringify(likedDirectors));
  }, [likedDirectors]);

  // Save seen movies to localStorage
  useEffect(() => {
    localStorage.setItem(SEEN_MOVIES_KEY, JSON.stringify(seenIds));
  }, [seenIds]);

  // Search movies with debounce
  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${MOVIES_URL}/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data);
        }
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (searchTimeout.current) clearTimeout(searchTimeout.current);
    };
  }, [searchQuery]);

  // Search directors with debounce
  useEffect(() => {
    if (directorSearchTimeout.current) clearTimeout(directorSearchTimeout.current);

    if (!directorQuery.trim()) {
      setDirectorResults([]);
      return;
    }

    directorSearchTimeout.current = setTimeout(async () => {
      setSearchingDirectors(true);
      try {
        const res = await fetch(`${MOVIES_URL}/directors/search?q=${encodeURIComponent(directorQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setDirectorResults(data);
        }
      } catch (err) {
        console.error('Director search failed:', err);
      } finally {
        setSearchingDirectors(false);
      }
    }, 300);

    return () => {
      if (directorSearchTimeout.current) clearTimeout(directorSearchTimeout.current);
    };
  }, [directorQuery]);

  const addMovie = (movie: Movie) => {
    if (!likedMovies.find(m => m.id === movie.id)) {
      setLikedMovies([...likedMovies, movie]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeMovie = (id: number) => {
    setLikedMovies(likedMovies.filter(m => m.id !== id));
  };

  const addDirector = (director: Director) => {
    if (!likedDirectors.find(d => d.id === director.id)) {
      setLikedDirectors([...likedDirectors, director]);
    }
    setDirectorQuery('');
    setDirectorResults([]);
  };

  const removeDirector = (id: number) => {
    setLikedDirectors(likedDirectors.filter(d => d.id !== id));
  };

  const getRecommendations = async () => {
    if (likedMovies.length === 0 && likedDirectors.length === 0) return;

    setLoading(true);
    try {
      const res = await fetch(`${MOVIES_URL}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieIds: likedMovies.map(m => m.id),
          directorIds: likedDirectors.map(d => d.id),
          excludeIds: seenIds
        })
      });

      if (res.ok) {
        const data = await res.json();
        setRecommendations(data.recommendations || []);
        setCurrentIndex(0);
      }
    } catch (err) {
      console.error('Failed to get recommendations:', err);
    } finally {
      setLoading(false);
    }
  };

  const markSeen = () => {
    const current = recommendations[currentIndex];
    if (current) {
      setSeenIds([...seenIds, current.id]);
      if (currentIndex < recommendations.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // Fetch more recommendations
        getRecommendations();
      }
    }
  };

  const currentRecommendation = recommendations[currentIndex];
  const posterUrl = currentRecommendation?.posterPath
    ? `https://image.tmdb.org/t/p/w500${currentRecommendation.posterPath}`
    : null;

  return (
    <div className="recommend-page">
      <Link to="/" className="back-link">&larr; Home</Link>

      <h2>Movie Recommendations</h2>
      <p className="recommend-intro">Add movies you like, and we'll recommend similar ones!</p>

      <div className="search-sections">
        <div className="movie-search">
          <h3>Add movies you like</h3>
          <input
            type="text"
            placeholder="Search for a movie..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="movie-search-input"
          />
          {searching && <div className="search-loading">Searching...</div>}
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map(movie => (
                <button
                  key={movie.id}
                  className="search-result-item"
                  onClick={() => addMovie(movie)}
                >
                  <span className="movie-title">{movie.title}</span>
                  {movie.releaseDate && (
                    <span className="movie-year">({movie.releaseDate.split('-')[0]})</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="director-search">
          <h3>Add favorite directors</h3>
          <input
            type="text"
            placeholder="Search for a director..."
            value={directorQuery}
            onChange={e => setDirectorQuery(e.target.value)}
            className="movie-search-input"
          />
          {searchingDirectors && <div className="search-loading">Searching...</div>}
          {directorResults.length > 0 && (
            <div className="search-results">
              {directorResults.map(director => (
                <button
                  key={director.id}
                  className="search-result-item"
                  onClick={() => addDirector(director)}
                >
                  <span className="movie-title">{director.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {(likedMovies.length > 0 || likedDirectors.length > 0) && (
        <div className="liked-section">
          {likedMovies.length > 0 && (
            <div className="liked-movies">
              <h3>Movies you like:</h3>
              <div className="liked-movies-list">
                {likedMovies.map(movie => (
                  <div key={movie.id} className="liked-movie-chip">
                    <span>{movie.title}</span>
                    <button onClick={() => removeMovie(movie.id)} className="remove-movie">&times;</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {likedDirectors.length > 0 && (
            <div className="liked-directors">
              <h3>Directors you like:</h3>
              <div className="liked-movies-list">
                {likedDirectors.map(director => (
                  <div key={director.id} className="liked-movie-chip director-chip">
                    <span>{director.name}</span>
                    <button onClick={() => removeDirector(director.id)} className="remove-movie">&times;</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            className="get-recommendations-btn"
            onClick={getRecommendations}
            disabled={loading}
          >
            {loading ? 'Finding movies...' : 'Get Recommendations'}
          </button>
        </div>
      )}

      {currentRecommendation && (
        <div className="recommendation">
          <h3>You might like:</h3>
          <div className="recommendation-card">
            {posterUrl && (
              <img src={posterUrl} alt={currentRecommendation.title} className="recommendation-poster" />
            )}
            <div className="recommendation-info">
              <h4>{currentRecommendation.title}</h4>
              <div className="recommendation-meta">
                {currentRecommendation.releaseDate && (
                  <span className="recommendation-year">{currentRecommendation.releaseDate.split('-')[0]}</span>
                )}
                {currentRecommendation.voteAverage && (
                  <span className="recommendation-rating">★ {currentRecommendation.voteAverage.toFixed(1)}</span>
                )}
              </div>
              {currentRecommendation.overview && (
                <p className="recommendation-overview">{currentRecommendation.overview}</p>
              )}
              <button className="seen-btn" onClick={markSeen}>
                Seen it - show another
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tmdb-attribution">
        <img
          src="https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg"
          alt="TMDb logo"
          className="tmdb-logo"
        />
        <p>This product uses the TMDb API but is not endorsed or certified by TMDb.</p>
      </div>
    </div>
  );
}

function formatPace(minPerKm: number): string {
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatDistance(meters: number): string {
  const km = meters / 1000;
  return km >= 10 ? km.toFixed(1) : km.toFixed(2);
}

function Runs({ isAdmin }: { isAdmin: boolean }) {
  const [activities, setActivities] = useState<StravaActivity[]>([]);
  const [stats, setStats] = useState<StravaStats | null>(null);
  const [pbs, setPbs] = useState<PersonalBest[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [visibleCount, setVisibleCount] = useState(5);
  const PAGE_SIZE = 5;

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statusRes, activitiesRes, statsRes, pbsRes] = await Promise.all([
        fetch(`${STRAVA_URL}/status`),
        fetch(`${STRAVA_URL}/activities`),
        fetch(`${STRAVA_URL}/stats`),
        fetch(`${STRAVA_URL}/pbs`)
      ]);

      if (statusRes.ok) {
        const { connected: isConnected } = await statusRes.json();
        setConnected(isConnected);
      }
      if (activitiesRes.ok) {
        setActivities(await activitiesRes.json());
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (pbsRes.ok) {
        setPbs(await pbsRes.json());
      }
    } catch (err) {
      console.error('Failed to fetch Strava data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleConnect = async () => {
    const redirectUri = `${window.location.origin}/strava/callback`;
    try {
      const res = await fetch(`${STRAVA_URL}/auth/url?redirectUri=${encodeURIComponent(redirectUri)}`, {
        headers: authHeaders()
      });
      if (res.ok) {
        const { url } = await res.json();
        window.location.href = url;
      }
    } catch (err) {
      console.error('Failed to get auth URL:', err);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch(`${STRAVA_URL}/sync`, {
        method: 'POST',
        headers: authHeaders()
      });
      if (res.ok) {
        await fetchData();
      }
    } catch (err) {
      console.error('Sync failed:', err);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect Strava? This will remove all synced activities.')) return;
    try {
      await fetch(`${STRAVA_URL}/disconnect`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      setConnected(false);
      setActivities([]);
      setStats(null);
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="runs-page">
        <Link to="/" className="back-link">&larr; Home</Link>
        <h2>Running</h2>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="runs-page">
      <Link to="/" className="back-link">&larr; Home</Link>

      <h2>Running</h2>

      {isAdmin && (
        <div className="admin-actions">
          {connected ? (
            <>
              <button onClick={handleSync} disabled={syncing} className="sync-btn">
                {syncing ? 'Syncing...' : 'Sync Activities'}
              </button>
              <button onClick={handleDisconnect} className="disconnect-btn">
                Disconnect
              </button>
            </>
          ) : (
            <button onClick={handleConnect} className="connect-btn">
              Connect Strava
            </button>
          )}
        </div>
      )}

      {stats && stats.totalRuns > 0 && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.totalRuns}</div>
            <div className="stat-label">Runs</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.totalDistanceKm.toFixed(1)}</div>
            <div className="stat-label">Total km</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{formatPace(stats.averagePaceMinPerKm)}</div>
            <div className="stat-label">Avg pace /km</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{Math.round(stats.totalElevationGain)}</div>
            <div className="stat-label">Elevation (m)</div>
          </div>
        </div>
      )}

      {pbs.length > 0 && (
        <div className="pbs-section">
          <h3>Personal Bests</h3>
          <div className="pbs-grid">
            {pbs.map(pb => (
              <div key={pb.name} className="pb-card">
                <div className="pb-distance">{pb.name}</div>
                <div className="pb-time">{formatDuration(pb.bestTimeSeconds)}</div>
                <div className="pb-date">
                  {new Date(pb.achievedDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activities.length === 0 ? (
        <p className="empty-state">
          {connected ? 'No activities yet. Click Sync to fetch your runs.' : 'Connect Strava to see your running activities.'}
        </p>
      ) : (
        <>
          <div className="activity-list">
            {activities.slice(0, visibleCount).map(activity => {
              const paceMinPerKm = (activity.movingTimeSeconds / 60) / (activity.distanceMeters / 1000);
              return (
                <div key={activity.id} className="activity-item">
                  <div className="activity-header">
                    <div className="activity-title-row">
                      <span className="activity-name">{activity.name}</span>
                      <span className="activity-date">
                        {new Date(activity.startDateLocal).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                    {(activity.locationCity || activity.locationCountry) && (
                      <span className="activity-location">
                        {[activity.locationCity, activity.locationCountry].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  <div className="activity-stats">
                    <span className="activity-stat">
                      <strong>{formatDistance(activity.distanceMeters)}</strong> km
                    </span>
                    <span className="activity-stat">
                      <strong>{formatPace(paceMinPerKm)}</strong> /km
                    </span>
                    <span className="activity-stat">
                      <strong>{formatDuration(activity.movingTimeSeconds)}</strong>
                    </span>
                    {activity.totalElevationGain && activity.totalElevationGain > 0 && (
                      <span className="activity-stat">
                        <strong>{Math.round(activity.totalElevationGain)}</strong>m elev
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {visibleCount < activities.length && (
            <button
              className="load-more-btn"
              onClick={() => setVisibleCount(visibleCount + PAGE_SIZE)}
            >
              Load More ({activities.length - visibleCount} remaining)
            </button>
          )}
        </>
      )}

      <div className="strava-attribution">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="#FC4C02">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
        </svg>
        <p>Powered by Strava</p>
      </div>
    </div>
  );
}

function StravaCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const errorParam = params.get('error');

    if (errorParam) {
      setStatus('error');
      setError('Authorization was denied');
      return;
    }

    if (!code) {
      setStatus('error');
      setError('No authorization code received');
      return;
    }

    const exchangeCode = async () => {
      try {
        const res = await fetch(`${STRAVA_URL}/auth/callback`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders()
          },
          body: JSON.stringify({ code })
        });

        if (res.ok) {
          setStatus('success');
          setTimeout(() => navigate('/runs'), 1500);
        } else {
          const data = await res.json();
          setStatus('error');
          setError(data.error || 'Failed to connect');
        }
      } catch (err) {
        setStatus('error');
        setError('Connection failed');
      }
    };

    exchangeCode();
  }, [navigate]);

  return (
    <div className="strava-callback">
      <Link to="/" className="back-link">&larr; Back to posts</Link>
      {status === 'loading' && <p>Connecting to Strava...</p>}
      {status === 'success' && <p>Connected! Redirecting to runs...</p>}
      {status === 'error' && (
        <>
          <p className="error">Error: {error}</p>
          <Link to="/runs">Go to runs</Link>
        </>
      )}
    </div>
  );
}

// Cubing Timer Component
function generateScramble(): string {
  const faces = ['R', 'L', 'U', 'D', 'F', 'B'];
  const modifiers = ['', "'", '2'];
  const parallel: Record<string, string> = { R: 'L', L: 'R', U: 'D', D: 'U', F: 'B', B: 'F' };

  const moves: string[] = [];
  let lastFace = '';
  let secondLastFace = '';

  for (let i = 0; i < 20; i++) {
    let face: string;
    do {
      face = faces[Math.floor(Math.random() * 6)];
    } while (face === lastFace || (face === parallel[lastFace] && secondLastFace === parallel[lastFace]));

    const modifier = modifiers[Math.floor(Math.random() * 3)];
    moves.push(face + modifier);
    secondLastFace = lastFace;
    lastFace = face;
  }

  return moves.join(' ');
}

function formatTime(ms: number, plusTwo: boolean = false): string {
  const adjusted = plusTwo ? ms + 2000 : ms;
  const totalSeconds = adjusted / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}:${seconds.toFixed(2).padStart(5, '0')}`;
  }
  return seconds.toFixed(2);
}

function calculateAverage(solves: CubeSolve[], count: number): number | null {
  const validSolves = solves.filter(s => !s.dnf);
  if (validSolves.length < count) return null;

  const subset = solves.slice(0, count);
  const dnfCount = subset.filter(s => s.dnf).length;

  // If more than one DNF in the subset, the average is DNF
  if (dnfCount > 1) return null;

  const times = subset.map(s => {
    if (s.dnf) return Infinity;
    return s.plusTwo ? s.timeMs + 2000 : s.timeMs;
  });

  const sorted = [...times].sort((a, b) => a - b);
  // Remove best and worst
  const trimmed = sorted.slice(1, -1);

  if (trimmed.some(t => t === Infinity)) return null;

  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

const CUBING_SOLVES_KEY = 'rb_cubing_solves';

function Cubing() {
  const [solves, setSolves] = useState<CubeSolve[]>(() => {
    const saved = localStorage.getItem(CUBING_SOLVES_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [timerState, setTimerState] = useState<'idle' | 'ready' | 'running' | 'stopped'>('idle');
  const [startTime, setStartTime] = useState<number>(0);
  const [displayTime, setDisplayTime] = useState<number | null>(null);
  const [scramble, setScramble] = useState<string>(() => generateScramble());
  const [lastSolve, setLastSolve] = useState<CubeSolve | null>(null);
  const [visibleSolves, setVisibleSolves] = useState(10);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const SOLVES_PAGE_SIZE = 10;

  // Save solves to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(CUBING_SOLVES_KEY, JSON.stringify(solves));
  }, [solves]);

  const saveSolve = (timeMs: number, currentScramble: string) => {
    const newSolve: CubeSolve = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timeMs,
      scramble: currentScramble,
      dnf: false,
      plusTwo: false,
      createdAt: new Date().toISOString()
    };
    setLastSolve(newSolve);
    setSolves(prev => [newSolve, ...prev]);
  };

  const updateSolve = (id: string, updates: { dnf?: boolean; plusTwo?: boolean }) => {
    setSolves(prev => prev.map(s =>
      s.id === id ? { ...s, ...updates } : s
    ));
    if (lastSolve?.id === id) {
      setLastSolve(prev => prev ? { ...prev, ...updates } : null);
    }
  };

  const deleteSolve = (id: string) => {
    setSolves(prev => prev.filter(s => s.id !== id));
    if (lastSolve?.id === id) {
      setLastSolve(null);
    }
  };

  const deleteAllSolves = () => {
    if (!window.confirm('Delete all solves? This cannot be undone.')) return;
    setSolves([]);
    setLastSolve(null);
  };

  // Keyboard handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        if (timerState === 'idle' || timerState === 'stopped') {
          setScramble(generateScramble());
          setLastSolve(null);
          setTimerState('ready');
        } else if (timerState === 'running') {
          const elapsed = Date.now() - startTime;
          setDisplayTime(elapsed);
          setTimerState('stopped');
          saveSolve(elapsed, scramble);
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (timerState === 'ready') {
          setStartTime(Date.now());
          setDisplayTime(null);
          setTimerState('running');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timerState, startTime, scramble]);

  // Running timer display
  useEffect(() => {
    if (timerState === 'running') {
      timerRef.current = setInterval(() => {
        // We don't update display during running to hide the time
      }, 10);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerState]);

  // Reset for next solve
  const resetTimer = () => {
    setTimerState('idle');
    setDisplayTime(null);
    setScramble(generateScramble());
    setLastSolve(null);
  };

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    if (timerState === 'idle' || timerState === 'stopped') {
      setScramble(generateScramble());
      setLastSolve(null);
      setTimerState('ready');
    } else if (timerState === 'running') {
      const elapsed = Date.now() - startTime;
      setDisplayTime(elapsed);
      setTimerState('stopped');
      saveSolve(elapsed, scramble);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    if (timerState === 'ready') {
      setStartTime(Date.now());
      setDisplayTime(null);
      setTimerState('running');
    }
  };

  // Calculate stats
  const validSolves = solves.filter(s => !s.dnf);
  const bestTime = validSolves.length > 0
    ? Math.min(...validSolves.map(s => s.plusTwo ? s.timeMs + 2000 : s.timeMs))
    : null;
  const ao5 = calculateAverage(solves, 5);
  const ao12 = calculateAverage(solves, 12);
  const ao50 = calculateAverage(solves, 50);
  const ao100 = calculateAverage(solves, 100);
  const sessionMean = validSolves.length > 0
    ? validSolves.reduce((sum, s) => sum + (s.plusTwo ? s.timeMs + 2000 : s.timeMs), 0) / validSolves.length
    : null;

  const getTimerDisplay = () => {
    if (timerState === 'ready') return 'Ready...';
    if (timerState === 'running') return 'Solving...';
    if (timerState === 'stopped' && displayTime !== null) {
      return formatTime(displayTime, lastSolve?.plusTwo);
    }
    if (lastSolve) {
      if (lastSolve.dnf) return 'DNF';
      return formatTime(lastSolve.timeMs, lastSolve.plusTwo);
    }
    return '0.00';
  };

  const getTimerClass = () => {
    if (timerState === 'ready') return 'timer-display timer-ready';
    if (timerState === 'running') return 'timer-display timer-running';
    return 'timer-display';
  };

  return (
    <div className="cubing-page">
      <Link to="/" className="back-link">&larr; Home</Link>

      <h2>Cubing Timer</h2>

      <div className="scramble-display">{scramble}</div>

      <div
        className="timer-area"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className={getTimerClass()}>
          {lastSolve?.dnf ? 'DNF' : getTimerDisplay()}
          {lastSolve?.plusTwo && !lastSolve.dnf && <span className="plus-two-indicator">+2</span>}
        </div>
      </div>

      {timerState === 'stopped' && lastSolve && (
        <div className="solve-actions">
          <button
            className={`penalty-btn ${lastSolve.dnf ? 'active' : ''}`}
            onClick={() => updateSolve(lastSolve.id, { dnf: !lastSolve.dnf, plusTwo: false })}
          >
            DNF
          </button>
          <button
            className={`penalty-btn ${lastSolve.plusTwo ? 'active' : ''}`}
            onClick={() => updateSolve(lastSolve.id, { plusTwo: !lastSolve.plusTwo, dnf: false })}
            disabled={lastSolve.dnf}
          >
            +2
          </button>
          <button
            className="delete-solve-btn"
            onClick={() => { deleteSolve(lastSolve.id); resetTimer(); }}
          >
            Delete
          </button>
        </div>
      )}

      {(timerState === 'idle' || timerState === 'stopped') && solves.length > 0 && (
        <p className="timer-hint">Hold spacebar (or tap on mobile) to start next solve</p>
      )}

      {solves.length > 0 && (
        <>
          <div className="cubing-stats-grid">
            <div className="cubing-stat-card">
              <div className="cubing-stat-value">{bestTime ? formatTime(bestTime) : '-'}</div>
              <div className="cubing-stat-label">Best</div>
            </div>
            <div className="cubing-stat-card">
              <div className="cubing-stat-value">{ao5 ? formatTime(ao5) : '-'}</div>
              <div className="cubing-stat-label">Ao5</div>
            </div>
            <div className="cubing-stat-card">
              <div className="cubing-stat-value">{ao12 ? formatTime(ao12) : '-'}</div>
              <div className="cubing-stat-label">Ao12</div>
            </div>
            <div className="cubing-stat-card">
              <div className="cubing-stat-value">{ao50 ? formatTime(ao50) : '-'}</div>
              <div className="cubing-stat-label">Ao50</div>
            </div>
            <div className="cubing-stat-card">
              <div className="cubing-stat-value">{ao100 ? formatTime(ao100) : '-'}</div>
              <div className="cubing-stat-label">Ao100</div>
            </div>
            <div className="cubing-stat-card">
              <div className="cubing-stat-value">{sessionMean ? formatTime(sessionMean) : '-'}</div>
              <div className="cubing-stat-label">Mean</div>
            </div>
          </div>

          <div className="solves-section">
            <h3>Recent Solves ({solves.length})</h3>
            <div className="solves-list">
              {solves.slice(0, visibleSolves).map((solve, index) => (
                <div key={solve.id} className="solve-item">
                  <span className="solve-number">{solves.length - index}.</span>
                  <span className={`solve-time ${solve.dnf ? 'dnf' : ''}`}>
                    {solve.dnf ? 'DNF' : formatTime(solve.timeMs, solve.plusTwo)}
                    {solve.plusTwo && !solve.dnf && <span className="plus-two-badge">+2</span>}
                  </span>
                  <span className="solve-scramble" title={solve.scramble}>
                    {solve.scramble.substring(0, 20)}...
                  </span>
                  <button
                    className="solve-delete-btn"
                    onClick={() => deleteSolve(solve.id)}
                    title="Delete solve"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
            {visibleSolves < solves.length && (
              <button
                className="load-more-solves-btn"
                onClick={() => setVisibleSolves(v => v + SOLVES_PAGE_SIZE)}
              >
                Load More ({solves.length - visibleSolves} remaining)
              </button>
            )}
            <button className="clear-all-btn" onClick={deleteAllSolves}>
              Clear All Solves
            </button>
          </div>
        </>
      )}

      {solves.length === 0 && timerState === 'idle' && (
        <p className="empty-state">Hold spacebar (or tap on mobile) to start your first solve!</p>
      )}
    </div>
  );
}

function Layout({ children, isAdmin, onLogout }: { children: React.ReactNode; isAdmin: boolean; onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="layout">
      <button className="nav-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
        <svg viewBox="0 0 24 24" fill="currentColor">
          {menuOpen ? (
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          ) : (
            <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
          )}
        </svg>
      </button>

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <button className="sidebar-close" onClick={closeMenu} aria-label="Close menu">&times;</button>
        {isAdmin && (
          <Link to="/new" className="new-post-btn" onClick={closeMenu}>
            New post
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
            </svg>
          </Link>
        )}
        <h2>Navigate</h2>
        <ul>
          <li><Link to="/posts" onClick={closeMenu}>Blog Posts</Link></li>
          <li><Link to="/runs" onClick={closeMenu}>Running</Link></li>
          <li><Link to="/cubing" onClick={closeMenu}>Cubing Timer</Link></li>
          <li><Link to="/recommend" onClick={closeMenu}>Movie Recommendations</Link></li>
        </ul>
        {isAdmin && (
          <div className="user-section">
            <button className="logout-btn" onClick={() => { onLogout(); closeMenu(); }}>Logout</button>
          </div>
        )}
      </aside>

      <main className="main">
        <header className="header">
          <Link to="/"><h1>RB Stuff</h1></Link>
          <div className="date">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </header>
        {children}
      </main>
    </div>
  );
}

function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${AUTH_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        const { token } = await res.json();
        setToken(token);
        onLogin();
        navigate('/');
      } else {
        setError('Invalid credentials');
      }
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-form">
      <h2>Admin Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          required
          autoComplete="username"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  );
}

function PostSkeleton() {
  return (
    <article className="post skeleton">
      <div className="skeleton-title"></div>
      <div className="skeleton-meta"></div>
      <div className="skeleton-content">
        <div className="skeleton-line"></div>
        <div className="skeleton-line"></div>
        <div className="skeleton-line short"></div>
      </div>
    </article>
  );
}

function Home({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="landing-page">
      {!isAdmin && (
        <Link to="/login" className="admin-login-btn">
          Login as Admin
        </Link>
      )}
      <Link to="/posts" className="feature-card feature-card-posts">
        <div className="feature-card-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
          </svg>
        </div>
        <div className="feature-card-content">
          <h3>Blog Posts</h3>
          <p>Read my thoughts and updates</p>
        </div>
        <svg className="feature-card-arrow" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
        </svg>
      </Link>

      <Link to="/runs" className="feature-card feature-card-strava">
        <div className="feature-card-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169"/>
          </svg>
        </div>
        <div className="feature-card-content">
          <h3>Running</h3>
          <p>View my running activities and stats from Strava</p>
        </div>
        <svg className="feature-card-arrow" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
        </svg>
      </Link>

      <Link to="/cubing" className="feature-card feature-card-cubing">
        <div className="feature-card-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H9V5h6v2z"/>
          </svg>
        </div>
        <div className="feature-card-content">
          <h3>Cubing Timer</h3>
          <p>Time your Rubik's cube solves with scrambles and stats</p>
        </div>
        <svg className="feature-card-arrow" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
        </svg>
      </Link>

      <Link to="/recommend" className="feature-card">
        <div className="feature-card-icon">
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
            <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
          </svg>
        </div>
        <div className="feature-card-content">
          <h3>Movie Recommendations</h3>
          <p>Get personalized movie suggestions based on your favorites</p>
        </div>
        <svg className="feature-card-arrow" viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
        </svg>
      </Link>
    </div>
  );
}

function Posts({ posts, loading, isAdmin, onPostDeleted }: { posts: BlogPost[]; loading: boolean; isAdmin: boolean; onPostDeleted: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;

    await fetch(`${API_URL}/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    onPostDeleted();
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} post${selected.size > 1 ? 's' : ''}?`)) return;

    setDeleting(true);
    try {
      await Promise.all(
        Array.from(selected).map(id =>
          fetch(`${API_URL}/${id}`, {
            method: 'DELETE',
            headers: authHeaders()
          })
        )
      );
      setSelected(new Set());
      onPostDeleted();
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === posts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(posts.map(p => p.id)));
    }
  };

  if (loading) {
    return (
      <>
        <Link to="/" className="back-link">&larr; Home</Link>
        <PostSkeleton />
        <PostSkeleton />
        <PostSkeleton />
      </>
    );
  }

  if (posts.length === 0) {
    return (
      <>
        <Link to="/" className="back-link">&larr; Home</Link>
        <p className="empty-state">No posts yet.</p>
      </>
    );
  }

  return (
    <>
      <div className="posts-header">
        <Link to="/" className="back-link">&larr; Home</Link>
        {isAdmin && (
          <Link to="/new" className="new-post-btn">+ New Post</Link>
        )}
      </div>
      {isAdmin && (
        <div className="bulk-actions">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={selected.size === posts.length}
              onChange={toggleSelectAll}
            />
            Select all
          </label>
          {selected.size > 0 && (
            <button
              className="bulk-delete-btn"
              onClick={handleDeleteSelected}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : `Delete ${selected.size} selected`}
            </button>
          )}
        </div>
      )}
      {posts.map(post => (
        <article key={post.id} className={`post ${selected.has(post.id) ? 'post-selected' : ''}`}>
          <h2>
            {isAdmin && (
              <input
                type="checkbox"
                className="post-checkbox"
                checked={selected.has(post.id)}
                onChange={() => toggleSelect(post.id)}
              />
            )}
            <Link to={`/post/${post.id}`}>{post.title}</Link>
            {isAdmin && (
              <>
                <Link to={`/edit/${post.id}`} className="edit-icon" title="Edit post">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </Link>
                <button onClick={() => handleDelete(post.id)} className="delete-icon" title="Delete post">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                    <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                  </svg>
                </button>
              </>
            )}
          </h2>
          <PostMeta createdAt={post.createdAt} location={post.location} />
          <div className="content">{renderContent(post.content.substring(0, 300))}...</div>
        </article>
      ))}
    </>
  );
}

function Post({ posts, isAdmin, onPostDeleted }: { posts: BlogPost[]; isAdmin: boolean; onPostDeleted: () => void }) {
  const { id } = useParams();
  const post = posts.find(p => p.id === id);
  const navigate = useNavigate();

  if (!post) {
    return <p>Post not found.</p>;
  }

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this post?')) return;

    await fetch(`${API_URL}/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });

    onPostDeleted();
    navigate('/');
  };

  return (
    <>
      <Link to="/posts" className="back-link">&larr; Back to posts</Link>
      <article className="post">
        <h2>
          {post.title}
          {isAdmin && (
            <>
              <Link to={`/edit/${post.id}`} className="edit-icon" title="Edit post">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                </svg>
              </Link>
              <button onClick={handleDelete} className="delete-icon" title="Delete post">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                </svg>
              </button>
            </>
          )}
        </h2>
        <PostMeta createdAt={post.createdAt} location={post.location} />
        <div className="content">{renderContent(post.content)}</div>
      </article>
    </>
  );
}

function NewPost({ onPostCreated }: { onPostCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [location, setLocation] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    detectLocation().then((loc) => {
      if (loc) setLocation(loc);
    });
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(IMAGE_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      if (res.ok) {
        const { url } = await res.json();
        setContent(content + `![](${url})`);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;

    await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ Title: title, Content: content, Location: location || null })
    });

    onPostCreated();
    navigate('/');
  };

  return (
    <>
      <Link to="/posts" className="back-link">&larr; Back to posts</Link>
      <article className="post">
        <h2>
          <input
            type="text"
            className="title-input"
            placeholder="type a title here"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </h2>
        <div className="meta">
          <span>{formatDateTime(new Date().toISOString())}</span>
          <span className="location">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <input
              type="text"
              className="location-input"
              placeholder="add location"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </span>
        </div>
        <textarea
          className="content-input"
          placeholder="type body here"
          value={content}
          onChange={e => setContent(e.target.value)}
        />
        <div className="post-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Add image'}
          </button>
          <button className="publish-btn" onClick={handleSubmit}>Publish</button>
        </div>
      </article>
    </>
  );
}

function EditPost({ posts, onPostUpdated }: { posts: BlogPost[]; onPostUpdated: () => void }) {
  const { id } = useParams();
  const post = posts.find(p => p.id === id);
  const [title, setTitle] = useState(post?.title || '');
  const [content, setContent] = useState(post?.content || '');
  const [location, setLocation] = useState(post?.location || '');
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setContent(post.content);
      setLocation(post.location || '');
    }
  }, [post]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(IMAGE_URL, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });

      if (res.ok) {
        const { url } = await res.json();
        setContent(content + `![](${url})`);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (!post) {
    return <p>Post not found.</p>;
  }

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;

    await fetch(`${API_URL}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ Title: title, Content: content, Location: location || null })
    });

    onPostUpdated();
    navigate(`/post/${id}`);
  };

  return (
    <>
      <Link to={`/post/${id}`} className="back-link">&larr; Back to post</Link>
      <article className="post">
        <h2>
          <input
            type="text"
            className="title-input"
            placeholder="type a title here"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />
        </h2>
        <div className="meta">
          <span>{formatDateTime(post.createdAt)}</span>
          <span className="location">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <input
              type="text"
              className="location-input"
              placeholder="add location"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </span>
        </div>
        <textarea
          className="content-input"
          placeholder="type body here"
          value={content}
          onChange={e => setContent(e.target.value)}
        />
        <div className="post-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="upload-btn"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? 'Uploading...' : 'Add image'}
          </button>
          <button className="publish-btn" onClick={handleSubmit}>Save</button>
        </div>
      </article>
    </>
  );
}

function App() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);

  const fetchPosts = async () => {
    setPostsLoading(true);
    try {
      const res = await fetch(API_URL);
      const data = await res.json();
      setPosts(data);
    } catch (err) {
      console.error(err);
    } finally {
      setPostsLoading(false);
    }
  };

  const checkAuth = async () => {
    const token = getToken();
    if (!token) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${AUTH_URL}/me`, {
        headers: authHeaders()
      });
      setIsAdmin(res.ok);
      if (!res.ok) clearToken();
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch(`${AUTH_URL}/logout`, {
      method: 'POST',
      headers: authHeaders()
    });
    clearToken();
    setIsAdmin(false);
  };

  useEffect(() => {
    checkAuth();
    fetchPosts();
  }, []);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <BrowserRouter>
      <Layout isAdmin={isAdmin} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Home isAdmin={isAdmin} />} />
          <Route path="/posts" element={<Posts posts={posts} loading={postsLoading} isAdmin={isAdmin} onPostDeleted={fetchPosts} />} />
          <Route path="/post/:id" element={<Post posts={posts} isAdmin={isAdmin} onPostDeleted={fetchPosts} />} />
          <Route path="/edit/:id" element={isAdmin ? <EditPost posts={posts} onPostUpdated={fetchPosts} /> : <LoginForm onLogin={() => { checkAuth(); }} />} />
          <Route path="/new" element={isAdmin ? <NewPost onPostCreated={fetchPosts} /> : <LoginForm onLogin={() => { checkAuth(); }} />} />
          <Route path="/login" element={<LoginForm onLogin={() => { checkAuth(); }} />} />
          <Route path="/recommend" element={<Recommend />} />
          <Route path="/runs" element={<Runs isAdmin={isAdmin} />} />
          <Route path="/strava/callback" element={<StravaCallback />} />
          <Route path="/cubing" element={<Cubing />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
