import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // 1. Get the current user from Clerk
    const { userId } = await auth()
    
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 2. Look them up in the users table
    const user = await prisma.users.findUnique({
      where: { clerk_user_id: userId },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // 3. Get their clerk_organization_id
    const { clerk_organization_id } = user

    // 4. Get all agent IDs from agents_config for that organization
    const agentConfigs = await prisma.agents_config.findMany({
      where: { clerk_organization_id },
      select: { agent_id: true },
    })

    if (agentConfigs.length === 0) {
      return NextResponse.json({ agents: [] })
    }

    // 5. Fetch agent details from ElevenLabs API
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY

    if (!elevenLabsApiKey) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
    }

    const agentPromises = agentConfigs.map(async ({ agent_id }) => {
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

    return NextResponse.json({ agents })
  } catch (error) {
    console.error('Error fetching agents:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
