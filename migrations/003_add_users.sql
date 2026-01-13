-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add user_id to blog_posts
ALTER TABLE blog_posts ADD COLUMN user_id UUID REFERENCES users(id);

-- Create index for faster lookups
CREATE INDEX idx_blog_posts_user_id ON blog_posts(user_id);
