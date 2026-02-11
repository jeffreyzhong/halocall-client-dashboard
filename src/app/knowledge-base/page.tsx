'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { SignIn, SignedIn, SignedOut } from '@clerk/nextjs'
import KnowledgeBaseEditor from '@/components/KnowledgeBaseEditor'
import WebsiteCrawlSetup from '@/components/WebsiteCrawlSetup'
import AgentMultiSelect from '@/components/AgentMultiSelect'
import { marked } from 'marked'
import TurndownService from 'turndown'

type PageView = 'loading' | 'list' | 'choose' | 'setup' | 'editor'

interface KnowledgeBaseSummary {
  id: string
  title: string
  sourceUrl?: string
  agentIds: string[]
  hasElevenLabsDoc: boolean
  createdAt: string
  updatedAt: string
}

// Initialize turndown for HTML -> markdown conversion
const turndownService = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
})

// Disable Turndown's escaping of markdown special characters.
// Our content is well-structured HTML from Tiptap, so headings, bold, lists, etc.
// are proper HTML elements that Turndown converts natively — escaping is unnecessary
// and produces broken markdown for downstream LLM consumption.
turndownService.escape = (str: string) => str

// Unescape markdown content that was previously stored with Turndown's escaping
function unescapeMarkdown(text: string): string {
  return text.replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, '$1')
}

