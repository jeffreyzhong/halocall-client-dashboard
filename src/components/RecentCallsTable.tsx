'use client';

import { useState, useEffect } from 'react';

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

interface RecentCallsTableProps {
  conversations: Conversation[]
  isLoading: boolean
  onConversationClick?: (conversationId: string) => void
}

const PAGE_SIZE = 10;

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatTime(unixSecs: number): string {
  const date = new Date(unixSecs * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  
  if (isToday) {
    return `Today, ${time}`;
  } else if (isYesterday) {
    return `Yesterday, ${time}`;
  } else {
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${dateStr}, ${time}`;
  }
}

function getStatusBadge(callSuccessful: 'success' | 'failure' | 'unknown') {
  switch (callSuccessful) {
    case 'success':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-green-muted)] text-[var(--accent-green)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-green)]" />
          Success
        </span>
      );
    case 'failure':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-red-muted)] text-[var(--accent-red)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-red)]" />
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)]" />
          Unknown
        </span>
      );
  }
}

export default function RecentCallsTable({ conversations, isLoading, onConversationClick }: RecentCallsTableProps) {
  const [currentPage, setCurrentPage] = useState(1);

  // Sort conversations by most recent first
  const sortedConversations = [...conversations].sort(
    (a, b) => b.start_time_unix_secs - a.start_time_unix_secs
  );

  const totalPages = Math.ceil(sortedConversations.length / PAGE_SIZE);
  
  // Reset to page 1 when conversations change
  useEffect(() => {
    setCurrentPage(1);
  }, [conversations]);

  // Get current page's conversations
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedConversations = sortedConversations.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      if (currentPage > 3) {
        pages.push('ellipsis');
      }
      
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      if (currentPage < totalPages - 2) {
        pages.push('ellipsis');
      }
      
      pages.push(totalPages);
    }
    
    return pages;
  };

  return (
    <div className="rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Recent Calls</h3>
        {sortedConversations.length > 0 && (
          <span className="text-xs text-[var(--text-muted)]">
            {startIndex + 1}–{Math.min(endIndex, sortedConversations.length)} of {sortedConversations.length}
          </span>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border-subtle)]">
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Caller</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Duration</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Status</th>
              <th className="text-left px-5 py-3 text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">Time</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-[var(--text-muted)] border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-[var(--text-muted)]">Loading calls...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedConversations.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center">
                  <p className="text-sm text-[var(--text-muted)]">No calls yet</p>
                </td>
              </tr>
            ) : (
              paginatedConversations.map((conv) => (
                <tr 
                  key={conv.conversation_id} 
                  className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                  onClick={() => onConversationClick?.(conv.conversation_id)}
                >
                  <td className="px-5 py-3">
                    <span className="text-sm text-[var(--text-primary)]">
                      {conv.caller_phone_number || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-sm text-[var(--text-secondary)]">
                      {formatDuration(conv.call_duration_secs)}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    {getStatusBadge(conv.call_successful)}
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-sm text-[var(--text-muted)]">
                      {formatTime(conv.start_time_unix_secs)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && !isLoading && (
        <div className="px-5 py-3 border-t border-[var(--border-subtle)] flex items-center justify-center gap-1">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {getPageNumbers().map((page, index) => (
            page === 'ellipsis' ? (
              <span key={`ellipsis-${index}`} className="px-2 text-[var(--text-muted)]">...</span>
            ) : (
              <button
                key={page}
                onClick={() => goToPage(page)}
                className={`min-w-[32px] h-8 px-2 rounded text-sm font-medium transition-colors ${
                  currentPage === page
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                {page}
              </button>
            )
          ))}

          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-1.5 rounded hover:bg-[var(--bg-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <svg className="w-4 h-4 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
