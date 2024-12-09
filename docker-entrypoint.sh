#!/bin/sh

# Run Prisma migrations
npx prisma migrate deploy

# Seed the database if needed
npx prisma db seed

# Start the Next.js application
exec "$@"
