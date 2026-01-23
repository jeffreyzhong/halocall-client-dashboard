#!/bin/bash

# Script to sync Prisma schema from Supabase, generate client, and build the project
set -e  # Exit on any error

echo "🔄 Syncing Prisma schema from Supabase..."
npx prisma db pull

echo "📦 Generating Prisma Client..."
npx prisma generate

echo "🏗️  Building the project..."
npm run build

echo "✅ All done! Schema synced, client generated, and build successful."
