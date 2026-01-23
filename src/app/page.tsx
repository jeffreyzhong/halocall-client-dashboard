'use client'

import { useState, useEffect, useCallback } from "react";
import { SignIn, SignedIn, SignedOut } from "@clerk/nextjs";
import StatsCard from "@/components/StatsCard";
import RecentCallsTable from "@/components/RecentCallsTable";
import CallVolumeChart from "@/components/CallVolumeChart";
import HourlyAverageChart from "@/components/HourlyAverageChart";
import AgentSelector from "@/components/AgentSelector";
import TimeWindowSelector from "@/components/TimeWindowSelector";
import ConversationModal from "@/components/ConversationModal";

type TimeWindow = 'today' | 'last_7_days' | 'this_month' | 'last_30_days'

interface Agent {
  agent_id: string
  name: string
}

interface Conversation {
  conversation_id: string
  agent_id: string
  agent_name: string | null
  start_time_unix_secs: number
  call_duration_secs: number
  status: string
  call_successful: 'success' | 'failure' | 'unknown'
  caller_phone_number: string | null
}

interface Stats {
  totalCalls: number
  avgDurationSecs: number
  successRate: number
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export default function Home() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null)
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('last_7_days')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [stats, setStats] = useState<Stats>({ totalCalls: 0, avgDurationSecs: 0, successRate: 0 })
  const [isLoading, setIsLoading] = useState(false)
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)

  const fetchConversations = useCallback(async () => {
    if (!selectedAgent) return

    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        agent_id: selectedAgent.agent_id,
        time_window: timeWindow,
      })
      
      const response = await fetch(`/api/conversations?${params}`)
      const data = await response.json()

      if (response.ok) {
        setConversations(data.conversations)
        setStats(data.stats)
      } else {
        console.error('Failed to fetch conversations:', data.error)
        setConversations([])
        setStats({ totalCalls: 0, avgDurationSecs: 0, successRate: 0 })
      }
    } catch (error) {
      console.error('Error fetching conversations:', error)
      setConversations([])
      setStats({ totalCalls: 0, avgDurationSecs: 0, successRate: 0 })
    } finally {
      setIsLoading(false)
    }
  }, [selectedAgent, timeWindow])

  useEffect(() => {
    fetchConversations()
  }, [fetchConversations])

  const handleAgentChange = useCallback((agent: Agent | null) => {
    setSelectedAgent(agent)
  }, [])

  const handleTimeWindowChange = useCallback((tw: TimeWindow) => {
    setTimeWindow(tw)
  }, [])

  const handleConversationClick = useCallback((conversationId: string) => {
    setSelectedConversationId(conversationId)
  }, [])

  const handleCloseModal = useCallback(() => {
    setSelectedConversationId(null)
  }, [])

  return (
    <>
      <SignedOut>
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
          <div className="flex flex-col items-center gap-8">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-lg bg-[var(--text-primary)] flex items-center justify-center">
                <svg className="w-5 h-5 text-[var(--bg-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
                </svg>
              </div>
              <span className="text-xl font-semibold text-[var(--text-primary)]">VoiceAI</span>
            </div>
            
            <SignIn 
              routing="hash"
              appearance={{
                elements: {
                  rootBox: 'mx-auto',
                  card: 'bg-[var(--bg-secondary)] border border-[var(--border-subtle)]',
                  headerTitle: 'text-[var(--text-primary)]',
                  headerSubtitle: 'text-[var(--text-secondary)]',
                  formFieldLabel: 'text-[var(--text-secondary)]',
                  formFieldInput: 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-primary)]',
                  formButtonPrimary: 'bg-[var(--text-primary)] text-[var(--bg-primary)] hover:bg-[var(--text-secondary)]',
                  footerActionLink: 'text-[var(--text-secondary)]',
                  socialButtonsBlockButton: 'bg-[var(--bg-tertiary)] border-[var(--border-subtle)] text-[var(--text-primary)]',
                  dividerLine: 'bg-[var(--border-subtle)]',
                  dividerText: 'text-[var(--text-muted)]',
                },
              }}
            />
          </div>
        </div>
      </SignedOut>
      
      <SignedIn>
        <div className="p-6">
          {/* Header */}
          <div className="mb-6 animate-in">
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">Dashboard</h1>
            <p className="text-sm text-[var(--text-muted)]">Monitor your AI voice agents</p>
          </div>

          {/* Filters Row */}
          <div className="relative z-50 mb-6 animate-in delay-1 flex items-center gap-3">
            <AgentSelector onAgentChange={handleAgentChange} />
            <TimeWindowSelector onTimeWindowChange={handleTimeWindowChange} />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            <div className="animate-in delay-1">
              <StatsCard
                title="Total Calls"
                value={isLoading ? "—" : stats.totalCalls.toString()}
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                }
              />
            </div>
            <div className="animate-in delay-2">
              <StatsCard
                title="Avg Duration"
                value={isLoading ? "—" : formatDuration(stats.avgDurationSecs)}
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            </div>
            <div className="animate-in delay-3">
              <StatsCard
                title="Success Rate"
                value={isLoading ? "—" : `${stats.successRate}%`}
                icon={
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            </div>
          </div>

          {/* Charts */}
          <div className="mb-6 animate-in delay-3">
            <CallVolumeChart conversations={conversations} timeWindow={timeWindow} isLoading={isLoading} />
          </div>
          <div className="mb-6 animate-in delay-4">
            <HourlyAverageChart conversations={conversations} timeWindow={timeWindow} isLoading={isLoading} />
          </div>

          {/* Recent Calls Table */}
          <div className="animate-in delay-5">
            <RecentCallsTable 
              conversations={conversations} 
              isLoading={isLoading} 
              onConversationClick={handleConversationClick}
            />
          </div>
        </div>

        {/* Conversation Detail Modal */}
        {selectedConversationId && (
          <ConversationModal
            conversationId={selectedConversationId}
            onClose={handleCloseModal}
          />
        )}
      </SignedIn>
    </>
  );
}
