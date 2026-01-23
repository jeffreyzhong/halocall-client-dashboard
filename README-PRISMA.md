# Prisma Setup for Supabase

This project uses Prisma with Supabase as the source of truth. The database schema is synced FROM Supabase, not pushed TO it.

## Environment Variables

Make sure you have both connection strings in your `.env` file:

```env
# Connection pooler (for application queries - better performance)
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true"

# Direct connection (for migrations and introspection - required)
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-0-[region].compute.amazonaws.com:5432/postgres"
```

**Important:** 
- `DATABASE_URL` should use the **pooler** connection (has `pooler` in hostname or port `6543`)
- `DIRECT_URL` should use the **direct** connection (no `pooler` in hostname, port `5432`)

You can find both connection strings in your Supabase dashboard under Settings → Database.

## Syncing Schema from Supabase

To pull the latest schema from Supabase:

```bash
npm run db:pull
```

This will:
1. Connect to Supabase using `DIRECT_URL`
2. Introspect your database
3. Update `prisma/schema.prisma` with your current database structure
4. Generate the Prisma Client

## Generating Prisma Client

After pulling the schema or making changes:

```bash
npm run db:generate
```

## Using Prisma Client

Import and use Prisma client in your code:

```typescript
import { prisma } from '@/lib/prisma'

// Example: Get all users
const users = await prisma.user.findMany()
```

The Prisma client automatically uses `DATABASE_URL` (pooled connection) for better performance in your application.
