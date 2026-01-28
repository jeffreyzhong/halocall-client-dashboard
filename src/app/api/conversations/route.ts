import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

type TimeWindow = 'today' | 'last_7_days' | 'this_month' | 'last_30_days'

interface ConversationSummary {
  conversation_id: string
  agent_id: string
  agent_name: string | null
  start_time_unix_secs: number
  call_duration_secs: number
  status: string
  call_successful: 'success' | 'failure' | 'unknown'
  caller_phone_number: string | null
}

function getTimeWindowStart(timeWindow: TimeWindow): number {
  const now = new Date()
  
  switch (timeWindow) {
    case 'today': {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      return Math.floor(startOfDay.getTime() / 1000)
    }
    case 'last_7_days': {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return Math.floor(sevenDaysAgo.getTime() / 1000)
    }
    case 'this_month': {
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      return Math.floor(startOfMonth.getTime() / 1000)
    }
    case 'last_30_days': {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      return Math.floor(thirtyDaysAgo.getTime() / 1000)
    }
    default:
      return Math.floor((now.getTime() - 7 * 24 * 60 * 60 * 1000) / 1000)
  }
}

interface ConversationDetailsResponse {
  metadata?: {
    phone_call?: {
      external_number?: string
    }
  }
}

async function fetchConversationDetails(
  conversationId: string, 
  apiKey: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
      {
        headers: {
          'xi-api-key': apiKey,
        },
      }
    )

    if (!response.ok) {
      return null
    }

    const data: ConversationDetailsResponse = await response.json()
    return data.metadata?.phone_call?.external_number || null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    // 1. Get the current user from Clerk
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Look them up in the user table
    const user = await prisma.user.findUnique({
      where: { clerk_user_id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 3. Get query parameters
    const searchParams = request.nextUrl.searchParams
    const agentId = searchParams.get('agent_id')
    const timeWindow = (searchParams.get('time_window') || 'last_7_days') as TimeWindow

    // 4. Get the user's role in their organization from Clerk API
    const client = await clerkClient()
    const memberships = await client.users.getOrganizationMembershipList({
      userId,
    })

    const orgMembership = memberships.data.find(
      (m) => m.organization.id === user.clerk_organization_id
    )

    if (!orgMembership) {
      return NextResponse.json({ error: 'User is not a member of the organization' }, { status: 403 })
    }

    const isAdmin = orgMembership.role === 'org:admin'

    // 5. Validate agent belongs to user based on their role
    if (agentId) {
      let hasAccess = false

      if (isAdmin) {
        // Admin: Check if agent exists in the organization
        const agentConfig = await prisma.agent_config.findFirst({
          where: {
            agent_id: agentId,
            phone_number_config: {
              location: {
                clerk_organization_id: user.clerk_organization_id,
              },
            },
          },
        })
        hasAccess = !!agentConfig
      } else {
        // Member: Check if agent is at a location the user has access to
        const accessibleAgent = await prisma.$queryRaw<{ agent_id: string }[]>`
          SELECT ac.agent_id
          FROM public.user_location_access ula
          JOIN public.location l
            ON l.id = ula.location_id
           AND l.clerk_organization_id = ula.clerk_organization_id
          JOIN public.phone_number_config pnc
            ON pnc.location_id = l.id
          JOIN public.agent_config ac
            ON ac.phone_number_id = pnc.id
          WHERE ula.clerk_organization_id = ${user.clerk_organization_id}
            AND ula.clerk_user_id = ${user.clerk_user_id}
            AND ac.agent_id = ${agentId}
          LIMIT 1
        `
        hasAccess = accessibleAgent.length > 0
      }

      if (!hasAccess) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }
    }

    // 6. Calculate time window
    const callStartAfterUnix = getTimeWindowStart(timeWindow)

    // 7. Fetch conversations from ElevenLabs API
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY

    if (!elevenLabsApiKey) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
    }

    const url = new URL('https://api.elevenlabs.io/v1/convai/conversations')
    if (agentId) {
      url.searchParams.set('agent_id', agentId)
    }
    url.searchParams.set('call_start_after_unix', callStartAfterUnix.toString())
    url.searchParams.set('page_size', '100')

    const response = await fetch(url.toString(), {
      headers: {
        'xi-api-key': elevenLabsApiKey,
      },
    })

    if (!response.ok) {
      console.error(`Failed to fetch conversations: ${response.status}`)
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: response.status })
    }

    const data = await response.json()
    
    // 8. Fetch phone numbers for each conversation in parallel
    const conversationList = data.conversations as Array<{
      conversation_id: string
      agent_id: string
      agent_name?: string | null
      start_time_unix_secs: number
      call_duration_secs: number
      status: string
      call_successful: 'success' | 'failure' | 'unknown'
    }>

    const phoneNumberPromises = conversationList.map(conv => 
      fetchConversationDetails(conv.conversation_id, elevenLabsApiKey)
    )
    const phoneNumbers = await Promise.all(phoneNumberPromises)

    // 9. Transform and compute stats
    const conversations: ConversationSummary[] = conversationList.map((conv, index) => ({
      conversation_id: conv.conversation_id,
      agent_id: conv.agent_id,
      agent_name: conv.agent_name || null,
      start_time_unix_secs: conv.start_time_unix_secs,
      call_duration_secs: conv.call_duration_secs,
      status: conv.status,
      call_successful: conv.call_successful,
      caller_phone_number: phoneNumbers[index],
    }))

    // Compute stats
    const totalCalls = conversations.length
    const avgDurationSecs = totalCalls > 0
      ? Math.round(conversations.reduce((sum, c) => sum + c.call_duration_secs, 0) / totalCalls)
      : 0
    
    const successfulCalls = conversations.filter(c => c.call_successful === 'success').length
    const successRate = totalCalls > 0
      ? Math.round((successfulCalls / totalCalls) * 100)
      : 0

    return NextResponse.json({
      conversations,
      stats: {
        totalCalls,
        avgDurationSecs,
        successRate,
      },
    })
  } catch (error) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
