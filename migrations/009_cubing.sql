CREATE TABLE IF NOT EXISTS cube_solves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    time_ms INT NOT NULL,
    scramble TEXT NOT NULL,
    dnf BOOLEAN DEFAULT FALSE,
    plus_two BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cube_solves_created_at ON cube_solves(created_at DESC);
