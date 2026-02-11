'use client'

import { useState, useEffect, useCallback } from 'react'

interface Agent {
  agent_id: string
  name: string
}

interface AgentAssignment {
  kbId: string
  kbTitle: string
}

interface AgentMultiSelectProps {
  selectedAgentIds: string[]
  onChange: (agentIds: string[]) => void
  currentKbId?: string // The KB being edited, so its agents aren't shown as "taken"
}

export default function AgentMultiSelect({ selectedAgentIds, onChange, currentKbId }: AgentMultiSelectProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [assignments, setAssignments] = useState<Record<string, AgentAssignment>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch agents and availability in parallel
        const [agentsRes, availRes] = await Promise.all([
          fetch('/api/agents'),
          fetch(`/api/knowledge-base/agent-availability${currentKbId ? `?excludeKbId=${currentKbId}` : ''}`),
        ])

        if (!agentsRes.ok) {
          throw new Error('Failed to fetch agents')
        }

        const agentsData = await agentsRes.json()
        setAgents(agentsData.agents || [])

        if (availRes.ok) {
          const availData = await availRes.json()
          setAssignments(availData.assignments || {})
        }
      } catch (err) {
        console.error('Error fetching agents:', err)
        setError('Failed to load agents')
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [currentKbId])

  const toggleAgent = useCallback(
    (agentId: string) => {
      if (selectedAgentIds.includes(agentId)) {
        onChange(selectedAgentIds.filter((id) => id !== agentId))
      } else {
        onChange([...selectedAgentIds, agentId])
      }
    },
    [selectedAgentIds, onChange]
  )

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <div className="w-4 h-4 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
        Loading agents...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-[var(--accent-red)]">
        {error}
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        No agents found. Configure agents in your organization to associate them with the knowledge base.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      {agents.map((agent) => {
        const isSelected = selectedAgentIds.includes(agent.agent_id)
        const assignment = assignments[agent.agent_id]
        const isTaken = !!assignment

        return (
          <label
            key={agent.agent_id}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
              isTaken
                ? 'border-[var(--border-subtle)] bg-[var(--bg-secondary)] cursor-not-allowed opacity-60'
                : isSelected
                ? 'border-[var(--accent-green)] bg-[var(--accent-green-muted)] cursor-pointer'
                : 'border-[var(--border-subtle)] bg-[var(--bg-primary)] hover:border-[var(--border-medium)] cursor-pointer'
            }`}
          >
            {/* Custom checkbox */}
            <div
              className={`rounded flex-shrink-0 flex items-center justify-center border transition-colors ${
                isTaken
                  ? 'border-[var(--border-medium)] bg-[var(--bg-tertiary)]'
                  : isSelected
                  ? 'bg-[var(--accent-green)] border-[var(--accent-green)]'
                  : 'border-[var(--border-medium)] bg-[var(--bg-card)]'
              }`}
              style={{ width: '18px', height: '18px' }}
            >
              {isSelected && !isTaken && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
              {isTaken && (
                <svg className="w-3 h-3 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              )}
            </div>

            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => !isTaken && toggleAgent(agent.agent_id)}
              disabled={isTaken}
              className="sr-only"
            />

            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${isTaken ? 'text-[var(--text-muted)]' : 'text-[var(--text-primary)]'}`}>
                {agent.name}
              </p>
              {isTaken ? (
                <p className="text-xs text-[var(--text-muted)] truncate">
                  Assigned to: {assignment.kbTitle}
                </p>
              ) : (
                <p className="text-xs text-[var(--text-muted)] truncate">
                  {agent.agent_id}
                </p>
              )}
            </div>
          </label>
        )
      })}
    </div>
  )
}
