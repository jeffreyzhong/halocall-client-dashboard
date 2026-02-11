'use client'

import { useState, useCallback } from 'react'

interface CrawledPage {
  markdown: string
  url: string
  title?: string
}

type GenerationStep = 'idle' | 'crawling' | 'analyzing' | 'complete' | 'error'

interface WebsiteCrawlSetupProps {
  onComplete: (content: string, sourceUrl: string) => void
}

const STEPS = [
  { key: 'crawling', label: 'Crawling your website', description: 'Discovering and reading all pages...' },
  { key: 'analyzing', label: 'Analyzing your content', description: 'Building a comprehensive knowledge base...' },
] as const

export default function WebsiteCrawlSetup({ onComplete }: WebsiteCrawlSetupProps) {
  const [url, setUrl] = useState('')
  const [currentStep, setCurrentStep] = useState<GenerationStep>('idle')
  const [crawlProgress, setCrawlProgress] = useState({ completed: 0, total: 0 })
  const [errorMessage, setErrorMessage] = useState('')

  const isValidUrl = useCallback((urlString: string) => {
    try {
      const parsed = new URL(urlString)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  }, [])

  const handleGenerate = useCallback(async () => {
    if (!isValidUrl(url)) {
      setErrorMessage('Please enter a valid URL (e.g., https://yourbusiness.com)')
      return
    }

    setErrorMessage('')
    setCurrentStep('crawling')
    setCrawlProgress({ completed: 0, total: 0 })

    try {
      // Step 1: Start the crawl
      const crawlResponse = await fetch('/api/knowledge-base/crawl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })

      if (!crawlResponse.ok) {
        const error = await crawlResponse.json()
        throw new Error(error.error || 'Failed to start crawl')
      }

      const { crawlId } = await crawlResponse.json()

      // Step 2: Poll for crawl completion
      let crawledPages: CrawledPage[] = []
      let crawlComplete = false

      while (!crawlComplete) {
        await new Promise((resolve) => setTimeout(resolve, 2000))

        const statusResponse = await fetch(`/api/knowledge-base/crawl/${crawlId}`)

        if (!statusResponse.ok) {
          throw new Error('Failed to check crawl status')
        }

        const status = await statusResponse.json()
        setCrawlProgress({ completed: status.completed || 0, total: status.total || 0 })

        if (status.status === 'completed') {
          crawledPages = status.pages || []
          crawlComplete = true
        } else if (status.status === 'failed' || status.status === 'cancelled') {
          throw new Error('Website crawl failed. Please try again.')
        }
      }

      if (crawledPages.length === 0) {
        throw new Error('No content could be extracted from the website. Please check the URL and try again.')
      }

      // Step 3: Summarize with Gemini
      setCurrentStep('analyzing')

      const summarizeResponse = await fetch('/api/knowledge-base/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crawledPages }),
      })

      if (!summarizeResponse.ok) {
        const error = await summarizeResponse.json()
        throw new Error(error.error || 'Failed to generate knowledge base')
      }

      const { content } = await summarizeResponse.json()

      // Step 4: Complete
      setCurrentStep('complete')

      // Short delay so user sees the completion state
      await new Promise((resolve) => setTimeout(resolve, 500))

      onComplete(content, url)
    } catch (error) {
      console.error('Generation error:', error)
      setCurrentStep('error')
      setErrorMessage(error instanceof Error ? error.message : 'An unexpected error occurred')
    }
  }, [url, isValidUrl, onComplete])

  // URL input form (idle state)
  if (currentStep === 'idle' || currentStep === 'error') {
    return (
      <div className="animate-in">
        <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-8 max-w-xl mx-auto">
          <div className="text-center mb-6">
            {/* Document icon */}
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-green-muted)] flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-[var(--accent-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-nunito), system-ui, sans-serif' }}>
              Set up your Knowledge Base
            </h2>
            <p className="text-sm text-[var(--text-muted)] mt-1.5 max-w-sm mx-auto">
              Enter your website URL and we&apos;ll automatically generate a comprehensive knowledge base for your AI voice agent.
            </p>
          </div>

          {/* Error banner */}
          {currentStep === 'error' && errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-[var(--accent-red-muted)] border border-[var(--accent-red)] animate-in">
              <p className="text-sm text-[var(--accent-red)]">{errorMessage}</p>
            </div>
          )}

          {/* URL input */}
          <div className="space-y-3">
            <div>
              <label htmlFor="website-url" className="block text-sm font-medium text-[var(--text-secondary)] mb-1.5">
                Website URL
              </label>
              <input
                id="website-url"
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value)
                  if (errorMessage) setErrorMessage('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleGenerate()
                }}
                placeholder="https://yourbusiness.com"
                className="w-full px-3 py-2.5 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-green)] focus:ring-1 focus:ring-[var(--accent-green)] transition-colors"
              />
            </div>

            <button
              onClick={handleGenerate}
              disabled={!url.trim()}
              className="w-full px-4 py-2.5 rounded-lg bg-[var(--accent-green)] text-white text-sm font-medium hover:bg-[var(--accent-green-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Generate Knowledge Base
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Progress view (crawling/analyzing state)
  return (
    <div className="animate-in">
      <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-8 max-w-xl mx-auto">
        <div className="text-center mb-6">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-nunito), system-ui, sans-serif' }}>
            Generating your Knowledge Base
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            This usually takes 1&ndash;2 minutes
          </p>
        </div>

        {/* Progress steps */}
        <div className="space-y-4">
          {STEPS.map((step, index) => {
            const stepKey = step.key as GenerationStep
            const isActive = currentStep === stepKey
            const isCompleted =
              (stepKey === 'crawling' && (currentStep === 'analyzing' || currentStep === 'complete')) ||
              (stepKey === 'analyzing' && currentStep === 'complete')

            return (
              <div key={step.key} className="flex items-start gap-3">
                {/* Step indicator */}
                <div className="mt-0.5 flex-shrink-0">
                  {isCompleted ? (
                    <div className="w-6 h-6 rounded-full bg-[var(--accent-green)] flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : isActive ? (
                    <div className="w-6 h-6 rounded-full border-2 border-[var(--accent-green)] flex items-center justify-center">
                      <div className="w-3 h-3 border-2 border-[var(--accent-green)] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-[var(--border-subtle)] flex items-center justify-center">
                      <span className="text-xs text-[var(--text-muted)]">{index + 1}</span>
                    </div>
                  )}
                </div>

                {/* Step content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isActive || isCompleted ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>
                    {step.label}
                    {isActive && stepKey === 'crawling' && crawlProgress.total > 0 && (
                      <span className="ml-2 text-[var(--text-muted)] font-normal">
                        ({crawlProgress.completed}/{crawlProgress.total} pages)
                      </span>
                    )}
                  </p>
                  {isActive && (
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">{step.description}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Animated progress bar */}
        <div className="mt-6 h-1 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
          <div
            className="h-full bg-[var(--accent-green)] rounded-full transition-all duration-500 ease-out"
            style={{
              width:
                currentStep === 'crawling'
                  ? '40%'
                  : currentStep === 'analyzing'
                  ? '80%'
                  : currentStep === 'complete'
                  ? '100%'
                  : '0%',
            }}
          />
        </div>
      </div>
    </div>
  )
}
