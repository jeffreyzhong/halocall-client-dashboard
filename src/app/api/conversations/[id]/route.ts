import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface TranscriptMessage {
  role: 'user' | 'agent'
  message: string
  time_in_call_secs: number
  tool_calls?: ToolCall[]
  tool_results?: ToolResult[]
}

interface ToolCall {
  tool_name: string
  params_as_json: string
  request_id: string
}

interface ToolResult {
  tool_name: string
  result_value: string
  request_id: string
  error_message?: string
}

interface ElevenLabsConversationResponse {
  conversation_id: string
  agent_id: string
  agent_name?: string
  status: string
  call_successful?: 'success' | 'failure' | 'unknown'
  start_time_unix_secs: number
  call_duration_secs: number
  transcript: TranscriptMessage[]
  metadata?: {
    phone_call?: {
      external_number?: string
    }
    start_time_unix_secs?: number
    call_duration_secs?: number
  }
  analysis?: {
    call_successful?: boolean
    evaluation_criteria_results?: Record<string, { result: string; rationale: string }>
    data_collection_results?: Record<string, { value: string; rationale: string }>
    transcript_summary?: string
  }
}

interface ElevenLabsAgentResponse {
  agent_id: string
  name: string
}

// Fetch agent name from ElevenLabs API
async function fetchAgentName(agentId: string, apiKey: string): Promise<string | null> {
  try {
    console.log(`Fetching agent name for ID: ${agentId}`)
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/agents/${agentId}`,
      {
        headers: {
          'xi-api-key': apiKey,
        },
      }
    )

    if (!response.ok) {
      console.log(`Failed to fetch agent ${agentId}: ${response.status}`)
      return null
    }

    const data: ElevenLabsAgentResponse = await response.json()
    console.log(`Got agent name for ${agentId}: ${data.name}`)
    return data.name || null
  } catch (error) {
    console.log(`Error fetching agent ${agentId}:`, error)
    return null
  }
}

// Extract agent IDs from transfer_to_agent tool calls in transcript
// Handles both direct transfer_to_agent calls and nested ones inside steps/results
function extractTransferAgentIds(
  transcript: TranscriptMessage[],
  toolResults: Map<string, ToolResult>
): Set<string> {
  const agentIds = new Set<string>()
  
  for (const msg of transcript) {
    if (msg.tool_calls) {
      for (const toolCall of msg.tool_calls) {
        // Check direct transfer_to_agent calls
        if (toolCall.tool_name === 'transfer_to_agent') {
          try {
            const params = JSON.parse(toolCall.params_as_json || '{}')
            if (params.agent_id) {
              agentIds.add(params.agent_id)
            }
          } catch {
            // Ignore parse errors
          }
          
          // Also check the result for from_agent and to_agent
          const result = toolResults.get(toolCall.request_id)
          if (result?.result_value) {
            try {
              const resultData = JSON.parse(result.result_value)
              if (resultData.from_agent) agentIds.add(resultData.from_agent)
              if (resultData.to_agent) agentIds.add(resultData.to_agent)
            } catch {
              // Ignore
            }
          }
        }
        
        // Check for nested transfer_to_agent in result_value (steps structure)
        const result = toolResults.get(toolCall.request_id)
        if (result?.result_value) {
          try {
            const resultData = JSON.parse(result.result_value)
            if (resultData.steps && Array.isArray(resultData.steps)) {
              for (const step of resultData.steps) {
                if (step.results && Array.isArray(step.results)) {
                  for (const stepResult of step.results) {
                    if (stepResult.tool_name === 'transfer_to_agent') {
                      // Extract from result_value string
                      if (stepResult.result_value) {
                        try {
                          const transferResult = typeof stepResult.result_value === 'string'
                            ? JSON.parse(stepResult.result_value)
                            : stepResult.result_value
                          if (transferResult.from_agent) agentIds.add(transferResult.from_agent)
                          if (transferResult.to_agent) agentIds.add(transferResult.to_agent)
                        } catch {
                          // Ignore
                        }
                      }
                      // Also check the result object directly
                      if (stepResult.result) {
                        if (stepResult.result.from_agent) agentIds.add(stepResult.result.from_agent)
                        if (stepResult.result.to_agent) agentIds.add(stepResult.result.to_agent)
                      }
                    }
                  }
                }
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }
  
  return agentIds
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: conversationId } = await params
    
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

    // 3. Fetch conversation details from ElevenLabs API
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY

    if (!elevenLabsApiKey) {
      return NextResponse.json({ error: 'ElevenLabs API key not configured' }, { status: 500 })
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
      {
        headers: {
          'xi-api-key': elevenLabsApiKey,
        },
      }
    )

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      }
      console.error(`Failed to fetch conversation: ${response.status}`)
      return NextResponse.json({ error: 'Failed to fetch conversation' }, { status: response.status })
    }

    const data: ElevenLabsConversationResponse = await response.json()

    // 4. Verify the agent belongs to the user's organization
    const agentConfig = await prisma.agents_config.findFirst({
      where: {
        clerk_organization_id: user.clerk_organization_id,
        agent_id: data.agent_id,
      },
    })

    if (!agentConfig) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // 5. Build tool results map and fetch agent names for any transfer_to_agent tool calls
    const toolResultsMap = new Map<string, ToolResult>()
    for (const msg of data.transcript || []) {
      if (msg.tool_results) {
        for (const result of msg.tool_results) {
          toolResultsMap.set(result.request_id, result)
        }
      }
    }
    
    const transferAgentIds = extractTransferAgentIds(data.transcript || [], toolResultsMap)
    console.log('Transfer agent IDs extracted:', Array.from(transferAgentIds))
    const agentNamesMap: Record<string, string> = {}
    
    // Add the current conversation's agent to the map
    if (data.agent_id) {
      agentNamesMap[data.agent_id] = data.agent_name || 'Unknown Agent'
    }
    
    // Fetch names for all agents referenced in transfers
    if (transferAgentIds.size > 0) {
      const agentNamePromises = Array.from(transferAgentIds).map(async (agentId) => {
        const name = await fetchAgentName(agentId, elevenLabsApiKey)
        return { agentId, name }
      })
      
      const results = await Promise.all(agentNamePromises)
      for (const { agentId, name } of results) {
        if (name) {
          agentNamesMap[agentId] = name
        }
      }
    }

    // 6. Transform and return the data
    return NextResponse.json({
      conversation_id: data.conversation_id,
      agent_id: data.agent_id,
      agent_name: data.agent_name || null,
      status: data.status,
      call_successful: data.call_successful || (data.analysis?.call_successful ? 'success' : 'unknown'),
      start_time_unix_secs: data.start_time_unix_secs || data.metadata?.start_time_unix_secs || 0,
      call_duration_secs: data.call_duration_secs || data.metadata?.call_duration_secs || 0,
      caller_phone_number: data.metadata?.phone_call?.external_number || null,
      transcript: data.transcript || [],
      analysis: data.analysis || null,
      agent_names: agentNamesMap,
    })
  } catch (error) {
    console.error('Error fetching conversation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
