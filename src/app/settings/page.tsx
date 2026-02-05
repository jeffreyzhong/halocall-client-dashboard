'use client'

import { useState, useEffect, useCallback } from 'react'
import { SignIn, SignedIn, SignedOut } from '@clerk/nextjs'

interface SquareIntegration {
  connected: boolean
  merchantId?: string
  isSandbox?: boolean
  isActive?: boolean
  merchantType?: string
  locationsCount?: number
  connectedAt?: string
  updatedAt?: string
}

interface Integrations {
  square: SquareIntegration
}

export default function SettingsPage() {
  const [integrations, setIntegrations] = useState<Integrations | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const fetchIntegrations = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations')
      const data = await response.json()

      if (response.ok) {
        setIntegrations(data.integrations)
      } else {
        setError(data.error || 'Failed to load integrations')
      }
    } catch {
      setError('Failed to load integrations')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchIntegrations()
  }, [fetchIntegrations])

  // Check for Square OAuth callback results
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const squareConnected = params.get('square_connected')
    const squareError = params.get('square_error')
    const errorDescription = params.get('square_error_description')

    if (squareConnected === 'true') {
      setSuccessMessage('Square connected successfully!')
      fetchIntegrations()
      window.history.replaceState({}, '', window.location.pathname)
    } else if (squareError) {
      setError(errorDescription || 'Failed to connect Square account')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [fetchIntegrations])

  const handleConnectSquare = async () => {
    setIsConnecting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/square/authorize')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start Square authorization')
      }

      window.location.href = data.authUrl
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Square')
      setIsConnecting(false)
    }
  }

  const handleDisconnectSquare = async () => {
    if (!confirm('Are you sure you want to disconnect Square? You will need to re-authorize to use Square features again.')) {
      return
    }

    setIsDisconnecting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const response = await fetch('/api/square/disconnect', {
        method: 'POST',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to disconnect Square')
      }

      setSuccessMessage('Square disconnected successfully')
      fetchIntegrations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Square')
    } finally {
      setIsDisconnecting(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <>
      <SignedOut>
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
          <SignIn routing="hash" />
        </div>
      </SignedOut>

      <SignedIn>
        <div className="p-6 max-w-4xl">
          {/* Header */}
          <div className="mb-8 animate-in">
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">Settings</h1>
            <p className="text-sm text-[var(--text-muted)]">Manage your account and integrations</p>
          </div>

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 px-4 py-3 bg-[var(--accent-green-muted)] border border-[var(--accent-green)] rounded-lg animate-in">
              <p className="text-sm text-[var(--accent-green)]">{successMessage}</p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-6 px-4 py-3 bg-[var(--accent-red-muted)] border border-[var(--accent-red)] rounded-lg animate-in">
              <p className="text-sm text-[var(--accent-red)]">{error}</p>
            </div>
          )}

          {/* Integrations Section */}
          <section className="animate-in delay-1">
            <h2 className="text-base font-medium text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              Integrations
            </h2>

            <div className="bg-[var(--bg-secondary)] rounded-xl border border-[var(--border-subtle)]">
              {/* Square Integration */}
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {/* Square Logo */}
                    <div className="w-12 h-12 rounded-lg bg-[#006AFF] flex items-center justify-center flex-shrink-0">
                      <svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4.5 2A2.5 2.5 0 002 4.5v15A2.5 2.5 0 004.5 22h15a2.5 2.5 0 002.5-2.5v-15A2.5 2.5 0 0019.5 2h-15zm0 1.5h15a1 1 0 011 1v15a1 1 0 01-1 1h-15a1 1 0 01-1-1v-15a1 1 0 011-1zm3 4A1.5 1.5 0 006 9v6a1.5 1.5 0 001.5 1.5h9A1.5 1.5 0 0018 15V9a1.5 1.5 0 00-1.5-1.5h-9z"/>
                      </svg>
                    </div>

                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-medium text-[var(--text-primary)]">Square</h3>
                        {isLoading ? (
                          <span className="text-xs text-[var(--text-muted)]">Loading...</span>
                        ) : integrations?.square?.connected ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-green-muted)] text-[var(--accent-green)]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]" />
                            Connected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
                            Not connected
                          </span>
                        )}
                        {integrations?.square?.isSandbox && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-yellow-muted)] text-[var(--accent-yellow)]">
                            Sandbox
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-[var(--text-muted)]">
                        Connect your Square account to sync orders, payments, and customer data.
                      </p>

                      {/* Integration Details */}
                      {integrations?.square?.connected && (
                        <div className="mt-4 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs text-[var(--text-muted)]">Merchant ID</p>
                            <p className="text-sm text-[var(--text-secondary)] font-mono">{integrations.square.merchantId}</p>
                          </div>
                          <div>
                            <p className="text-xs text-[var(--text-muted)]">Locations</p>
                            <p className="text-sm text-[var(--text-secondary)]">{integrations.square.locationsCount} synced</p>
                          </div>
                          {integrations.square.connectedAt && (
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">Connected</p>
                              <p className="text-sm text-[var(--text-secondary)]">{formatDate(integrations.square.connectedAt)}</p>
                            </div>
                          )}
                          {integrations.square.updatedAt && (
                            <div>
                              <p className="text-xs text-[var(--text-muted)]">Last Updated</p>
                              <p className="text-sm text-[var(--text-secondary)]">{formatDate(integrations.square.updatedAt)}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 ml-4">
                    {isLoading ? (
                      <div className="w-24 h-9 bg-[var(--bg-tertiary)] rounded-lg animate-pulse" />
                    ) : integrations?.square?.connected ? (
                      <>
                        <button
                          onClick={handleConnectSquare}
                          disabled={isConnecting}
                          className="px-4 py-2 text-sm font-medium text-[var(--text-primary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-hover)] rounded-lg transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isConnecting ? 'Connecting...' : 'Re-authorize'}
                        </button>
                        <button
                          onClick={handleDisconnectSquare}
                          disabled={isDisconnecting}
                          className="px-4 py-2 text-sm font-medium text-[var(--accent-red)] bg-[var(--accent-red-muted)] hover:bg-[var(--accent-red)] hover:text-white rounded-lg transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={handleConnectSquare}
                        disabled={isConnecting}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-[#006AFF] hover:bg-[#0056D6] rounded-lg transition-colors disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {isConnecting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            Connect
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </SignedIn>
    </>
  )
}
