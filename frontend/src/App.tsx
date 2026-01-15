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

// Update markdown content with new image dimensions
function updateImageDimensions(content: string, imageIndex: number, newWidth: number): string {
  const regex = /!\[(.*?)\]\(([^)\s]+)(?:\s*=\d*x\d*)?\)/g;
  let currentIndex = 0;

  return content.replace(regex, (match, alt, url) => {
    if (currentIndex === imageIndex) {
      currentIndex++;
      return `![${alt}](${url} =${newWidth}x)`;
    }
    currentIndex++;
    return match;
  });
}

// Resizable image component for editor preview
function ResizableImage({
  src,
  alt,
  width,
  isEditing,
  onResize
}: {
  src: string;
  alt: string;
  width?: number;
  isEditing: boolean;
  onResize: (width: number) => void;
}) {
  const [isResizing, setIsResizing] = useState(false);
  const [currentWidth, setCurrentWidth] = useState(width);
  const imgRef = useRef<HTMLImageElement>(null);
  const startPos = useRef({ x: 0, width: 0 });

  useEffect(() => {
    setCurrentWidth(width);
  }, [width]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startPos.current.x;
      const newWidth = Math.max(100, Math.min(680, startPos.current.width + deltaX));
      setCurrentWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      if (currentWidth) {
        onResize(Math.round(currentWidth));
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, currentWidth, onResize]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startPos.current = {
      x: e.clientX,
      width: imgRef.current?.offsetWidth || currentWidth || 300
    };
  };

  const style: React.CSSProperties = currentWidth ? { width: currentWidth } : {};

  return (
    <div className={`resizable-image ${isEditing ? 'editing' : ''} ${isResizing ? 'resizing' : ''}`}>
      <img ref={imgRef} src={src} alt={alt} style={style} />
      {isEditing && (
        <div className="resize-handle" onMouseDown={handleMouseDown} />
      )}
      {isResizing && currentWidth && (
        <div className="resize-indicator">{Math.round(currentWidth)}px</div>
      )}
    </div>
  );
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

// Render content for editing (with resizable images)
function renderEditableContent(
  content: string,
  onImageResize: (imageIndex: number, width: number) => void
) {
  const parts = parseImageMarkdown(content);
  let imageIndex = 0;

  return parts.map((part, i) => {
    if (part.type === 'image') {
      const idx = imageIndex++;
      return (
        <ResizableImage
          key={i}
          src={part.url || ''}
          alt={part.alt || ''}
          width={part.width}
          isEditing={true}
          onResize={(width) => onImageResize(idx, width)}
        />
      );
    }
    return <span key={i}>{part.value}</span>;
  });
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
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch(`${AUTH_URL}/send-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      if (res.ok) {
        setSent(true);
      } else {
        setError('Something went wrong');
      }
    } catch {
      setError('Connection failed');
    }
  };

  if (sent) {
    return (
      <div className="auth-form">
        <h2>Check your email</h2>
        <p className="sent-message">If that email is registered, you'll receive a login link.</p>
      </div>
    );
  }

  return (
    <div className="auth-form">
      <h2>Admin Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
        />
        {error && <p className="error">{error}</p>}
        <button type="submit">Send login link</button>
      </form>
    </div>
  );
}

function Home({ posts }: { posts: BlogPost[] }) {
  if (posts.length === 0) {
    return <p>No posts yet.</p>;
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
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    detectLocation().then((loc) => {
      if (loc) setLocation(loc);
    });
  }, []);

  const handleImageResize = (imageIndex: number, width: number) => {
    setContent(updateImageDimensions(content, imageIndex, width));
  };

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
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const before = content.substring(0, start);
          const after = content.substring(start);
          setContent(`${before}![](${url})${after}`);
        } else {
          setContent(content + `![](${url})`);
        }
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
        <div className="editor-toolbar">
          <button
            type="button"
            className={`preview-toggle ${showPreview ? 'active' : ''}`}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {showPreview ? (
          <div className="content-preview">
            {renderEditableContent(content, handleImageResize)}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="content-input"
            placeholder="type body here"
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        )}
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
            disabled={uploading || showPreview}
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
  const [showPreview, setShowPreview] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (post) {
      setTitle(post.title);
      setContent(post.content);
      setLocation(post.location || '');
    }
  }, [post]);

  const handleImageResize = (imageIndex: number, width: number) => {
    setContent(updateImageDimensions(content, imageIndex, width));
  };

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
        const textarea = textareaRef.current;
        if (textarea) {
          const start = textarea.selectionStart;
          const before = content.substring(0, start);
          const after = content.substring(start);
          setContent(`${before}![](${url})${after}`);
        } else {
          setContent(content + `![](${url})`);
        }
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
        <div className="editor-toolbar">
          <button
            type="button"
            className={`preview-toggle ${showPreview ? 'active' : ''}`}
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? 'Edit' : 'Preview'}
          </button>
        </div>
        {showPreview ? (
          <div className="content-preview">
            {renderEditableContent(content, handleImageResize)}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="content-input"
            placeholder="type body here"
            value={content}
            onChange={e => setContent(e.target.value)}
          />
        )}
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
            disabled={uploading || showPreview}
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

  const fetchPosts = () => {
    fetch(API_URL)
      .then(res => res.json())
      .then(setPosts)
      .catch(console.error);
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
    // Check for token in URL (from magic link redirect)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
      setToken(token);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }

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
          <Route path="/" element={<Home posts={posts} />} />
          <Route path="/post/:id" element={<Post posts={posts} isAdmin={isAdmin} onPostDeleted={fetchPosts} />} />
          <Route path="/edit/:id" element={isAdmin ? <EditPost posts={posts} onPostUpdated={fetchPosts} /> : <LoginForm onLogin={() => { checkAuth(); }} />} />
          <Route path="/new" element={isAdmin ? <NewPost onPostCreated={fetchPosts} /> : <LoginForm onLogin={() => { checkAuth(); }} />} />
          <Route path="/login" element={<LoginForm onLogin={() => { checkAuth(); }} />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
