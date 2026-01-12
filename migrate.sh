#!/bin/bash

echo "Running migrations..."
for f in migrations/*.sql; do
  echo "Running $f..."
  /opt/homebrew/opt/postgresql@17/bin/psql -d blog -f "$f"
done
echo "Done!"
