-- Create admin user with fixed ID
INSERT INTO users (id, username, display_name)
VALUES ('00000000-0000-0000-0000-000000000001', 'admin', 'Admin')
ON CONFLICT (id) DO NOTHING;

-- Update RLS policy to allow admin to edit all posts
DROP POLICY IF EXISTS blog_posts_update ON blog_posts;
DROP POLICY IF EXISTS blog_posts_delete ON blog_posts;

CREATE POLICY blog_posts_update ON blog_posts FOR UPDATE
    USING (
        current_setting('app.current_user_id', true)::uuid = '00000000-0000-0000-0000-000000000001'::uuid
        OR user_id = current_setting('app.current_user_id', true)::uuid
    );

CREATE POLICY blog_posts_delete ON blog_posts FOR DELETE
    USING (
        current_setting('app.current_user_id', true)::uuid = '00000000-0000-0000-0000-000000000001'::uuid
        OR user_id = current_setting('app.current_user_id', true)::uuid
    );
