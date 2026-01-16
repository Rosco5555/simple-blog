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
}

const LIKED_MOVIES_KEY = 'rb_liked_movies';
const SEEN_MOVIES_KEY = 'rb_seen_movies';

function Recommend() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Movie[]>([]);
  const [likedMovies, setLikedMovies] = useState<Movie[]>(() => {
    const saved = localStorage.getItem(LIKED_MOVIES_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [seenIds, setSeenIds] = useState<number[]>(() => {
    const saved = localStorage.getItem(SEEN_MOVIES_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [recommendations, setRecommendations] = useState<Movie[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Save liked movies to localStorage
  useEffect(() => {
    localStorage.setItem(LIKED_MOVIES_KEY, JSON.stringify(likedMovies));
  }, [likedMovies]);

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

  const getRecommendations = async () => {
    if (likedMovies.length === 0) return;

    setLoading(true);
    try {
      const res = await fetch(`${MOVIES_URL}/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          movieIds: likedMovies.map(m => m.id),
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
      <Link to="/" className="back-link">&larr; Back to posts</Link>

      <h2>Movie Recommendations</h2>
      <p className="recommend-intro">Add movies you like, and we'll recommend similar ones!</p>

      <div className="movie-search">
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
              {currentRecommendation.releaseDate && (
                <p className="recommendation-year">{currentRecommendation.releaseDate.split('-')[0]}</p>
              )}
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

      <p className="tmdb-attribution">
        This product uses the TMDb API but is not endorsed or certified by TMDb.
      </p>
    </div>
  );
}

function Layout({ children, posts, isAdmin, onLogout }: { children: React.ReactNode; posts: BlogPost[]; isAdmin: boolean; onLogout: () => void }) {
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
        <h2>Posts</h2>
        <ul>
          {posts.map(post => (
            <li key={post.id}>
              <Link to={`/post/${post.id}`} onClick={closeMenu}>{post.title}</Link>
            </li>
          ))}
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

function Home({ posts, loading }: { posts: BlogPost[]; loading: boolean }) {
  if (loading) {
    return (
      <>
        <PostSkeleton />
        <PostSkeleton />
        <PostSkeleton />
      </>
    );
  }

  if (posts.length === 0) {
    return <p className="empty-state">No posts yet.</p>;
  }

  return (
    <>
      {posts.map(post => (
        <article key={post.id} className="post">
          <h2><Link to={`/post/${post.id}`}>{post.title}</Link></h2>
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
      <Link to="/" className="back-link">&larr; Back to all posts</Link>
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
      <Link to="/" className="back-link">&larr; Back to all posts</Link>
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
      <Layout posts={posts} isAdmin={isAdmin} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Home posts={posts} loading={postsLoading} />} />
          <Route path="/post/:id" element={<Post posts={posts} isAdmin={isAdmin} onPostDeleted={fetchPosts} />} />
          <Route path="/edit/:id" element={isAdmin ? <EditPost posts={posts} onPostUpdated={fetchPosts} /> : <LoginForm onLogin={() => { checkAuth(); }} />} />
          <Route path="/new" element={isAdmin ? <NewPost onPostCreated={fetchPosts} /> : <LoginForm onLogin={() => { checkAuth(); }} />} />
          <Route path="/login" element={<LoginForm onLogin={() => { checkAuth(); }} />} />
          <Route path="/recommend" element={<Recommend />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
