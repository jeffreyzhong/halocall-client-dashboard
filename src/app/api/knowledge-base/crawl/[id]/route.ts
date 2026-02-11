import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { firecrawl } from '@/lib/firecrawl'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate user
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Verify user exists
    const user = await prisma.user.findUnique({
      where: { clerk_user_id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 3. Get crawl status from Firecrawl SDK
    const { id: crawlId } = await params

    if (!crawlId) {
      return NextResponse.json({ error: 'Crawl ID is required' }, { status: 400 })
    }

    console.log('[knowledge-base/crawl/status] Checking crawl:', crawlId)

    const status = await firecrawl.getCrawlStatus(crawlId, {
      autoPaginate: false,
    })

    // 4. Return status with crawled data if complete
    if (status.status === 'completed') {
      // Extract markdown content and source URLs from crawled pages
      const pages = (status.data || []).map((page) => ({
        markdown: page.markdown || '',
        url: page.metadata?.sourceURL || page.metadata?.url || '',
        title: page.metadata?.title || '',
      }))

      console.log('[knowledge-base/crawl/status] Crawl completed with', pages.length, 'pages')

      return NextResponse.json({
        status: 'completed',
        completed: pages.length,
        total: pages.length,
        pages,
      })
    }

    // Return in-progress status
    return NextResponse.json({
      status: status.status,
      completed: status.completed ?? 0,
      total: status.total ?? 0,
    })
  } catch (error) {
    console.error('[knowledge-base/crawl/status] Error checking crawl status:', error)
    return NextResponse.json({ error: 'Failed to check crawl status' }, { status: 500 })
  }
}
