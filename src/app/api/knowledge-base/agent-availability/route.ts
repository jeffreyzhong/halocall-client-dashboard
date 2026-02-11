import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/knowledge-base/agent-availability
// Returns a map of agent IDs to the KB they're assigned to.
// Pass ?excludeKbId=<id> to exclude a specific KB (the one being edited).
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth()

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { clerk_user_id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const excludeKbId = request.nextUrl.searchParams.get('excludeKbId')

    // Fetch all KBs for the org that have at least one agent assigned
    const knowledgeBases = await prisma.knowledge_base.findMany({
      where: {
        clerk_organization_id: user.clerk_organization_id,
        ...(excludeKbId ? { id: { not: BigInt(excludeKbId) } } : {}),
      },
      select: {
        id: true,
        title: true,
        agent_ids: true,
      },
    })

    // Build agent -> KB assignment map
    const assignments: Record<string, { kbId: string; kbTitle: string }> = {}

    for (const kb of knowledgeBases) {
      for (const agentId of kb.agent_ids) {
        assignments[agentId] = {
          kbId: kb.id.toString(),
          kbTitle: kb.title,
        }
      }
    }

    return NextResponse.json({ assignments })
  } catch (error) {
    console.error('[knowledge-base/agent-availability] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
