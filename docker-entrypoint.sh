#!/bin/sh
set -e

# Run non-destructive database migrations if DATABASE_URL is set
if [ -n "$DATABASE_URL" ]; then
  echo "Applying committed Prisma migrations (non-destructive)..."
  npx prisma migrate deploy || echo "Warning: Prisma migration deploy reported exit code $?, proceeding..."
fi

# Execute main container command
exec "$@"
