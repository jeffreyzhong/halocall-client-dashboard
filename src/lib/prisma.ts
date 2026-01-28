import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  const pool = globalForPrisma.pool ?? new Pool({ connectionString })
  const adapter = new PrismaPg(pool)

  if (process.env.WORK_ENVIRONMENT !== 'production') {
    globalForPrisma.pool = pool
  }

  return new PrismaClient({
    adapter,
    log: process.env.WORK_ENVIRONMENT === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.WORK_ENVIRONMENT !== 'production') globalForPrisma.prisma = prisma
