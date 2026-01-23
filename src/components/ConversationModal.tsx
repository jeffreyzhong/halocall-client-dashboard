'use client';

import { useEffect, useState, useRef } from 'react';

interface ToolCall {
  tool_name: string;
  params_as_json: string;
  request_id: string;
}

interface ToolResult {
  tool_name: string;
  result_value: string;
  request_id: string;
  error_message?: string;
}

interface TranscriptMessage {
  role: 'user' | 'agent';
  message: string;
  time_in_call_secs: number;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
}

interface ConversationDetails {
  conversation_id: string;
  agent_id: string;
  agent_name: string | null;
  status: string;
  call_successful: 'success' | 'failure' | 'unknown';
  start_time_unix_secs: number;
  call_duration_secs: number;
  caller_phone_number: string | null;
  transcript: TranscriptMessage[];
  analysis?: {
    transcript_summary?: string;
    evaluation_criteria_results?: Record<string, { result: string; rationale: string }>;
    data_collection_results?: Record<string, { value: string; rationale: string }>;
  } | null;
  agent_names?: Record<string, string>;
}

interface ConversationModalProps {
  conversationId: string | null;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(unixSecs: number): string {
  const date = new Date(unixSecs * 1000);
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatTimeInCall(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function getStatusBadge(callSuccessful: 'success' | 'failure' | 'unknown') {
  switch (callSuccessful) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--accent-green-muted)] text-[var(--accent-green)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]" />
          Success
        </span>
      );
    case 'failure':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--accent-red-muted)] text-[var(--accent-red)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-red)]" />
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
          Unknown
        </span>
      );
  }
}

// Helper to extract transfer_to_agent info from nested result structure
interface TransferInfo {
  found: boolean;
  reason: string;
  fromAgent: string;
  toAgent: string;
  success: boolean;
  error?: string;
}

