#!/bin/bash

# Run migrations
echo "Running migrations..."
/opt/homebrew/opt/postgresql@17/bin/psql -d blog -f migrations/001_create_blog_posts.sql

# Start backend
echo "Starting backend on port 5000..."
cd Blog.Api && dotnet run --urls=http://localhost:5000 &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Start frontend
echo "Starting frontend on port 3000..."
cd ../frontend && npm start &
FRONTEND_PID=$!

echo ""
echo "Blog is running!"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:5000"
echo ""
echo "Press Ctrl+C to stop both servers"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
