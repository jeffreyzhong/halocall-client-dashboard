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
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null)
  const [configMessage, setConfigMessage] = useState<string | null>(null)
  const [isConnectingSquare, setIsConnectingSquare] = useState(false)
  const [squareError, setSquareError] = useState<string | null>(null)
  const [isPendingSetup, setIsPendingSetup] = useState(false)
  const [locationsCount, setLocationsCount] = useState<number | null>(null)

  // Check for Square OAuth callback results in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const squareConnected = params.get('square_connected')
    const locationsParam = params.get('locations_synced')
    const error = params.get('square_error')
    const errorDescription = params.get('square_error_description')

    if (squareConnected === 'true') {
      // Show pending setup message instead of reloading
      setIsPendingSetup(true)
      setIsConfigured(false)
      if (locationsParam) {
        setLocationsCount(parseInt(locationsParam, 10))
      }
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname)
    } else if (error) {
      setSquareError(errorDescription || 'Failed to connect Square account')
      // Clear URL params
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const handleConnectSquare = async () => {
    setIsConnectingSquare(true)
    setSquareError(null)
    
    try {
      const response = await fetch('/api/square/authorize')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start Square authorization')
      }

      // Redirect to Square authorization page
      window.location.href = data.authUrl
    } catch (error) {
      console.error('Error connecting Square:', error)
      setSquareError(error instanceof Error ? error.message : 'Failed to connect Square')
      setIsConnectingSquare(false)
    }
  }

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

  const handleConfigurationStatus = useCallback((configured: boolean, message?: string) => {
    setIsConfigured(configured)
    setConfigMessage(message || null)
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
              <span className="text-xl font-semibold text-[var(--text-primary)]">RingBuddy</span>
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
            <AgentSelector 
              onAgentChange={handleAgentChange} 
              onConfigurationStatus={handleConfigurationStatus}
            />
            {isConfigured && <TimeWindowSelector onTimeWindowChange={handleTimeWindowChange} />}
          </div>

          {/* Pending Setup State - After Square Connected */}
          {isPendingSetup && (
            <div className="animate-in delay-2">
              <div className="flex flex-col items-center justify-center py-16 px-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)]">
                <div className="w-16 h-16 mb-6 rounded-full bg-green-500/10 flex items-center justify-center">
                  <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Square Connected Successfully!</h2>
                <p className="text-sm text-[var(--text-muted)] text-center max-w-md mb-4">
                  {locationsCount !== null && locationsCount > 0 
                    ? `We found ${locationsCount} location${locationsCount > 1 ? 's' : ''} in your Square account.`
                    : 'Your Square account has been connected.'}
                </p>
                <div className="bg-[var(--bg-tertiary)] rounded-lg px-6 py-4 max-w-md">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 mt-0.5 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1">What happens next?</h3>
                      <p className="text-sm text-[var(--text-muted)]">
                        The RingBuddy team will connect your phone number and AI agent to your account within the next 24 hours. You&apos;ll receive a notification when everything is ready to go.
                      </p>
                    </div>
                  </div>
                </div>
                <p className="mt-6 text-xs text-[var(--text-muted)] text-center max-w-sm">
                  Questions? Contact us at support@ringbuddy.ai
                </p>
              </div>
            </div>
          )}

          {/* Not Configured State */}
          {isConfigured === false && !isPendingSetup && (
            <div className="animate-in delay-2">
              <div className="flex flex-col items-center justify-center py-16 px-6 bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)]">
                <div className="w-16 h-16 mb-6 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center">
                  <svg className="w-8 h-8 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Setup Required</h2>
                <p className="text-sm text-[var(--text-muted)] text-center max-w-md mb-6">
                  {configMessage || 'Your organization has not been configured yet. Connect your Square account to get started.'}
                </p>

                {/* Square Error Message */}
                {squareError && (
                  <div className="mb-4 px-4 py-3 bg-[var(--accent-red-muted)] border border-[var(--accent-red)] rounded-lg">
                    <p className="text-sm text-[var(--accent-red)]">{squareError}</p>
                  </div>
                )}

                {/* Connect Square Button */}
                <button
                  onClick={handleConnectSquare}
                  disabled={isConnectingSquare}
                  className="flex items-center gap-3 px-6 py-3 bg-black hover:bg-gray-800 disabled:bg-gray-600 text-white font-medium rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  {isConnectingSquare ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <>
                      {/* Square Logo */}
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4.5 2A2.5 2.5 0 002 4.5v15A2.5 2.5 0 004.5 22h15a2.5 2.5 0 002.5-2.5v-15A2.5 2.5 0 0019.5 2h-15zm0 1.5h15a1 1 0 011 1v15a1 1 0 01-1 1h-15a1 1 0 01-1-1v-15a1 1 0 011-1zm3 4A1.5 1.5 0 006 9v6a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0018 15V9a1.5 1.5 0 00-1.5-1.5h-9z"/>
                      </svg>
                      <span>Connect Square</span>
                    </>
                  )}
                </button>

                <p className="mt-4 text-xs text-[var(--text-muted)] text-center max-w-sm">
                  You&apos;ll be redirected to Square to authorize access to your merchant account.
                </p>
              </div>
            </div>
          )}

          {/* Dashboard Content - Only show when configured */}
          {isConfigured !== false && (
            <>
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
            </>
          )}
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
