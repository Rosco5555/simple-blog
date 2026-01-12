import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import './App.css';

interface BlogPost {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}

const API_URL = 'http://localhost:5000/api/posts';

function Layout({ children, posts }: { children: React.ReactNode; posts: BlogPost[] }) {
  return (
    <div className="layout">
      <aside className="sidebar">
        <h2>Posts</h2>
        <ul>
          {posts.map(post => (
            <li key={post.id}>
              <Link to={`/post/${post.id}`}>{post.title}</Link>
            </li>
          ))}
        </ul>
      </aside>
      <main className="main">
        <header className="header">
          <Link to="/"><h1>The Daily Blog</h1></Link>
          <div className="date">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</div>
        </header>
        {children}
      </main>
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
          <div className="meta">{new Date(post.createdAt).toLocaleDateString()}</div>
          <div className="content">{post.content.substring(0, 300)}...</div>
        </article>
      ))}
    </>
  );
}

function Post({ posts }: { posts: BlogPost[] }) {
  const id = window.location.pathname.split('/').pop();
  const post = posts.find(p => p.id === id);

  if (!post) {
    return <p>Post not found.</p>;
  }

  return (
    <>
      <Link to="/" className="back-link">&larr; Back to all posts</Link>
      <article className="post">
        <h2>{post.title}</h2>
        <div className="meta">{new Date(post.createdAt).toLocaleDateString()}</div>
        <div className="content">{post.content}</div>
      </article>
    </>
  );
}

function App() {
  const [posts, setPosts] = useState<BlogPost[]>([]);

  useEffect(() => {
    fetch(API_URL)
      .then(res => res.json())
      .then(setPosts)
      .catch(console.error);
  }, []);

  return (
    <BrowserRouter>
      <Layout posts={posts}>
        <Routes>
          <Route path="/" element={<Home posts={posts} />} />
          <Route path="/post/:id" element={<Post posts={posts} />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