function extractTransferInfo(toolCall: ToolCall, toolResult?: ToolResult): TransferInfo | null {
  // First check if this is a direct transfer_to_agent call
  if (toolCall.tool_name === 'transfer_to_agent') {
    let params: { reason?: string; agent_id?: string } = {};
    try {
      params = JSON.parse(toolCall.params_as_json || '{}');
    } catch {
      // Ignore
    }

    let resultData: { from_agent?: string; to_agent?: string; status?: string } = {};
    try {
      if (toolResult?.result_value) {
        resultData = JSON.parse(toolResult.result_value);
      }
    } catch {
      // Ignore
    }

    return {
      found: true,
      reason: params.reason || 'No reason provided',
      fromAgent: resultData.from_agent || '',
      toAgent: resultData.to_agent || params.agent_id || '',
      success: !toolResult?.error_message && resultData.status === 'success',
      error: toolResult?.error_message,
    };
  }

  // Check if result contains nested transfer_to_agent in steps structure
  if (toolResult?.result_value) {
    try {
      const resultData = JSON.parse(toolResult.result_value);
      
      // Look for steps → requests/results structure
      if (resultData.steps && Array.isArray(resultData.steps)) {
        for (const step of resultData.steps) {
          // Check requests for transfer_to_agent
          if (step.requests && Array.isArray(step.requests)) {
            for (const request of step.requests) {
              if (request.tool_name === 'transfer_to_agent') {
                // Found a transfer! Get the corresponding result
                let transferResult = null;
                if (step.results && Array.isArray(step.results)) {
                  transferResult = step.results.find(
                    (r: { request_id?: string }) => r.request_id === request.request_id
                  );
                }

                let params: { reason?: string } = {};
                try {
                  params = JSON.parse(request.params_as_json || '{}');
                } catch {
                  // Ignore
                }

                let resultInfo: { from_agent?: string; to_agent?: string; status?: string } = {};
                if (transferResult?.result_value) {
                  try {
                    resultInfo = typeof transferResult.result_value === 'string' 
                      ? JSON.parse(transferResult.result_value) 
                      : transferResult.result_value;
                  } catch {
                    // Ignore
                  }
                }
                // Also check the result object directly
                if (transferResult?.result) {
                  resultInfo = transferResult.result;
                }

                return {
                  found: true,
                  reason: params.reason || 'No reason provided',
                  fromAgent: resultInfo.from_agent || '',
                  toAgent: resultInfo.to_agent || '',
                  success: !transferResult?.is_error && resultInfo.status === 'success',
                  error: transferResult?.is_error ? 'Transfer failed' : undefined,
                };
              }
            }
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return null;
}

// Special display for transfer_to_agent tool calls
function TransferAgentMessage({
  transferInfo,
  agentNames,
}: {
  transferInfo: TransferInfo;
  agentNames: Record<string, string>;
}) {
  const { reason, fromAgent, toAgent, success, error } = transferInfo;
  const failed = !!error;

  const fromAgentName = fromAgent ? (agentNames[fromAgent] || fromAgent) : 'Unknown Agent';
  const toAgentName = toAgent ? (agentNames[toAgent] || toAgent) : 'Unknown Agent';

  return (
    <div className="mx-4 my-3">
      <div
        className={`rounded-xl border-2 border-dashed p-4 ${
          failed
            ? 'border-[var(--accent-red)]/40 bg-[var(--accent-red-muted)]'
            : success
            ? 'border-[var(--accent-blue)]/40 bg-[var(--accent-blue-muted)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center ${
              failed
                ? 'bg-[var(--accent-red)]/20'
                : 'bg-[var(--accent-blue)]/20'
            }`}
          >
            <svg
              className={`w-3.5 h-3.5 ${
                failed ? 'text-[var(--accent-red)]' : 'text-[var(--accent-blue)]'
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
              />
            </svg>
          </div>
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Agent Transfer
          </span>
          {failed ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-red)]/20 text-[var(--accent-red)] font-medium">
              Failed
            </span>
          ) : success ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent-blue)]/20 text-[var(--accent-blue)] font-medium">
              Transferred
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)] font-medium">
              Pending
            </span>
          )}
        </div>

        {/* Transfer Flow */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-muted)] block">From</span>
            <span className="text-sm font-medium text-[var(--text-primary)]">{fromAgentName}</span>
          </div>
          <div className="flex-shrink-0">
            <svg
              className={`w-5 h-5 ${failed ? 'text-[var(--accent-red)]' : 'text-[var(--accent-blue)]'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>
          <div className="flex-1 px-3 py-2 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-subtle)]">
            <span className="text-xs text-[var(--text-muted)] block">To</span>
            <span className="text-sm font-medium text-[var(--text-primary)]">{toAgentName}</span>
          </div>
        </div>

        {/* Reason */}
        <div className="px-3 py-2 rounded-lg bg-[var(--bg-primary)]/50">
          <span className="text-xs text-[var(--text-muted)] block mb-1">Reason</span>
          <p className="text-sm text-[var(--text-secondary)]">{reason}</p>
        </div>

        {/* Error message if failed */}
        {failed && error && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-[var(--accent-red)]/10 border border-[var(--accent-red)]/20">
            <span className="text-xs text-[var(--accent-red)] font-medium block mb-1">Error</span>
            <p className="text-sm text-[var(--accent-red)]">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallMessage({ toolCall, toolResult }: { toolCall: ToolCall; toolResult?: ToolResult }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const success = toolResult && !toolResult.error_message;
  const failed = toolResult?.error_message;

  let params = {};
  try {
    params = JSON.parse(toolCall.params_as_json || '{}');
  } catch {
    // Ignore parse errors
  }

  return (
    <div className="mx-4 my-2">
      <div
        className={`rounded-lg border transition-all ${
          failed
            ? 'border-[var(--accent-red)]/30 bg-[var(--accent-red-muted)]'
            : success
            ? 'border-[var(--accent-green)]/30 bg-[var(--accent-green-muted)]'
            : 'border-[var(--border-subtle)] bg-[var(--bg-tertiary)]'
        }`}
      >
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                failed
                  ? 'bg-[var(--accent-red)]/20'
                  : success
                  ? 'bg-[var(--accent-green)]/20'
                  : 'bg-[var(--bg-hover)]'
              }`}
            >
              <svg
                className={`w-4 h-4 ${
                  failed
                    ? 'text-[var(--accent-red)]'
                    : success
                    ? 'text-[var(--accent-green)]'
                    : 'text-[var(--text-muted)]'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-[var(--text-primary)] font-mono">
                  {toolCall.tool_name}
                </span>
                {failed ? (
                  <span className="text-xs text-[var(--accent-red)] font-medium">Failed</span>
                ) : success ? (
                  <span className="text-xs text-[var(--accent-green)] font-medium">Success</span>
                ) : (
                  <span className="text-xs text-[var(--text-muted)]">Pending</span>
                )}
              </div>
              <span className="text-xs text-[var(--text-muted)]">Tool Call</span>
            </div>
          </div>
          <svg
            className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 pt-0 border-t border-[var(--border-subtle)]/50">
            <div className="mt-3 space-y-3">
              {Object.keys(params).length > 0 && (
                <div>
                  <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    Parameters
                  </span>
                  <pre className="mt-1 p-2 rounded bg-[var(--bg-primary)] text-xs font-mono text-[var(--text-secondary)] overflow-x-auto">
                    {JSON.stringify(params, null, 2)}
                  </pre>
                </div>
              )}
              {toolResult && (
                <div>
                  <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                    {toolResult.error_message ? 'Error' : 'Result'}
                  </span>
                  <pre
                    className={`mt-1 p-2 rounded text-xs font-mono overflow-x-auto ${
                      toolResult.error_message
                        ? 'bg-[var(--accent-red)]/10 text-[var(--accent-red)]'
                        : 'bg-[var(--bg-primary)] text-[var(--text-secondary)]'
                    }`}
                  >
                    {toolResult.error_message || toolResult.result_value || 'No result'}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConversationModal({ conversationId, onClose }: ConversationModalProps) {
  const [conversation, setConversation] = useState<ConversationDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) return;

    const fetchConversation = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/conversations/${conversationId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch conversation details');
        }
        const data = await response.json();
        setConversation(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchConversation();
  }, [conversationId]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!conversationId) return null;

  // Build a map of tool results by request_id for quick lookup
  const toolResultsMap = new Map<string, ToolResult>();
  conversation?.transcript.forEach((msg) => {
    msg.tool_results?.forEach((result) => {
      toolResultsMap.set(result.request_id, result);
    });
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full h-full max-w-4xl max-h-[90vh] mx-4 my-4 bg-[var(--bg-secondary)] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-modal-in">
        {/* Header */}
        <div className="flex-none px-6 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                  {isLoading ? 'Loading...' : conversation?.caller_phone_number || 'Unknown Caller'}
                </h2>
                {!isLoading && conversation && (
                  <p className="text-sm text-[var(--text-muted)]">
                    {formatTime(conversation.start_time_unix_secs)} · {formatDuration(conversation.call_duration_secs)}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isLoading && conversation && getStatusBadge(conversation.call_successful)}
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                aria-label="Close"
              >
                <svg
                  className="w-5 h-5 text-[var(--text-secondary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                <span className="text-[var(--text-muted)]">Loading conversation...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--accent-red-muted)] flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-[var(--accent-red)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                    />
                  </svg>
                </div>
                <p className="text-[var(--text-secondary)]">{error}</p>
              </div>
            </div>
          ) : conversation ? (
            <>
              {/* Summary Banner (if available) */}
              {conversation.analysis?.transcript_summary && (
                <div className="flex-none px-6 py-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)]">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[var(--accent-blue-muted)] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg
                        className="w-3.5 h-3.5 text-[var(--accent-blue)]"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z"
                        />
                      </svg>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">
                        AI Summary
                      </span>
                      <p className="mt-1 text-sm text-[var(--text-secondary)]">
                        {conversation.analysis.transcript_summary}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Transcript */}
              <div
                ref={transcriptRef}
                className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
              >
                {conversation.transcript.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-[var(--text-muted)]">No transcript available</p>
                  </div>
                ) : (
                  conversation.transcript.map((msg, index) => (
                    <div key={index}>
                      {/* Regular message */}
                      {msg.message && (
                        <div
                          className={`flex ${
                            msg.role === 'user' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <div
                            className={`max-w-[75%] ${
                              msg.role === 'user' ? 'order-2' : 'order-1'
                            }`}
                          >
                            <div
                              className={`px-4 py-3 rounded-2xl ${
                                msg.role === 'user'
                                  ? 'bg-[var(--accent-blue)] text-white rounded-br-md'
                                  : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] rounded-bl-md'
                              }`}
                            >
                              <p className="text-sm leading-relaxed">{msg.message}</p>
                            </div>
                            <div
                              className={`mt-1 flex items-center gap-2 text-xs text-[var(--text-muted)] ${
                                msg.role === 'user' ? 'justify-end' : 'justify-start'
                              }`}
                            >
                              <span>{msg.role === 'user' ? 'Caller' : 'Agent'}</span>
                              <span>·</span>
                              <span>{formatTimeInCall(msg.time_in_call_secs)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tool calls */}
                      {msg.tool_calls?.map((toolCall) => {
                        const toolResult = toolResultsMap.get(toolCall.request_id);
                        const transferInfo = extractTransferInfo(toolCall, toolResult);
                        
                        if (transferInfo) {
                          return (
                            <TransferAgentMessage
                              key={toolCall.request_id}
                              transferInfo={transferInfo}
                              agentNames={conversation.agent_names || {}}
                            />
                          );
                        }
                        
                        return (
                          <ToolCallMessage
                            key={toolCall.request_id}
                            toolCall={toolCall}
                            toolResult={toolResult}
                          />
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <style jsx>{`
        @keyframes modal-in {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        .animate-modal-in {
          animation: modal-in 0.2s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
