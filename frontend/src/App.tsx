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

function renderContent(content: string) {
  const parts = content.split(/(!\[.*?\]\(.*?\))/g);
  return parts.map((part, i) => {
    const match = part.match(/!\[(.*?)\]\((.*?)\)/);
    if (match) {
      return <img key={i} src={match[2]} alt={match[1]} />;
    }
    return <span key={i}>{part}</span>;
  });
}

function Layout({ children, posts, isAdmin, onLogout }: { children: React.ReactNode; posts: BlogPost[]; isAdmin: boolean; onLogout: () => void }) {
  return (
    <div className="layout">
      <aside className="sidebar">
        {isAdmin && (
          <Link to="/new" className="new-post-btn">
            New post
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
              <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zM6 20V4h7v5h5v11H6z"/>
            </svg>
          </Link>
        )}
        <h2>Posts</h2>
        <ul>
          {posts.map(post => (
            <li key={post.id}>
              <Link to={`/post/${post.id}`}>{post.title}</Link>
            </li>
          ))}
        </ul>
        {isAdmin && (
          <div className="user-section">
            <button className="logout-btn" onClick={onLogout}>Logout</button>
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
        credentials: 'include',
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
      credentials: 'include'
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
        credentials: 'include',
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
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
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
          ref={textareaRef}
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

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(IMAGE_URL, {
        method: 'POST',
        credentials: 'include',
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
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
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
          ref={textareaRef}
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

  const fetchPosts = () => {
    fetch(API_URL, { credentials: 'include' })
      .then(res => res.json())
      .then(setPosts)
      .catch(console.error);
  };

  const checkAuth = async () => {
    try {
      const res = await fetch(`${AUTH_URL}/me`, { credentials: 'include' });
      setIsAdmin(res.ok);
    } catch {
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await fetch(`${AUTH_URL}/logout`, {
      method: 'POST',
      credentials: 'include'
    });
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
