'use client'

import { useState, useEffect, useRef } from 'react'

interface Agent {
  agent_id: string
  name: string
}

interface AgentsResponse {
  agents: Agent[]
  configured?: boolean
  message?: string
  role?: 'admin' | 'member'
}

interface AgentSelectorProps {
  onAgentChange: (agent: Agent | null) => void
  onConfigurationStatus?: (configured: boolean, message?: string) => void
}

export default function AgentSelector({ onAgentChange, onConfigurationStatus }: AgentSelectorProps) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [configMessage, setConfigMessage] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function fetchAgents() {
      try {
        const response = await fetch('/api/agents')
        const data: AgentsResponse = await response.json()

        if (!response.ok) {
          throw new Error((data as { error?: string }).error || 'Failed to fetch agents')
        }

        setAgents(data.agents)
        
        // Handle configuration status
        if (data.agents.length === 0 && data.message) {
          setConfigMessage(data.message)
          onConfigurationStatus?.(data.configured ?? false, data.message)
        } else {
          onConfigurationStatus?.(true)
        }
        
        // Default to the first agent
        if (data.agents.length > 0) {
          setSelectedAgent(data.agents[0])
          onAgentChange(data.agents[0])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred')
      } finally {
        setIsLoading(false)
      }
    }

    fetchAgents()
  }, [onAgentChange, onConfigurationStatus])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (agent: Agent) => {
    setSelectedAgent(agent)
    onAgentChange(agent)
    setIsOpen(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-subtle)]">
        <div className="w-4 h-4 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-[var(--text-muted)]">Loading agents...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--accent-red-muted)] rounded-lg border border-[var(--accent-red)]">
        <svg className="w-4 h-4 text-[var(--accent-red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-sm text-[var(--accent-red)]">{error}</span>
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-subtle)]">
        <svg className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm text-[var(--text-muted)]">
          {configMessage || 'No agents available'}
        </span>
      </div>
    )
  }

  return (
    <div className="relative z-[100]" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between gap-3 min-w-[200px] px-3 py-2 bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-lg border border-[var(--border-subtle)] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[var(--accent-green)] pulse" />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            {selectedAgent?.name || 'Select agent'}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute z-[100] top-full left-0 mt-1 min-w-[200px] py-1 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)] shadow-lg">
          {agents.map((agent) => (
            <button
              key={agent.agent_id}
              onClick={() => handleSelect(agent)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors cursor-pointer ${
                selectedAgent?.agent_id === agent.agent_id
                  ? 'bg-[var(--bg-tertiary)]'
                  : ''
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  selectedAgent?.agent_id === agent.agent_id
                    ? 'bg-[var(--accent-green)]'
                    : 'bg-[var(--text-muted)]'
                }`}
              />
              <span className="text-sm text-[var(--text-primary)]">{agent.name}</span>
              {selectedAgent?.agent_id === agent.agent_id && (
                <svg
                  className="w-4 h-4 ml-auto text-[var(--accent-green)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
