-- Add location fields to strava_activities
ALTER TABLE strava_activities ADD COLUMN IF NOT EXISTS location_city TEXT;
ALTER TABLE strava_activities ADD COLUMN IF NOT EXISTS location_state TEXT;
ALTER TABLE strava_activities ADD COLUMN IF NOT EXISTS location_country TEXT;

-- Best efforts / Personal Bests
CREATE TABLE IF NOT EXISTS strava_best_efforts (
    id BIGINT PRIMARY KEY,  -- Strava's best effort ID
    activity_id BIGINT NOT NULL REFERENCES strava_activities(id) ON DELETE CASCADE,
    athlete_id BIGINT NOT NULL,
    name TEXT NOT NULL,  -- e.g., "5K", "10K", "Half-Marathon"
    distance_meters DECIMAL(10,2) NOT NULL,
    elapsed_time_seconds INT NOT NULL,
    moving_time_seconds INT NOT NULL,
    start_date TIMESTAMP NOT NULL,
    pr_rank INT,  -- 1 = PR at time of activity, null = not a PR
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strava_best_efforts_name ON strava_best_efforts(name);
CREATE INDEX IF NOT EXISTS idx_strava_best_efforts_activity ON strava_best_efforts(activity_id);
