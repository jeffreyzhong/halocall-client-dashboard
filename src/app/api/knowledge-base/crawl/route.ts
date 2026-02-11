import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { firecrawl } from '@/lib/firecrawl'

export async function POST(request: NextRequest) {
  try {
    // 1. Authenticate user
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Look up user in database
    const user = await prisma.user.findUnique({
      where: { clerk_user_id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 3. Parse request body
    const body = await request.json()
    const { url } = body

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'A valid URL is required' }, { status: 400 })
    }

    // Validate URL format
    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    console.log('[knowledge-base/crawl] Starting crawl for:', url, 'org:', user.clerk_organization_id)

    // 4. Start async crawl job via Firecrawl SDK
    const crawlResult = await firecrawl.startCrawl(url, {
      limit: 50,
      scrapeOptions: {
        formats: ['markdown'],
        onlyMainContent: true,
      },
    })

    console.log('[knowledge-base/crawl] Crawl started with ID:', crawlResult.id)

    return NextResponse.json({
      crawlId: crawlResult.id,
      url,
    })
  } catch (error) {
    console.error('[knowledge-base/crawl] Error starting crawl:', error)
    return NextResponse.json({ error: 'Failed to start website crawl' }, { status: 500 })
  }
}
