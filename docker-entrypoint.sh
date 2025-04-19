#!/bin/sh

# Push Prisma schema to DB (creates tables without migrations)
npx prisma db push --schema=./prisma/schema.prisma

# Seed the database if needed
npx prisma db seed

# Start the Next.js application
exec "$@"
