import { auth, clerkClient } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface AgentConfigResult {
  agent_id: string
  phone_number: string
  location_id: bigint
  merchant_location_id: string
  timezone: string
}

export async function GET() {
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

    // 3. Get their clerk_organization_id and clerk_user_id
    const { clerk_organization_id, clerk_user_id } = user

    // 4. Get the user's role in their organization from Clerk API
    const client = await clerkClient()
    const memberships = await client.users.getOrganizationMembershipList({
      userId,
    })

    // Find the membership for the user's organization
    const orgMembership = memberships.data.find(
      (m) => m.organization.id === clerk_organization_id
    )

    if (!orgMembership) {
      return NextResponse.json({ error: 'User is not a member of the organization' }, { status: 403 })
    }

    const isAdmin = orgMembership.role === 'org:admin'

    // 5. Get agent configs based on user role
    let agentConfigs: AgentConfigResult[]

    if (isAdmin) {
      // Admin: Get all agents for the organization
      agentConfigs = await prisma.$queryRaw<AgentConfigResult[]>`
        SELECT
          ac.agent_id,
          pnc.phone_number,
          pnc.location_id,
          l.merchant_location_id,
          l.timezone
        FROM public.location l
        JOIN public.phone_number_config pnc
          ON pnc.location_id = l.id
        JOIN public.agent_config ac
          ON ac.phone_number_id = pnc.id
        WHERE l.clerk_organization_id = ${clerk_organization_id}
      `
    } else {
      // Member: Get only agents for locations the user has access to
      agentConfigs = await prisma.$queryRaw<AgentConfigResult[]>`
        SELECT
          ac.agent_id,
          pnc.phone_number,
          pnc.location_id,
          l.merchant_location_id,
          l.timezone
        FROM public.user_location_access ula
        JOIN public.location l
          ON l.id = ula.location_id
         AND l.clerk_organization_id = ula.clerk_organization_id
        JOIN public.phone_number_config pnc
          ON pnc.location_id = l.id
        JOIN public.agent_config ac
          ON ac.phone_number_id = pnc.id
        WHERE ula.clerk_organization_id = ${clerk_organization_id}
          AND ula.clerk_user_id = ${clerk_user_id}
      `
    }

    // 6. Check if organization is configured
    if (agentConfigs.length === 0) {
      // Determine if organization has any agents at all (for admins)
      // or if the user simply has no location access (for members)
      const orgHasAgents = await prisma.agent_config.findFirst({
        where: {
          phone_number_config: {
            location: {
              clerk_organization_id,
            },
          },
        },
      })

      if (!orgHasAgents) {
        // Organization not configured yet
        return NextResponse.json({
          agents: [],
          configured: false,
          message: 'Your organization has not been configured yet. If you use Square, start the configuration below.',
        })
      } else {
        // User is a member with no location access
        return NextResponse.json({
          agents: [],
          configured: true,
          message: 'You do not have access to any locations. Please contact your administrator to request access.',
        })
      }
    }

    // 7. Fetch agent details from ElevenLabs API
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY

    if (!elevenLabsApiKey) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
    }

    // Deduplicate agent IDs (same agent can be on multiple phone numbers)
    const uniqueAgentIds = [...new Set(agentConfigs.map((c) => c.agent_id))]

    const agentPromises = uniqueAgentIds.map(async (agent_id) => {
      try {
        const response = await fetch(
          `https://api.elevenlabs.io/v1/convai/agents/${agent_id}`,
          {
            headers: {
              'xi-api-key': elevenLabsApiKey,
            },
          }
        )

        if (!response.ok) {
          console.error(`Failed to fetch agent ${agent_id}: ${response.status}`)
          return null
        }

        const agentData = await response.json()
        return {
          agent_id: agentData.agent_id,
          name: agentData.name,
        }
      } catch (error) {
        console.error(`Error fetching agent ${agent_id}:`, error)
        return null
      }
    })

    const agents = (await Promise.all(agentPromises)).filter(Boolean)

    return NextResponse.json({
      agents,
      configured: true,
      role: isAdmin ? 'admin' : 'member',
    })
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