export default function KnowledgeBasePage() {
  // View state
  const [view, setView] = useState<PageView>('loading')

  // List state
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseSummary[]>([])

  // Editor state
  const [editingId, setEditingId] = useState<string | null>(null) // null = creating new
  const [docTitle, setDocTitle] = useState('')
  const [editorHtml, setEditorHtml] = useState('')
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([])
  const [sourceUrl, setSourceUrl] = useState<string | undefined>()
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [titleError, setTitleError] = useState(false)
  const editorContentRef = useRef('')

  // Fetch list of knowledge bases
  const fetchList = useCallback(async () => {
    try {
      const response = await fetch('/api/knowledge-base')
      const data = await response.json()

      if (response.ok) {
        setKnowledgeBases(data.knowledgeBases || [])
      }
    } catch (error) {
      console.error('Error fetching knowledge bases:', error)
    } finally {
      setView('list')
    }
  }, [])

  useEffect(() => {
    fetchList()
  }, [fetchList])

  // Open an existing KB for editing
  const openEditor = useCallback(async (kbId: string) => {
    setView('loading')

    try {
      const response = await fetch(`/api/knowledge-base/${kbId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load knowledge base')
      }

      const cleanedContent = unescapeMarkdown(data.content || '')
      const htmlContent = await marked.parse(cleanedContent)

      setEditingId(kbId)
      setDocTitle(data.title || '')
      setEditorHtml(htmlContent)
      editorContentRef.current = htmlContent
      setSelectedAgentIds(data.agentIds || [])
      setSourceUrl(data.sourceUrl)
      setLastSaved(data.updatedAt ? new Date(data.updatedAt).toLocaleString() : null)
      setSaveError(null)
      setSaveSuccess(false)
      setView('editor')
    } catch (error) {
      console.error('Error loading knowledge base:', error)
      setView('list')
    }
  }, [])

  // Reset editor state for a new KB
  const resetEditorState = useCallback(() => {
    setEditingId(null)
    setDocTitle('')
    setEditorHtml('')
    editorContentRef.current = ''
    setSelectedAgentIds([])
    setSourceUrl(undefined)
    setLastSaved(null)
    setSaveError(null)
    setSaveSuccess(false)
  }, [])

  // Show the creation method chooser
  const startNew = useCallback(() => {
    resetEditorState()
    setView('choose')
  }, [resetEditorState])

  // Start creating a new KB via website crawl
  const startNewFromWebsite = useCallback(() => {
    setView('setup')
  }, [])

  // Start creating a new KB manually (blank editor)
  const startNewManual = useCallback(() => {
    setView('editor')
  }, [])

  // Handle content generated from website crawl
  const handleGenerationComplete = useCallback(async (markdownContent: string, generatedSourceUrl: string) => {
    const htmlContent = await marked.parse(markdownContent)
    setEditorHtml(htmlContent)
    editorContentRef.current = htmlContent
    setSourceUrl(generatedSourceUrl)
    setEditingId(null) // new document
    setView('editor')
  }, [])

  // Handle editor content changes
  const handleEditorChange = useCallback((html: string) => {
    editorContentRef.current = html
  }, [])

  // Save knowledge base (create or update)
  const handleSave = useCallback(async () => {
    // Validate title
    if (!docTitle.trim()) {
      setTitleError(true)
      return
    }

    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const markdownContent = turndownService.turndown(editorContentRef.current)

      const payload = {
        title: docTitle.trim(),
        content: markdownContent,
        agentIds: selectedAgentIds,
        sourceUrl,
      }

      let response: Response

      if (editingId) {
        // Update existing
        response = await fetch(`/api/knowledge-base/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        // Create new
        response = await fetch('/api/knowledge-base', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save knowledge base')
      }

      const result = await response.json()

      // If we just created a new one, store its id so future saves are updates
      if (!editingId && result.id) {
        setEditingId(result.id)
      }

      setSaveSuccess(true)
      setLastSaved(new Date().toLocaleString())
      setTimeout(() => setSaveSuccess(false), 4000)
    } catch (error) {
      console.error('Error saving knowledge base:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }, [docTitle, selectedAgentIds, sourceUrl, editingId])

  // Go back to the list
  const goBackToList = useCallback(() => {
    fetchList()
  }, [fetchList])

  // Re-generate from website (keep editing context but re-crawl)
  const handleRegenerate = useCallback(() => {
    setView('setup')
  }, [])

  return (
    <>
      <SignedOut>
        <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
          <SignIn routing="hash" />
        </div>
      </SignedOut>
      <SignedIn>
        <div className="p-6">
          {/* Page header */}
          <div className="mb-6 animate-in">
            <div className="flex items-center justify-between">
              <div>
                <h1
                  className="text-lg font-semibold text-[var(--text-primary)]"
                  style={{ fontFamily: 'var(--font-nunito), system-ui, sans-serif' }}
                >
                  Knowledge Base
                </h1>
                <p className="text-sm text-[var(--text-muted)]">
                  Configure the documents your AI voice agents use to answer calls
                </p>
              </div>

              {/* New KB button - only on list view */}
              {view === 'list' && (
                <button
                  onClick={startNew}
                  className="px-4 py-2 rounded-lg bg-[var(--accent-green)] text-white text-sm font-medium hover:bg-[var(--accent-green-hover)] transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  New Knowledge Base
                </button>
              )}

              {/* Back button - on editor/setup views */}
              {(view === 'editor' || view === 'setup' || view === 'choose') && (
                <button
                  onClick={goBackToList}
                  className="px-4 py-2 rounded-lg border border-[var(--border-subtle)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                  All Documents
                </button>
              )}
            </div>
          </div>

          {/* Loading */}
          {view === 'loading' && (
            <div className="flex items-center justify-center py-20 animate-in delay-1">
              <div className="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* List view */}
          {view === 'list' && (
            <div className="animate-in delay-1">
              {knowledgeBases.length === 0 ? (
                /* Empty state */
                <div className="text-center py-16">
                  <div className="w-14 h-14 rounded-xl bg-[var(--accent-green-muted)] flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-[var(--accent-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                    </svg>
                  </div>
                  <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1" style={{ fontFamily: 'var(--font-nunito), system-ui, sans-serif' }}>
                    No knowledge bases yet
                  </h2>
                  <p className="text-sm text-[var(--text-muted)] mb-5 max-w-sm mx-auto">
                    Create your first knowledge base to give your AI voice agents the information they need to answer calls.
                  </p>
                  <button
                    onClick={startNew}
                    className="px-5 py-2.5 rounded-lg bg-[var(--accent-green)] text-white text-sm font-medium hover:bg-[var(--accent-green-hover)] transition-colors inline-flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Create Knowledge Base
                  </button>
                </div>
              ) : (
                /* KB cards grid */
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {knowledgeBases.map((kb) => (
                    <button
                      key={kb.id}
                      onClick={() => openEditor(kb.id)}
                      className="text-left bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 hover:border-[var(--border-medium)] hover:shadow-sm transition-all group"
                    >
                      {/* Icon + title */}
                      <div className="flex items-start gap-3 mb-3">
                        <div className="w-9 h-9 rounded-lg bg-[var(--accent-green-muted)] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <svg className="w-4.5 h-4.5 text-[var(--accent-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent-green)] transition-colors">
                            {kb.title}
                          </h3>
                          {kb.sourceUrl && (
                            <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                              {kb.sourceUrl}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Meta info */}
                      <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                        {/* Agent count */}
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                          </svg>
                          {kb.agentIds.length} agent{kb.agentIds.length !== 1 ? 's' : ''}
                        </span>

                        {/* Sync status */}
                        {kb.hasElevenLabsDoc ? (
                          <span className="flex items-center gap-1 text-[var(--accent-green)]">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Synced
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[var(--text-muted)]">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                            </svg>
                            Not synced
                          </span>
                        )}

                        {/* Updated date */}
                        <span className="ml-auto">
                          {new Date(kb.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Choose creation method */}
          {view === 'choose' && (
            <div className="animate-in delay-1">
              <div className="max-w-xl mx-auto">
                <div className="text-center mb-6">
                  <div className="w-12 h-12 rounded-xl bg-[var(--accent-green-muted)] flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-[var(--accent-green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]" style={{ fontFamily: 'var(--font-nunito), system-ui, sans-serif' }}>
                    Create a Knowledge Base
                  </h2>
                  <p className="text-sm text-[var(--text-muted)] mt-1.5">
                    Choose how you&apos;d like to get started
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  {/* Import from website */}
                  <button
                    onClick={startNewFromWebsite}
                    className="text-left bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 hover:border-[var(--accent-green)] hover:shadow-sm transition-all group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-blue-muted)] flex items-center justify-center mb-3">
                      <svg className="w-5 h-5 text-[var(--accent-blue)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1 group-hover:text-[var(--accent-green)] transition-colors">
                      Import from Website
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      We&apos;ll crawl your website and use AI to generate a comprehensive knowledge base automatically.
                    </p>
                  </button>

                  {/* Create manually */}
                  <button
                    onClick={startNewManual}
                    className="text-left bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5 hover:border-[var(--accent-green)] hover:shadow-sm transition-all group"
                  >
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-purple-muted,var(--accent-green-muted))] flex items-center justify-center mb-3">
                      <svg className="w-5 h-5 text-[var(--accent-purple,var(--accent-green))]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1 group-hover:text-[var(--accent-green)] transition-colors">
                      Write Manually
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                      Start with a blank document and write your knowledge base content from scratch.
                    </p>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Setup view (website crawl) */}
          {view === 'setup' && (
            <div className="animate-in delay-1">
              <WebsiteCrawlSetup onComplete={handleGenerationComplete} />
            </div>
          )}

          {/* Editor view */}
          {view === 'editor' && (
            <div className="animate-in delay-1 space-y-6">
              {/* Success banner */}
              {saveSuccess && (
                <div className="p-3 rounded-lg bg-[var(--accent-green-muted)] border border-[var(--accent-green)] animate-in">
                  <p className="text-sm text-[var(--accent-green)]">
                    Knowledge base saved successfully{selectedAgentIds.length > 0 ? ` and synced to ${selectedAgentIds.length} agent${selectedAgentIds.length > 1 ? 's' : ''}` : ''}.
                  </p>
                </div>
              )}

              {/* Error banner */}
              {saveError && (
                <div className="p-3 rounded-lg bg-[var(--accent-red-muted)] border border-[var(--accent-red)] animate-in">
                  <p className="text-sm text-[var(--accent-red)]">{saveError}</p>
                </div>
              )}

              {/* Document name field */}
              <div>
                <label htmlFor="doc-title" className="block text-sm font-semibold text-[var(--text-primary)] mb-1.5" style={{ fontFamily: 'var(--font-nunito), system-ui, sans-serif' }}>
                  Document Name <span className="text-[var(--accent-red)]">*</span>
                </label>
                <input
                  id="doc-title"
                  type="text"
                  value={docTitle}
                  onChange={(e) => {
                    setDocTitle(e.target.value)
                    if (titleError) setTitleError(false)
                  }}
                  placeholder="e.g. Serenity Spa Knowledge Base"
                  className={`w-full max-w-md px-3 py-2.5 rounded-lg bg-[var(--bg-card)] border text-[var(--text-primary)] text-sm placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 transition-colors ${
                    titleError
                      ? 'border-[var(--accent-red)] focus:border-[var(--accent-red)] focus:ring-[var(--accent-red)]'
                      : 'border-[var(--border-subtle)] focus:border-[var(--accent-green)] focus:ring-[var(--accent-green)]'
                  }`}
                />
                {titleError && (
                  <p className="text-xs text-[var(--accent-red)] mt-1">A document name is required.</p>
                )}
              </div>

              {/* Editor */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h2
                      className="text-sm font-semibold text-[var(--text-primary)]"
                      style={{ fontFamily: 'var(--font-nunito), system-ui, sans-serif' }}
                    >
                      Content
                    </h2>
                    {lastSaved && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Last saved: {lastSaved}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleRegenerate}
                    className="text-xs text-[var(--accent-blue)] hover:text-[var(--accent-blue-hover)] transition-colors"
                  >
                    Re-generate from website
                  </button>
                </div>
                <KnowledgeBaseEditor
                  initialContent={editorHtml}
                  onChange={handleEditorChange}
                />
              </div>

              {/* Agent association */}
              <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-subtle)] p-5">
                <h2
                  className="text-sm font-semibold text-[var(--text-primary)] mb-1"
                  style={{ fontFamily: 'var(--font-nunito), system-ui, sans-serif' }}
                >
                  Associate with Agents
                </h2>
                <p className="text-xs text-[var(--text-muted)] mb-3">
                  Select which AI voice agents should use this knowledge base
                </p>
                <AgentMultiSelect
                  selectedAgentIds={selectedAgentIds}
                  onChange={setSelectedAgentIds}
                  currentKbId={editingId ?? undefined}
                />
              </div>

              {/* Save button */}
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-lg bg-[var(--accent-green)] text-white text-sm font-medium hover:bg-[var(--accent-green-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Knowledge Base'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </SignedIn>
    </>
  )
}
