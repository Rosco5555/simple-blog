-- Enable row level security on blog_posts
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read all posts
CREATE POLICY blog_posts_select ON blog_posts
    FOR SELECT
    USING (true);

-- Policy: Only owner can insert their own posts
CREATE POLICY blog_posts_insert ON blog_posts
    FOR INSERT
    WITH CHECK (user_id = current_setting('app.current_user_id', true)::uuid);

-- Policy: Only owner can update their own posts
CREATE POLICY blog_posts_update ON blog_posts
    FOR UPDATE
    USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- Policy: Only owner can delete their own posts
CREATE POLICY blog_posts_delete ON blog_posts
    FOR DELETE
    USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- Bypass RLS for the database owner (needed for admin operations)
ALTER TABLE blog_posts FORCE ROW LEVEL SECURITY;
