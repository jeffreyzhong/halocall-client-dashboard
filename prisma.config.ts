import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Use DIRECT_URL for introspection and migrations (requires direct connection)
    // Fallback to DATABASE_URL if DIRECT_URL is not set
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
    // Shadow database only needed for migrations, not introspection
  },
})
