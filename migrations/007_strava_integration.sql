-- Strava OAuth tokens (single row for admin)
CREATE TABLE IF NOT EXISTS strava_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    athlete_id BIGINT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Strava running activities
CREATE TABLE IF NOT EXISTS strava_activities (
    id BIGINT PRIMARY KEY,  -- Strava's activity ID
    athlete_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    activity_type TEXT NOT NULL,
    distance_meters DECIMAL(10,2) NOT NULL,
    moving_time_seconds INT NOT NULL,
    elapsed_time_seconds INT NOT NULL,
    total_elevation_gain DECIMAL(8,2),
    start_date TIMESTAMP NOT NULL,
    start_date_local TIMESTAMP NOT NULL,
    average_speed DECIMAL(6,3),
    max_speed DECIMAL(6,3),
    average_heartrate DECIMAL(5,2),
    max_heartrate INT,
    summary_polyline TEXT,
    calories INT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strava_activities_start_date ON strava_activities(start_date DESC);
